import { databaseUnavailableMessage, initializeDatabase } from "./database.js";
import { COUNTRIES, countrySearchText, findCountry, flagForCountry } from "./countries.js";
import { normalizeRoute, parseBeerDetailRoute, parseBeerEditRoute, readRouteWithQuery } from "./route-utils.mjs";
import { overlayManager } from "./overlay-manager.mjs";
import { renderFiveOptionRating, renderFiveOptionSummary } from "./five-option-rating.mjs";
import { normalizeTagName, splitTagInput } from "./tag-repository.js";
import { localDataAdapter } from "./local-data-adapter.js";
import { updateFilterSheetPreservingScroll } from "./filter-sheet-scroll.mjs";
import { App } from "@capacitor/app";

const app = document.querySelector("#route-content");
const overlayRoot = document.querySelector("#overlay-root");
const appLogo = document.querySelector("#app-logo");
const bottomNavigation = document.querySelector("[data-app-bottom-nav]");
const HOME = "/beers";
const CATEGORIES = ["拉格", "艾尔"];
const STYLES = { 拉格: ["皮尔森", "淡色拉格", "黑拉格"], 艾尔: ["IPA", "小麦啤酒", "世涛"] };
let dbError = null;
let renderSerial = 0;
let exitArmedUntil = 0;
let filters = { query: "", category: "", style: "", country_code: "", country_name: "", min_rating: "", max_rating: "", mouthfeel_rating: "", tag_ids: [], tag_match: "and", has_photo: "", order: "created" };
let tastingFilters = { query: "", period: "all" };
const pendingFiles = new WeakMap();
let toastTimer = null;
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const route = () => readRouteWithQuery(window.location, HOME);
const money = (value) => value === "" || value === null || value === undefined ? "未记录" : `¥${Number(value).toFixed(2)}`;
const displayDate = (value) => value ? new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" }) : "未记录";
const localDateTime = (value = new Date()) => { const d = value instanceof Date ? value : new Date(value); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const stars = (value, max = 5) => value === "" || value === null || value === undefined ? "未评分" : `${"★".repeat(Math.min(max, Number(value)))}${"☆".repeat(Math.max(0, max - Number(value)))}`;
function showToast(message) {
  let toast = document.querySelector("[data-app-toast]");
  if (!toast) { toast = document.createElement("div"); toast.className = "app-toast"; toast.dataset.appToast = ""; document.body.append(toast); }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function navigate(path, replace = false) { const target = `#${path}`; if (replace) window.history.replaceState({}, "", target); else window.history.pushState({}, "", target); render(); }
function shell(content, title = "", subtitle = "") {
  const hasRouteHeading = /<h1(?:\s|>)/i.test(content);
  const fallbackHeading = !hasRouteHeading && title ? routeHeader(title, subtitle) : "";
  return `<div class="page-shell">${fallbackHeading}${content}</div>`;
}
function routeHeader(title, subtitle = "", eyebrow = "BEER JOURNAL") { return `<section class="screen-heading" data-route-hero><p class="screen-kicker">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</section>`; }
function button(label, path, className = "") { return `<a class="button ${className}" href="#${path}" data-route="${path}">${esc(label)}</a>`; }
function emptyState(icon, title, text, action = "") { return `<section class="empty-state app-card"><span class="empty-icon">${icon}</span><h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</section>`; }
function pageBack(path = HOME, label = "") {
  const resolvedLabel = label || (path === HOME ? "返回我的啤酒" : path === "/profile" ? "返回个人数据" : path === "/tastings" || path.startsWith("/tastings/") ? "返回饮用记录" : path.startsWith("/beers/") ? "返回啤酒档案" : "返回");
  return `<button type="button" class="back-link" data-back-path="${path}">← ${esc(resolvedLabel)}</button>`;
}

const shellDebug = { logoNode: appLogo, headerNode: document.querySelector("[data-app-header]"), bottomNavigationNode: bottomNavigation, routeContentNode: app, navigationCount: 0 };
globalThis.__BEER_JOURNAL_SHELL_DEBUG__ = shellDebug;
function verifyShellStability() { return shellDebug.logoNode === document.querySelector("#app-logo") && shellDebug.headerNode === document.querySelector("[data-app-header]") && shellDebug.bottomNavigationNode === document.querySelector("[data-app-bottom-nav]") && shellDebug.routeContentNode === document.querySelector("#route-content"); }
function verifyRouteStructure() {
  const headings = app?.querySelectorAll("h1") || [];
  const heroes = app?.querySelectorAll(".screen-heading, .collection-hero, .journal-hero, .profile-insight-hero, .beer-profile-hero, .diary-hero") || [];
  const backLinks = app?.querySelectorAll(".back-link, [data-back-path]") || [];
  const valid = headings.length === 1 && heroes.length === 1 && backLinks.length <= 1;
  if (!valid && globalThis.__BEER_JOURNAL_DEBUG__) console.warn("Route structure check failed", { headings: headings.length, heroes: heroes.length, backLinks: backLinks.length });
  return valid;
}
async function preloadLogo() { if (!appLogo) return; appLogo.loading = "eager"; appLogo.decoding = "async"; if (appLogo.decode) await appLogo.decode().catch(() => {}); }

function tagPills(tags = []) { return tags.length ? `<div class="tag-list collection-tag-list">${tags.slice(0, 3).map((tag) => `<span class="tag tag-pill tag-custom">✦ ${esc(tag.name || tag)}</span>`).join("")}</div>` : `<span class="muted">暂无风味标签</span>`; }
function tagEditor(tags = []) {
  const names = tags.map((tag) => typeof tag === "string" ? tag : tag.name).filter(Boolean);
  return `<section class="tag-editor app-card" data-tag-editor data-tags="${esc(JSON.stringify(names))}"><div class="section-heading"><h2>风味标签</h2><span>可自由添加多个标签</span></div><div class="tag-list" data-tag-chips>${names.map((name) => `<span class="tag tag-pill">${esc(name)} <button type="button" class="tag-remove" data-remove-tag="${esc(name)}" aria-label="删除标签">×</button><input type="hidden" name="flavor_tags" value="${esc(name)}"></span>`).join("")}</div><div class="tag-entry"><input type="search" data-tag-input placeholder="输入后回车添加" autocomplete="off"><button type="button" class="button button-secondary" data-add-tag>添加</button></div><div class="tag-suggestions" data-tag-suggestions hidden></div></section>`;
}
function photoGallery(photos = [], editable = false, ownerType = "", ownerId = "") {
  return `<section class="beer-edit-photos app-card" data-photo-section data-owner-type="${esc(ownerType)}" data-owner-id="${esc(ownerId)}"><div class="section-heading"><h2>照片</h2>${editable ? `<span>支持多张照片</span>` : ""}</div><div class="photo-grid" data-photo-grid>${photos.map((photo) => `<figure class="photo-item" data-photo-id="${esc(photo.id)}"><img data-photo-path="${esc(photo.local_path || "")}" alt="啤酒照片" draggable="false"><div class="photo-item-actions">${editable ? `<button type="button" class="photo-remove-button" data-photo-delete="${esc(photo.id)}" aria-label="删除照片">×</button><button type="button" class="photo-cover-button" data-photo-cover="${esc(photo.id)}">${photo.is_cover ? "封面" : "设为封面"}</button>` : ""}</div></figure>`).join("")}</div>${editable ? `<div class="photo-actions"><label class="photo-upload-card"><span aria-hidden="true">＋</span><strong>添加照片</strong><small>从相册选择</small><input type="file" accept="image/*" multiple data-photo-input hidden></label><button class="button button-secondary" type="button" data-camera-photo>拍照</button></div>` : ""}</section>`;
}
function hydratePhotoImages(root = document) { root.querySelectorAll("img[data-photo-path]").forEach(async (img) => { try { img.src = await localDataAdapter.readDataUrl(img.dataset.photoPath); img.classList.add("is-loaded"); } catch { img.classList.add("is-missing"); } }); }
async function savePendingPhotos(form, ownerType, ownerId) { const files = pendingFiles.get(form) || []; for (const file of files) await localDataAdapter.addPhoto({ ownerType, ownerId, source: file }); pendingFiles.delete(form); }
function removePendingPhoto(form, index) {
  const files = pendingFiles.get(form) || [];
  pendingFiles.set(form, files.filter((_, fileIndex) => fileIndex !== index));
}
function appendPendingPhotoPreview(form, source, index) {
  const grid = form?.querySelector("[data-photo-grid]");
  if (!grid) return;
  const figure = document.createElement("figure");
  figure.className = "photo-item photo-item--pending";
  figure.innerHTML = `<img alt="已添加照片" draggable="false"><button type="button" class="photo-remove-button" data-photo-pending-delete="${index}" aria-label="移除照片">×</button>`;
  const image = figure.querySelector("img");
  image.src = typeof source === "string" ? source : (source.previewDataUrl || URL.createObjectURL(source));
  grid.append(figure);
}

function beerCard(beer) {
  const country = findCountry(beer.country_code, beer.country_name);
  const score = beer.average_rating ?? beer.overall_rating;
  const statuses = [beer.is_recently_tasted ? `<span class="collection-status status-recent">最近品饮</span>` : "", beer.is_highly_rated ? `<span class="collection-status status-score">高评分</span>` : "", beer.is_new_collection ? `<span class="collection-status status-new">新收藏</span>` : ""].join("");
  return `<article class="collection-card app-card"><a class="collection-card-link" href="#/beers/${beer.id}" data-route="/beers/${beer.id}" aria-label="查看 ${esc(beer.name)}"><div class="collection-image-frame">${beer.cover_photo ? `<img class="collection-image progressive-image" data-photo-path="${esc(beer.cover_photo.local_path)}" alt="${esc(beer.name)} 酒标或照片" draggable="false">` : `<div class="image-placeholder collection-placeholder"><span>⌁</span><small>等待酒标照片</small></div>`}${statuses ? `<div class="collection-statuses">${statuses}</div>` : ""}</div><div class="collection-card-body"><h2>${esc(beer.name)}</h2><p class="collection-brand">${esc(beer.brand || "未填写品牌")}</p><p class="meta-line collection-country">${country.flag} ${esc(country.name)}</p><p class="collection-style">${esc(beer.category || "未分类")} · ${esc(beer.style || "未填写类型")}</p><div class="collection-rating"><span class="rating-star" aria-hidden="true">★</span><strong>${score === "" || score === null || score === undefined ? "—" : Number(score).toFixed(1)}</strong><small>${score === "" || score === null || score === undefined ? "暂未评分" : "平均评分"}</small></div>${tagPills(beer.flavor_tags)}<p class="collection-tasting-count">${beer.tasting_count ?? 0} 次品饮</p></div></a></article>`;
}

function ratingSummary(beer) { return `<section class="detail-section"><div class="section-heading"><h2>我的风格评价</h2><span>长期资料</span></div><article class="panel experience-panel">${renderFiveOptionSummary("mouthfeel_rating", beer.mouthfeel_rating)}${renderFiveOptionSummary("bitterness_rating", beer.bitterness_rating)}${renderFiveOptionSummary("complexity_rating", beer.complexity_rating)}</article></section>`; }
function renderFilterSheet(tags = []) {
  const country = findCountry(filters.country_code, filters.country_name);
  const styles = filters.category ? STYLES[filters.category] || [] : Object.values(STYLES).flat();
  const choice = (attr, value, label, selected) => `<button type="button" class="filter-choice${selected ? " is-selected" : ""}" data-${attr}="${esc(value)}">${esc(label)}</button>`;
  return `<div class="filter-overlay" data-filter-overlay></div><section class="filter-sheet" data-filter-sheet aria-hidden="false" aria-label="筛选与排序"><div class="filter-sheet-header"><span>筛选与排序</span><button type="button" data-filter-close aria-label="关闭筛选">×</button></div><div class="collection-filters"><div class="filter-grid"><div class="filter-field"><span>大分类</span><div class="filter-choice-grid">${choice("filter-category", "", "全部", !filters.category)}${CATEGORIES.map((item) => choice("filter-category", item, item, filters.category === item)).join("")}</div></div><div class="filter-field"><span>小类型</span><div class="filter-choice-grid">${styles.map((item) => choice("filter-style", item, item, filters.style === item)).join("") || `<small class="muted">请先选择大分类</small>`}</div></div><div class="filter-field"><span>国家</span><button class="filter-control" type="button" data-filter-country>${country.flag} ${esc(country.name)}</button></div><div class="filter-field"><span>风味标签</span><div class="filter-choice-grid">${tags.map((tag) => choice("filter-tag", tag.id, `${tag.name}${tag.usage_count ? ` · ${tag.usage_count}` : ""}`, filters.tag_ids.includes(tag.id))).join("") || `<small class="muted">暂无可筛选标签</small>`}</div></div><div class="filter-field"><span>标签匹配</span><div class="filter-choice-grid">${choice("filter-match", "and", "全部标签", filters.tag_match === "and")}${choice("filter-match", "or", "任一标签", filters.tag_match === "or")}</div></div><div class="filter-field"><span>评分范围</span><div class="filter-range"><label>最低评分<input type="number" step="0.5" min="0" max="10" data-filter-min value="${esc(filters.min_rating)}"></label><label>最高评分<input type="number" step="0.5" min="0" max="10" data-filter-max value="${esc(filters.max_rating)}"></label></div></div><div class="filter-field"><span>排序</span><div class="filter-choice-grid">${choice("filter-order", "recent", "最近品饮", filters.order === "recent")}${choice("filter-order", "rating", "平均评分", filters.order === "rating")}${choice("filter-order", "tastings", "品饮次数", filters.order === "tastings")}</div></div></div><div class="filter-actions"><button class="button button-secondary" type="button" data-filter-reset>重置</button><button class="button" type="button" data-filter-apply>应用筛选</button></div></div></section>`;
}function activeFilterSummary() { const items = []; if (filters.category) items.push(["category", filters.category]); if (filters.style) items.push(["style", filters.style]); if (filters.country_name) items.push(["country", `${findCountry(filters.country_code, filters.country_name).flag} ${filters.country_name}`]); if (filters.tag_ids.length) items.push(["tag", `${filters.tag_ids.length} 个标签`]); if (filters.has_photo) items.push(["photo", filters.has_photo === "true" ? "有照片" : "无照片"]); if (filters.min_rating || filters.max_rating) items.push(["rating", `${filters.min_rating || 0}–${filters.max_rating || 10} 分`]); return items.length ? `<div class="local-filter-summary">${items.map(([key, value]) => `<button type="button" class="filter-chip" data-clear-filter="${key}">${esc(value)} ×</button>`).join("")}</div>` : ""; }

async function renderBeerListPage() {
  const beers = await localDataAdapter.listBeers({ ...filters, tag_ids: filters.tag_ids });
  const stats = await localDataAdapter.getDashboard().catch(() => ({ core: { beer_count: beers.length, tasting_count: 0 } }));
  const tags = await localDataAdapter.listAvailableFilterTags();
  globalThis.__beerJournalAvailableTags = tags;
  await Promise.all(beers.map(async (beer) => { const photos = await localDataAdapter.listForOwner("beer", beer.id).catch(() => []); beer.cover_photo = photos.find((photo) => photo.is_cover) || photos[0]; beer.tasting_count = beer.tasting_count ?? 0; beer.is_recently_tasted = beer.latest_tasted_at && Date.now() - new Date(beer.latest_tasted_at).getTime() < 30 * 86400000; beer.is_new_collection = beer.created_at && Date.now() - new Date(beer.created_at).getTime() < 30 * 86400000; beer.is_highly_rated = Number(beer.average_rating ?? beer.overall_rating) >= 8; }));
  const core = stats.core || stats;
  const cards = beers.length ? beers.map(beerCard).join("") : emptyState("◌", "没有符合条件的啤酒", "换个关键词或清除筛选，再试一次。", `<button class="button" type="button" data-add-beer>添加啤酒</button>`);
  return `<div class="page-shell collection-page"><section class="collection-hero app-card"><div class="collection-hero-copy"><p class="screen-kicker">PRIVATE CELLAR</p><h1>我的啤酒</h1><p>每一款收藏，都有自己的味觉记忆。</p></div><div class="collection-overview" aria-label="收藏概览"><div><strong>${core.beer_count ?? beers.length}</strong><span>款收藏</span></div><div><strong>${core.tasting_count ?? 0}</strong><span>次品饮</span></div><div><strong>${core.average_tasting_rating_scaled ? (Number(core.average_tasting_rating_scaled) / 10).toFixed(1) : "—"}</strong><span>平均评分</span></div></div></section><section class="collection-tools" aria-label="搜索与筛选"><form class="collection-search" data-search-form><label class="visually-hidden" for="beer-query">搜索啤酒</label><span class="search-glyph" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg></span><input id="beer-query" type="search" name="query" value="${esc(filters.query)}" placeholder="搜索啤酒、品牌、国家"><button type="submit" aria-label="搜索"><svg class="ui-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg></button></form><button class="filter-trigger" type="button" data-filter-open><span class="filter-trigger-copy"><strong>筛选与排序</strong>${activeFilterSummary() ? `<small>已应用筛选条件</small>` : ""}</span><span class="filter-trigger-arrow" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></svg></span></button></section>${activeFilterSummary()}<div class="collection-section-heading"><h2>${filters.query || filters.category || filters.style || filters.country_name || filters.tag_ids.length ? "筛选结果" : "我的收藏"}</h2><span>${beers.length} 款</span></div><section class="collection-grid">${cards}</section><button class="floating-add-button" type="button" data-add-beer aria-label="添加新啤酒"><span>＋</span><span>添加啤酒</span></button></div>`;
}

function countryTrigger(code, name) { const country = findCountry(code, name); return `<button type="button" class="local-picker-trigger" data-country-picker><span>国家</span><strong>${country.flag} ${esc(country.name)}</strong></button><input type="hidden" name="country_code" value="${esc(code || "")}"><input type="hidden" name="country_name" value="${esc(name || "")}">`; }
function choiceTrigger(type, value, placeholder) { return `<button type="button" class="local-picker-trigger" data-choice-picker="${type}"><span>${type === "category" ? "大分类" : "风格"}</span><strong>${esc(value || placeholder)}</strong></button><input type="hidden" name="${type}" value="${esc(value || "")}">`; }
const PURCHASE_CHANNELS = [["", "未选择"], ["online", "线上"], ["offline", "线下"], ["gift", "赠送"]];
function purchaseChannelLabel(value) { return PURCHASE_CHANNELS.find(([key]) => key === (value || ""))?.[1] || "未选择"; }
function purchaseChannelTrigger(value) { return `<button type="button" class="local-picker-trigger" data-purchase-picker><span>购买渠道</span><strong>${esc(purchaseChannelLabel(value))}</strong></button><input type="hidden" name="purchase_channel" value="${esc(value || "")}">`; }
function beerForm(beer = null) {
  const formId = beer ? `data-beer-id="${esc(beer.id)}"` : "";
  const field = (label, name, value, type = "text", attrs = "") => `<div class="form-field"><label for="beer-${name}">${label}</label><input id="beer-${name}" type="${type}" name="${name}" value="${esc(value)}" ${attrs}></div>`;
  return `<section class="screen-heading"><p class="screen-kicker">${beer ? "BEER PROFILE" : "NEW BEER"}</p><h1>${beer ? `编辑 ${esc(beer.name)}` : "添加啤酒"}</h1><p>${beer ? "更新你的收藏资料。" : "记录一款新的啤酒收藏"}</p></section><form class="record-form beer-edit-form" data-beer-form ${formId}>${pageBack(beer ? `/beers/${beer.id}` : HOME, beer ? "返回啤酒档案" : "返回我的啤酒")}${photoGallery(beer?.photos || [], true, "beer", beer?.id || "")}${field("啤酒名称", "name", beer?.name, "text", "required placeholder=\"例如：Sierra Nevada Pale Ale\"")}${field("品牌", "brand", beer?.brand)}${field("酒厂", "brewery", beer?.brewery)}<div class="form-field">${countryTrigger(beer?.country_code, beer?.country_name)}</div><div class="form-field">${choiceTrigger("category", beer?.category, "请选择大分类")}</div><div class="form-field">${choiceTrigger("style", beer?.style, "请选择风格")}</div><div class="form-grid">${field("ABV (%)", "abv", beer?.abv, "number", "step=\"0.01\" min=\"0\" max=\"100\"")}${field("Plato", "plato", beer?.plato, "number", "step=\"0.01\" min=\"0\"")}${field("默认容量 (ml)", "default_volume_ml", beer?.default_volume_ml, "number", "min=\"1\"")}${field("总体评分", "overall_rating", beer?.overall_rating, "number", "step=\"0.5\" min=\"0\" max=\"10\"")}</div>${renderFiveOptionRating("mouthfeel_rating", beer?.mouthfeel_rating)}${renderFiveOptionRating("bitterness_rating", beer?.bitterness_rating)}${renderFiveOptionRating("complexity_rating", beer?.complexity_rating)}${tagEditor(beer?.flavor_tags || [])}<div class="form-field"><label for="beer-note">个人感想</label><textarea id="beer-note" name="personal_note" rows="4">${esc(beer?.personal_note)}</textarea></div><button class="button" type="submit">${beer ? "保存修改" : "保存啤酒"}</button></form>`;
}

function tastingCard(tasting) { return `<a class="journal-entry app-card" href="#/tastings/${tasting.id}" data-route="/tastings/${tasting.id}"><div class="journal-date"><strong>${esc(new Date(tasting.consumed_at).getDate())}</strong><span>${esc(new Date(tasting.consumed_at).toISOString().slice(0, 7).replace("-", "."))}</span></div>${tasting.cover_photo ? `<img class="journal-entry-image progressive-image" data-photo-path="${esc(tasting.cover_photo.local_path)}" alt="${esc(tasting.beer_name)} 照片" draggable="false">` : `<div class="journal-entry-placeholder" aria-label="暂无照片">🍺</div>`}<div class="journal-entry-copy"><p class="journal-entry-meta">${esc(tasting.beer_country || "")} · ${esc(tasting.beer_style || "未分类")}</p><h2>${esc(tasting.beer_name)}</h2><p class="journal-entry-facts">${esc(tasting.volume_ml || "容量未填")} ml × ${esc(tasting.bottle_count || "瓶数未填")}</p><p class="journal-entry-note${tasting.note ? "" : " is-empty"}">${esc(tasting.note || "这一次没有留下笔记")}</p></div><span class="journal-score">${tasting.rating ? `★ ${esc(tasting.rating)}` : "未评分"}</span></a>`; }
function tastingListPage(tastings, stats) { const periods = [["all", "全部"], ["recent", "最近30天"], ["year", "本年度"], ["history", "历史"]]; return shell(`<section class="journal-hero app-card"><div class="journal-hero-copy"><p class="screen-kicker">PRIVATE DIARY</p><h1>饮用记录</h1><p>把每一次举杯，留成只属于你的味觉日记。</p></div><div class="journal-overview"><div><strong>${stats.tasting_count || 0}</strong><span>总品饮</span></div><div><strong>${stats.year_count || 0}</strong><span>本年度</span></div><div><strong>${stats.average_rating_scaled ? (Number(stats.average_rating_scaled) / 10).toFixed(1) : "—"}</strong><span>平均评分</span></div></div></section><nav class="journal-periods" aria-label="饮用记录时间筛选">${periods.map(([value, label]) => `<button type="button" class="journal-chip${tastingFilters.period === value ? " is-active" : ""}" data-period="${value}">${label}</button>`).join("")}</nav><form class="collection-search" data-tasting-search-form><input name="query" type="search" placeholder="搜索饮用记录" value="${esc(tastingFilters.query)}"><button type="submit" aria-label="搜索">⌕</button></form><section class="journal-timeline">${tastings.length ? tastings.map(tastingCard).join("") : emptyState("📝", "还没有饮用记录", "记录一次品饮，留下当时的味道。", button("记录饮用", "/tastings/new"))}</section><a class="floating-add-button" href="#/tastings/new" data-route="/tastings/new" aria-label="记录饮用"><span>＋</span><span>记录饮用</span></a>`); }
function tastingForm(tasting = null, beer = null) { const selectedBeer = beer || tasting; const id = tasting ? `data-tasting-id="${esc(tasting.id)}"` : ""; return `<section class="screen-heading"><p class="screen-kicker">${tasting ? "EDIT TASTING" : "NEW TASTING"}</p><h1>${tasting ? "编辑饮用记录" : "记录这次饮用"}</h1><p>${selectedBeer ? `${esc(selectedBeer.name || selectedBeer.beer_name)} · 保存后不会修改历史记录。` : "填写一次新的饮用记录。"}</p></section><form class="record-form daily-tasting-form" data-tasting-form ${id}>${pageBack(tasting ? `/tastings/${tasting.id}` : "/tastings")}${selectedBeer ? `<div class="selected-beer app-card"><strong>${esc(selectedBeer.name || selectedBeer.beer_name)}</strong><span>${esc(selectedBeer.brand || selectedBeer.beer_brand || "")}</span><input type="hidden" name="beer_id" value="${esc(selectedBeer.id || selectedBeer.beer_id)}"></div>` : `<div class="form-field"><label>选择啤酒</label><select name="beer_id" data-beer-select><option value="">请选择啤酒</option></select></div>`}${photoGallery(tasting?.photos || [], true, "tasting", tasting?.id || "")}<div class="form-field"><label for="tasting-time">饮用时间</label><input id="tasting-time" type="text" readonly name="consumed_at" data-date-picker value="${esc(localDateTime(tasting?.consumed_at || new Date()))}"></div><div class="form-field"><label for="tasting-location">地点</label><input id="tasting-location" name="location" value="${esc(tasting?.location)}"></div><div class="form-grid"><div class="form-field"><label>容量 (ml)</label><input type="number" min="1" name="volume_ml" value="${esc(tasting?.volume_ml || selectedBeer?.default_volume_ml)}"></div><div class="form-field"><label>瓶数</label><input type="number" min="1" step="1" name="bottle_count" value="${esc(tasting?.bottle_count || 1)}"></div><div class="form-field"><label>价格 (¥)</label><input type="number" min="0" step="0.01" name="price" value="${esc(tasting?.price)}"></div><div class="form-field"><label>本次评分</label><input type="number" min="0" max="10" step="0.5" name="rating" value="${esc(tasting?.rating)}"></div></div><div class="form-field"><label>购买渠道</label><select name="purchase_channel"><option value="">未选择</option><option value="online" ${tasting?.purchase_channel === "online" ? "selected" : ""}>线上</option><option value="offline" ${tasting?.purchase_channel === "offline" ? "selected" : ""}>线下</option><option value="gift" ${tasting?.purchase_channel === "gift" ? "selected" : ""}>赠送</option></select></div><div class="form-field"><label for="tasting-note">品饮笔记</label><textarea id="tasting-note" name="note" rows="5">${esc(tasting?.note)}</textarea></div><button class="button" type="submit">保存饮用记录</button></form>`; }
function profilePageLegacy(data) { const c = data.core || {}; const pref = data.preferences || {}; const bars = (items = []) => items.length ? `<div class="profile-chart app-card">${items.slice(0, 8).map((item) => `<div class="chart-bar-row"><span>${esc(item.value || item.name || item.month)}</span><div class="chart-track"><i style="--value:${Math.max(8, Math.min(100, item.count * 16))}%"></i></div><b>${item.count}</b></div>`).join("")}</div>` : `<p class="chart-empty">暂无数据</p>`; return `<section class="profile-insight-hero app-card"><div class="profile-insight-copy"><p class="screen-kicker">MY BEER PROFILE</p><h1>我的啤酒画像</h1><p>从每一次举杯，慢慢看见自己的偏好。</p></div><div class="profile-core-stats"><div><strong>${c.beer_count || 0}</strong><span>收藏啤酒</span></div><div><strong>${c.tasting_count || 0}</strong><span>品饮次数</span></div><div><strong>${c.average_tasting_rating_scaled ? (Number(c.average_tasting_rating_scaled) / 10).toFixed(1) : "—"}</strong><span>平均评分</span></div></div></section><section class="profile-section"><div class="section-heading"><h2>收藏概览</h2><span>只保存在你的设备上</span></div><div class="profile-preferences"><article class="profile-preference-card app-card"><span>总瓶数</span><strong>${c.bottle_count || 0}</strong></article><article class="profile-preference-card app-card"><span>探索国家</span><strong>${c.country_count || 0}</strong></article><article class="profile-preference-card app-card"><span>总花费</span><strong>${money((c.total_spend_scaled || 0) / 100)}</strong></article><article class="profile-preference-card app-card"><span>平均每次</span><strong>${money((c.average_tasting_price_scaled || 0) / 100)}</strong></article></div></section><section class="profile-section"><div class="section-heading"><h2>类型分布</h2><span>按品饮次数</span></div>${bars(pref.category)}</section><section class="profile-section"><div class="section-heading"><h2>风格分布</h2><span>按品饮次数</span></div>${bars(pref.style)}</section><section class="profile-section"><div class="section-heading"><h2>国家分布</h2><span>按品饮次数</span></div>${bars(pref.country)}</section><section class="profile-section"><div class="section-heading"><h2>风味标签</h2><span>最常出现</span></div>${bars(data.flavor_tags)}</section><section class="profile-section"><div class="section-heading"><h2>近12个月</h2><span>品饮趋势</span></div>${bars((data.monthly || []).map((item) => ({ value: item.month, count: item.tasting_count })))}</section><section class="profile-section data-management"><div class="section-heading"><h2>数据管理</h2></div>${button("回收站", "/trash", "button-secondary")}<button class="button button-secondary" type="button" data-backup-export>导出备份</button><label class="button button-secondary">导入备份<input type="file" accept="application/json" data-backup-import hidden></label><button class="button button-danger" type="button" data-clear-data>清空本地数据</button></section>`; }

function tastingFormV2(tasting = null, beer = null) {
  const selectedBeer = beer || tasting;
  const id = tasting ? `data-tasting-id="${esc(tasting.id)}"` : "";
  return `<section class="screen-heading"><p class="screen-kicker">${tasting ? "EDIT TASTING" : "NEW TASTING"}</p><h1>${tasting ? "编辑饮用记录" : "记录这次饮用"}</h1><p>${selectedBeer ? `${esc(selectedBeer.name || selectedBeer.beer_name)} · 保存后不会修改历史记录。` : "填写一次新的饮用记录。"}</p></section><form class="record-form daily-tasting-form" data-tasting-form ${id}>${pageBack(tasting ? `/tastings/${tasting.id}` : "/tastings")}${selectedBeer ? `<div class="selected-beer app-card"><strong>${esc(selectedBeer.name || selectedBeer.beer_name)}</strong><span>${esc(selectedBeer.brand || selectedBeer.beer_brand || "")}</span><input type="hidden" name="beer_id" value="${esc(selectedBeer.id || selectedBeer.beer_id)}"></div>` : `<div class="form-field"><label>选择啤酒</label><select name="beer_id" data-beer-select><option value="">请选择啤酒</option></select></div>`}${photoGallery(tasting?.photos || [], true, "tasting", tasting?.id || "")}<div class="form-field"><label for="tasting-time">饮用时间</label><input id="tasting-time" type="text" readonly name="consumed_at" data-date-picker value="${esc(localDateTime(tasting?.consumed_at || new Date()))}"></div><div class="form-field"><label for="tasting-location">地点</label><input id="tasting-location" name="location" value="${esc(tasting?.location)}"></div><div class="form-grid"><div class="form-field"><label>容量 (ml)</label><input type="number" min="1" name="volume_ml" value="${esc(tasting?.volume_ml || selectedBeer?.default_volume_ml)}"></div><div class="form-field"><label>瓶数</label><input type="number" min="1" step="1" name="bottle_count" value="${esc(tasting?.bottle_count || 1)}"></div><div class="form-field"><label>价格 (¥)</label><input type="number" min="0" step="0.01" name="price" value="${esc(tasting?.price)}"></div><div class="form-field"><label>本次评分</label><input type="number" min="0" max="10" step="0.5" name="rating" value="${esc(tasting?.rating)}"></div></div><div class="form-field">${purchaseChannelTrigger(tasting?.purchase_channel)}</div><div class="form-field"><label for="tasting-note">品饮笔记</label><textarea id="tasting-note" name="note" rows="5">${esc(tasting?.note)}</textarea></div><button class="button" type="submit">保存饮用记录</button></form>`;
}

function tastingTypeLabel(tasting) { return [tasting.beer_category, tasting.beer_style].filter(Boolean).join(" · "); }
function tastingDetailPageV2(tasting, photos) {
  const typeLabel = tastingTypeLabel(tasting) || "未分类";
  return `<a class="back-link" href="#/tastings" data-back-path="/tastings">← 返回饮用记录</a><section class="diary-hero app-card"><div class="diary-hero-media">${photos[0] ? `<img class="diary-hero-image progressive-image" data-photo-path="${esc(photos[0].local_path)}" alt="${esc(tasting.beer_name)}" draggable="false">` : `<div class="diary-hero-placeholder"><span>🍺</span><small>这次没有照片</small></div>`}<span class="diary-score">${tasting.rating ? `★ ${esc(tasting.rating)}` : "未评分"}</span></div><div class="diary-hero-copy"><p class="screen-kicker">${esc(displayDate(tasting.consumed_at))}</p><h1>${esc(tasting.beer_name)}</h1><p class="diary-beer-meta">${esc(typeLabel)}</p><div class="diary-actions">${button("查看啤酒档案", `/beers/${tasting.beer_id}`, "button-secondary")}${button("编辑记录", `/tastings/${tasting.id}/edit`, "button-secondary")}<button class="button button-danger" type="button" data-delete-tasting="${esc(tasting.id)}">删除</button></div></div></section><section class="diary-section"><div class="section-heading"><h2>我的笔记</h2></div><article class="diary-note-card app-card"><p>${esc(tasting.note || "这一次还没有留下文字记录。")}</p></article></section><section class="diary-section"><div class="section-heading"><h2>本次饮用</h2></div><article class="diary-info-card app-card"><dl><dt>饮用时间</dt><dd>${esc(displayDate(tasting.consumed_at))}</dd><dt>地点</dt><dd>${esc(tasting.location || "未填写")}</dd><dt>容量</dt><dd>${tasting.volume_ml || "未填写"} ml</dd><dt>瓶数</dt><dd>${tasting.bottle_count || "未填写"}</dd><dt>购买渠道</dt><dd>${esc(purchaseChannelLabel(tasting.purchase_channel))}</dd><dt>价格</dt><dd>${money(tasting.price)}</dd></dl></article></section>${photos.length > 1 ? `<section class="diary-section diary-gallery-section"><div class="section-heading"><h2>更多照片</h2></div>${photoGallery(photos.slice(1), false)}</section>` : ""}`;
}

function profilePage(data, beers = []) {
  const core = data.core || {};
  const preferences = data.preferences || {};
  const avg = (key) => { const values = beers.map((beer) => Number(beer[key])).filter((value) => Number.isFinite(value) && value > 0); return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : "—"; };
  const items = (values = []) => (values || []).filter((item) => item.value).slice(0, 8);
  const chart = (values = [], trackClass = "") => { const rows = items(values); const max = Math.max(1, ...rows.map((item) => Number(item.count) || 0)); return rows.length ? `<article class="profile-chart app-card">${rows.map((item) => `<div class="chart-bar-row"><span>${esc(item.value)}</span><div class="chart-track ${trackClass}"><i style="--value:${Math.max(6, (Number(item.count) / max) * 100)}%"></i></div><b>${Number(item.count) || 0}</b></div>`).join("")}</article>` : `<article class="profile-chart app-card"><p class="chart-empty">尚无可统计资料。</p></article>`; };
  const experience = [["口感", "清爽", "醇厚", "mouthfeel_rating"], ["苦味", "淡", "苦", "bitterness_rating"], ["风味复杂度", "简单", "复杂", "complexity_rating"]].map(([label, start, end, key]) => `<div class="experience-profile-row"><div><strong>${label}</strong><small>平均 ${avg(key)} / 5</small></div><span>${start}</span><b>${avg(key) === "—" ? "☆☆☆☆☆" : `${"★".repeat(Math.round(Number(avg(key))))}${"☆".repeat(5 - Math.round(Number(avg(key))))}`}</b><span>${end}</span></div>`).join("");
  const trend = Array.from({ length: 12 }, (_, index) => { const date = new Date(); date.setMonth(date.getMonth() - (11 - index)); const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; return { month, ...(data.monthly || []).find((item) => item.month === month) }; });
  const trendMax = Math.max(1, ...trend.map((item) => Number(item.tasting_count) || 0), ...trend.map((item) => Number(item.beer_count) || 0));
  const channel = items(preferences.purchase_channel)[0];
  const channelLabel = { online: "线上", offline: "线下", gift: "赠送" }[channel?.value] || channel?.value || "暂无";
  const recent = data.recent_tastings || [];
  return `<section class="profile-insight-hero app-card"><div class="profile-insight-copy"><p class="screen-kicker">MY BEER PROFILE</p><h1>我的啤酒画像</h1><p>从每一次举杯，慢慢看见自己的偏好。</p></div><div class="profile-core-stats"><div><strong>${core.beer_count || 0}</strong><span>收藏啤酒</span></div><div><strong>${core.tasting_count || 0}</strong><span>品饮次数</span></div><div><strong>${core.average_tasting_rating_scaled ? (Number(core.average_tasting_rating_scaled) / 10).toFixed(1) : "—"}</strong><span>平均评分</span></div></div></section><section class="profile-section"><div class="section-heading"><h2>我的口味画像</h2><span>基于收藏资料</span></div><div class="experience-profile app-card">${experience}</div></section><section class="profile-section"><div class="section-heading"><h2>偏好分析</h2><span>有效品饮记录</span></div><div class="profile-preferences">${[["最常喝国家", preferences.country?.[0]?.value], ["最常喝类型", preferences.category?.[0]?.value], ["最常喝风格", preferences.style?.[0]?.value], ["常见风味标签", data.flavor_tags?.[0]?.value]].map(([label, value]) => `<article class="profile-preference-card app-card"><span>${label}</span><strong>${esc(value || "暂无")}</strong></article>`).join("")}</div></section><section class="profile-section"><div class="section-heading"><h2>国家分布</h2><span>按品饮次数</span></div>${chart(preferences.country)}</section><section class="profile-section"><div class="section-heading"><h2>类型分布</h2><span>按品饮次数</span></div>${chart(preferences.category, "chart-track-fresh")}</section><section class="profile-section"><div class="section-heading"><h2>风格分布</h2><span>按品饮次数</span></div>${chart(preferences.style, "chart-track-purple")}</section><section class="profile-section"><div class="section-heading"><h2>近12个月</h2><span>品饮 / 新收藏</span></div><article class="profile-trend-chart app-card"><div class="trend-legend"><span><i></i>品饮</span><span><b></b>收藏</span></div><div class="profile-trend-bars">${trend.map((item) => `<div class="profile-trend-column" title="${item.month}"><div class="profile-trend-stack"><i style="--value:${Math.max(3, ((Number(item.tasting_count) || 0) / trendMax) * 100)}%"></i><b style="--value:${Math.max(3, ((Number(item.beer_count) || 0) / trendMax) * 100)}%"></b></div><span>${Number(item.month.slice(5))}月</span></div>`).join("")}</div></article></section><section class="profile-section"><div class="section-heading"><h2>风味标签</h2><span>最常出现</span></div><article class="flavor-cloud app-card">${items(data.flavor_tags).map((item) => `<span class="flavor-cloud-tag">${esc(item.value)} <b>${Number(item.count) || 0}</b></span>`).join("") || `<p class="chart-empty">尚未为收藏添加风味标签。</p>`}</article></section><section class="profile-section"><div class="section-heading"><h2>花费习惯</h2><span>已填写项目</span></div><div class="spending-grid"><article class="spending-card app-card"><span>平均价格</span><strong>${core.average_tasting_price_scaled == null ? "—" : money(Number(core.average_tasting_price_scaled) / 100)}</strong></article><article class="spending-card app-card"><span>常用购买渠道</span><strong>${esc(channelLabel)}</strong>${channel ? `<small>${Number(channel.count) || 0} 次购买</small>` : ""}</article></div></section><section class="profile-section profile-recent-section"><div class="section-heading"><h2>最近饮用</h2><a href="#/tastings" data-route="/tastings">查看全部</a></div><div class="recent-list">${recent.map((tasting) => `<a class="recent-tasting app-card" href="#/tastings/${tasting.id}" data-route="/tastings/${tasting.id}"><div><strong>${esc(tasting.beer_name)}</strong><span>${esc(displayDate(tasting.consumed_at))} · ${esc(tasting.beer_country_name || "")}</span></div><b>${tasting.rating ? `★ ${esc(tasting.rating)}` : "—"}</b></a>`).join("") || `<div class="empty-state app-card"><p>还没有饮用记录。</p></div>`}</div></section><section class="profile-section data-management"><div class="section-heading"><h2>数据管理</h2></div>${button("回收站", "/trash", "button-secondary")}<button class="button button-secondary" type="button" data-backup-export>导出备份</button><label class="button button-secondary">导入备份<input type="file" accept="application/json" data-backup-import hidden></label><button class="button button-danger" type="button" data-clear-data>清空本地数据</button></section>`;
}
function beerDetailPage(beer, tastings, stats, photos) { const country = findCountry(beer.country_code, beer.country_name); return `<a class="back-link" href="#/beers" data-back-path="/beers">← 返回我的啤酒</a><section class="beer-profile-hero"><div class="beer-profile-media">${photos[0] ? `<img class="beer-profile-image progressive-image" data-photo-path="${esc(photos[0].local_path)}" alt="${esc(beer.name)}" draggable="false">` : `<div class="image-placeholder beer-profile-placeholder"><span>🍺</span><small>等待酒标照片</small></div>`}</div><div class="beer-profile-copy"><p class="screen-kicker">${country.flag} ${esc(country.name)}</p><h1>${esc(beer.name)}</h1><p class="beer-profile-brand">${esc(beer.brand || "未填写品牌")}</p><p class="beer-profile-style">${esc(beer.category || "未分类")} · ${esc(beer.style || "未填写类型")}</p><div class="beer-profile-actions">${button("编辑资料", `/beers/${beer.id}/edit`, "button-secondary")}<button class="button button-danger" type="button" data-delete-beer="${esc(beer.id)}">删除</button></div></div></section><section class="detail-summary app-card" aria-label="收藏摘要"><div><strong>${stats.tasting_count || 0}</strong><span>品饮次数</span></div><div><strong>${stats.average_rating_scaled ? (Number(stats.average_rating_scaled) / 10).toFixed(1) : "—"}</strong><span>平均评分</span></div><div><strong>${stats.latest_consumed_at ? displayDate(stats.latest_consumed_at) : "—"}</strong><span>最近品饮</span></div></section><section class="detail-section"><div class="section-heading"><h2>基础资料</h2></div><article class="panel detail-facts-card"><dl><dt>ABV</dt><dd>${beer.abv ?? "未填写"}%</dd><dt>Plato</dt><dd>${beer.plato ?? "未填写"}°P</dd><dt>类型</dt><dd>${esc(beer.category || "未分类")} · ${esc(beer.style || "未填写")}</dd><dt>默认容量</dt><dd>${beer.default_volume_ml || "暂无"} ml</dd></dl></article></section>${ratingSummary(beer)}<section class="detail-section"><div class="section-heading"><h2>风味标签</h2></div><article class="panel flavor-panel">${tagPills(beer.flavor_tags)}</article></section>${photos.length > 1 ? `<section class="detail-section"><div class="section-heading"><h2>照片</h2></div>${photoGallery(photos.slice(1), false)}</section>` : ""}<section class="detail-section detail-history"><div class="section-heading"><h2>我的品饮历史</h2><span>${tastings.length} 次</span></div><div class="detail-timeline">${tastings.length ? tastings.map(tastingCard).join("") : emptyState("📝", "还没有品饮记录", "从第一次品饮开始，为这款啤酒留下记忆。")}</div></section><a class="detail-primary-action" href="#/tastings/new?beer_id=${beer.id}" data-route="/tastings/new?beer_id=${beer.id}"><span>＋</span><span>再次品饮</span></a>`; }
function tastingDetailPage(tasting, photos) { return `<a class="back-link" href="#/tastings" data-back-path="/tastings">← 返回饮用记录</a><section class="diary-hero app-card"><div class="diary-hero-media">${photos[0] ? `<img class="diary-hero-image progressive-image" data-photo-path="${esc(photos[0].local_path)}" alt="${esc(tasting.beer_name)}" draggable="false">` : `<div class="diary-hero-placeholder"><span>🍺</span><small>这次没有照片</small></div>`}<span class="diary-score">${tasting.rating ? `★ ${esc(tasting.rating)}` : "未评分"}</span></div><div class="diary-hero-copy"><p class="screen-kicker">${esc(displayDate(tasting.consumed_at))}</p><h1>${esc(tasting.beer_name)}</h1><p class="diary-beer-meta">${esc(tasting.beer_country || "")} · ${esc(tasting.beer_style || "未分类")}</p><div class="diary-actions">${button("查看啤酒档案", `/beers/${tasting.beer_id}`, "button-secondary")}${button("编辑记录", `/tastings/${tasting.id}/edit`, "button-secondary")}<button class="button button-danger" type="button" data-delete-tasting="${esc(tasting.id)}">删除</button></div></div></section><section class="diary-section"><div class="section-heading"><h2>我的笔记</h2></div><article class="diary-note-card app-card"><p>${esc(tasting.note || "这一次还没有留下文字记录。")}</p></article></section><section class="diary-section"><div class="section-heading"><h2>本次饮用</h2></div><article class="diary-info-card app-card"><dl><dt>饮用时间</dt><dd>${esc(displayDate(tasting.consumed_at))}</dd><dt>地点</dt><dd>${esc(tasting.location || "未填写")}</dd><dt>容量</dt><dd>${tasting.volume_ml || "未填写"} ml</dd><dt>瓶数</dt><dd>${tasting.bottle_count || "未填写"}</dd><dt>购买渠道</dt><dd>${esc(tasting.purchase_channel || "未填写")}</dd><dt>价格</dt><dd>${money(tasting.price)}</dd></dl></article></section>${photos.length > 1 ? `<section class="diary-section diary-gallery-section"><div class="section-heading"><h2>更多照片</h2></div>${photoGallery(photos.slice(1), false)}</section>` : ""}`; }
function secondaryPage(title, text, action = "") { return shell(`${routeHeader(title)}${pageBack(HOME)}${emptyState("ℹ️", title, text, action)}`); }

function tastingDetailPageFinal(tasting, photos) {
  const typeLabel = tastingTypeLabel(tasting) || "未分类";
  return `<a class="back-link" href="#/tastings" data-back-path="/tastings">← 返回饮用记录</a><section class="diary-hero app-card"><div class="diary-hero-media">${photos[0] ? `<img class="diary-hero-image progressive-image" data-photo-path="${esc(photos[0].local_path)}" alt="${esc(tasting.beer_name)}" draggable="false">` : `<div class="diary-hero-placeholder"><span>🍺</span><small>这次没有照片</small></div>`}<span class="diary-score">${tasting.rating ? `★ ${esc(tasting.rating)}` : "未评分"}</span></div><div class="diary-hero-copy"><p class="screen-kicker">${esc(displayDate(tasting.consumed_at))}</p><h1>${esc(tasting.beer_name)}</h1><p class="diary-beer-meta">${esc(typeLabel)}</p><div class="diary-actions">${button("查看啤酒档案", `/beers/${tasting.beer_id}`, "button-secondary")}${button("编辑记录", `/tastings/${tasting.id}/edit`, "button-secondary")}<button class="button button-danger" type="button" data-delete-tasting="${esc(tasting.id)}">删除</button></div></div></section><section class="diary-section"><div class="section-heading"><h2>我的笔记</h2></div><article class="diary-note-card app-card"><p>${esc(tasting.note || "这一次还没有留下文字记录。")}</p></article></section><section class="diary-section"><div class="section-heading"><h2>本次饮用</h2></div><article class="diary-info-card app-card"><dl><dt>饮用时间</dt><dd>${esc(displayDate(tasting.consumed_at))}</dd><dt>地点</dt><dd>${esc(tasting.location || "未填写")}</dd><dt>容量</dt><dd>${tasting.volume_ml || "未填写"} ml</dd><dt>瓶数</dt><dd>${tasting.bottle_count || "未填写"}</dd><dt>购买渠道</dt><dd>${esc(purchaseChannelLabel(tasting.purchase_channel))}</dd><dt>价格</dt><dd>${money(tasting.price)}</dd></dl></article></section>${photos.length > 1 ? `<section class="diary-section diary-gallery-section"><div class="section-heading"><h2>更多照片</h2></div>${photoGallery(photos.slice(1), false)}</section>` : ""}`;
}

async function openCountryPicker(target = "form") {
  const restoreFocus = document.activeElement; const root = document.createElement("div"); root.className = "local-country-picker"; root.innerHTML = `<div class="local-sheet-overlay" data-country-close></div><section class="local-sheet local-country-sheet"><div class="local-sheet-head"><h2>选择国家</h2><button type="button" class="local-sheet-close" data-country-close>×</button></div><input class="local-country-search" type="search" placeholder="搜索中文、英文、代码或别名" data-country-search><div class="local-country-list" data-country-list></div></section>`; document.body.append(root); overlayManager.openOverlay({ id: "country-picker", element: root, restoreFocus });
  const records = [...COUNTRIES]; const beers = await localDataAdapter.listBeers().catch(() => []); const seen = new Set(records.map((item) => item[1].toLowerCase())); beers.forEach((beer) => { const name = String(beer.country_name || "").trim(); if (name && !beer.country_code && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); records.push(["", name, name, [name]]); } });
  const list = root.querySelector("[data-country-list]"); const draw = (query = "") => { const q = String(query).trim(); const matches = records.filter((item) => !q || countrySearchText(item).includes(q.toLowerCase())); const custom = q && !matches.length ? `<button class="local-country-custom" type="button" data-custom-country="${esc(q)}">🌐 使用“${esc(q)}”</button>` : ""; list.innerHTML = custom + matches.map(([code, name, english, aliases]) => `<button class="local-country-option" type="button" data-country-code="${esc(code)}" data-country-name="${esc(name)}"><span>${flagForCountry(code)}</span><strong>${esc(name)}</strong><small>${esc(english)}${aliases?.length ? ` · ${esc(aliases[0])}` : ""}</small></button>`).join(""); }; draw(); root.querySelector("[data-country-search]").addEventListener("input", (event) => draw(event.target.value));
  root.addEventListener("click", (event) => { if (event.target.closest("[data-country-close]")) { overlayManager.closeOverlay("country-picker"); return; } const option = event.target.closest("[data-country-code]"); const custom = event.target.closest("[data-custom-country]"); if (!option && !custom) return; const code = custom ? "" : option.dataset.countryCode; const name = custom ? custom.dataset.customCountry : option.dataset.countryName; if (target === "filter") { filters.country_code = code; filters.country_name = name; overlayManager.closeOverlay("country-picker"); renderFilterPortal(); return; } const form = document.querySelector("[data-beer-form]"); if (form) { form.querySelector('[name="country_code"]').value = code; form.querySelector('[name="country_name"]').value = name; form.querySelector("[data-country-picker] strong").textContent = `${flagForCountry(code)} ${name}`; } overlayManager.closeOverlay("country-picker"); }); root.querySelector("[data-country-search]").focus();
}
function openChoicePicker(type) { const form = document.querySelector("[data-beer-form]"); if (!form) return; const current = form.querySelector(`[name="${type}"]`).value; const options = type === "category" ? CATEGORIES : (STYLES[form.querySelector('[name="category"]').value] || Object.values(STYLES).flat()); const root = document.createElement("div"); const id = `choice-${type}`; root.className = "local-choice-picker"; root.innerHTML = `<div class="local-sheet-overlay" data-choice-close></div><section class="local-sheet"><div class="local-sheet-head"><h2>选择${type === "category" ? "啤酒大类" : "啤酒风格"}</h2><button type="button" class="local-sheet-close" data-choice-close>×</button></div><div class="local-choice-grid">${options.map((item) => `<button type="button" class="local-choice${item === current ? " is-selected" : ""}" data-choice-value="${esc(item)}">${esc(item)}</button>`).join("")}</div></section>`; document.body.append(root); overlayManager.openOverlay({ id, element: root, restoreFocus: document.activeElement }); root.addEventListener("click", (event) => { if (event.target.closest("[data-choice-close]")) { overlayManager.closeOverlay(id); return; } const option = event.target.closest("[data-choice-value]"); if (!option) return; form.querySelector(`[name="${type}"]`).value = option.dataset.choiceValue; form.querySelector(`[data-choice-picker="${type}"] strong`).textContent = option.dataset.choiceValue; if (type === "category") { form.querySelector('[name="style"]').value = ""; form.querySelector('[data-choice-picker="style"] strong').textContent = "请选择风格"; } overlayManager.closeOverlay(id); }); }
function openPurchaseChannelPicker() {
  const input = document.querySelector('[data-tasting-form] [name="purchase_channel"]');
  if (!input) return;
  const id = "purchase-channel-picker";
  const root = document.createElement("div");
  root.className = "local-choice-picker";
  root.innerHTML = `<div class="local-sheet-overlay" data-purchase-close></div><section class="local-sheet" role="dialog" aria-label="购买渠道"><div class="local-sheet-head"><h2>选择购买渠道</h2><button type="button" class="local-sheet-close" data-purchase-close aria-label="关闭">×</button></div><div class="local-choice-grid">${PURCHASE_CHANNELS.map(([value, label]) => `<button type="button" class="local-choice${value === (input.value || "") ? " is-selected" : ""}" data-purchase-value="${esc(value)}">${label}</button>`).join("")}</div></section>`;
  document.body.append(root);
  overlayManager.openOverlay({ id, element: root, restoreFocus: document.querySelector("[data-purchase-picker]") });
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-purchase-close]")) { overlayManager.closeOverlay(id); return; }
    const option = event.target.closest("[data-purchase-value]");
    if (!option) return;
    input.value = option.dataset.purchaseValue || "";
    const trigger = document.querySelector("[data-purchase-picker] strong");
    if (trigger) trigger.textContent = purchaseChannelLabel(input.value);
    overlayManager.closeOverlay(id);
  });
}

function openDatePicker(input) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(input.value || "");
  const fallback = new Date();
  const picked = parsed ? { year: Number(parsed[1]), month: Number(parsed[2]), day: Number(parsed[3]), hour: Number(parsed[4]), minute: Number(parsed[5]) } : { year: fallback.getFullYear(), month: fallback.getMonth() + 1, day: fallback.getDate(), hour: fallback.getHours(), minute: fallback.getMinutes() };
  const root = document.createElement("div");
  const id = "datetime-picker";
  root.className = "local-date-picker";
  root.innerHTML = `<div class="local-sheet-overlay" data-date-close></div><section class="local-sheet"><div class="local-sheet-head"><h2>选择品饮时间</h2><button type="button" class="local-sheet-close" data-date-close>×</button></div><div class="datetime-wheels" data-date-wheels></div><footer class="local-actions"><button type="button" class="local-button secondary" data-date-close>取消</button><button type="button" class="local-button" data-date-confirm>确认时间</button></footer></section>`;
  document.body.append(root);
  overlayManager.openOverlay({ id, element: root, restoreFocus: input });
  const pad = (value) => String(value).padStart(2, "0");
  const centerSelected = () => root.querySelectorAll(".datetime-wheel-list .is-selected").forEach((selected) => {
    const list = selected.closest(".datetime-wheel-list");
    if (list) list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
  });
  const render = () => {
    const days = new Date(picked.year, picked.month, 0).getDate();
    picked.day = Math.min(picked.day, days);
    const yearStart = Math.min(fallback.getFullYear() - 4, picked.year - 4);
    const columns = [["year", Array.from({ length: 9 }, (_, index) => yearStart + index), (value) => value], ["month", Array.from({ length: 12 }, (_, index) => index + 1), (value) => `${value}月`], ["day", Array.from({ length: days }, (_, index) => index + 1), (value) => `${value}日`], ["hour", Array.from({ length: 24 }, (_, index) => index), pad], ["minute", Array.from({ length: 60 }, (_, index) => index), pad]];
    const wheels = root.querySelector("[data-date-wheels]");
    wheels.replaceChildren();
    columns.forEach(([key, values, format]) => {
      const column = document.createElement("div");
      column.className = "datetime-wheel";
      const heading = document.createElement("small");
      heading.textContent = { year: "年", month: "月", day: "日", hour: "时", minute: "分" }[key];
      const list = document.createElement("div");
      list.className = "datetime-wheel-list";
      values.forEach((value) => {
        const option = document.createElement("button");
        option.type = "button";
        option.textContent = format(value);
        option.className = picked[key] === value ? "is-selected" : "";
        option.addEventListener("click", () => { picked[key] = value; render(); requestAnimationFrame(centerSelected); });
        list.append(option);
      });
      column.append(heading, list);
      wheels.append(column);
    });
    requestAnimationFrame(centerSelected);
  };
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-date-close]")) { overlayManager.closeOverlay(id); return; }
    if (event.target.closest("[data-date-confirm]")) {
      input.value = `${picked.year}-${pad(picked.month)}-${pad(picked.day)} ${pad(picked.hour)}:${pad(picked.minute)}`;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      overlayManager.closeOverlay(id);
    }
  });
  render();
  requestAnimationFrame(() => requestAnimationFrame(centerSelected));
}
function openTastingActionSheet(id, restoreFocus = null) {
  const root = document.createElement("div");
  const overlayId = `tasting-actions-${id}`;
  root.className = "local-choice-picker";
  root.innerHTML = `<div class="local-sheet-overlay" data-action-close></div><section class="local-sheet"><div class="local-sheet-head"><h2>这条记录</h2><button type="button" class="local-sheet-close" data-action-close>×</button></div><div class="local-actions"><button type="button" class="local-button secondary" data-action-view>查看详情</button><button type="button" class="local-button secondary" data-action-edit>编辑记录</button><button type="button" class="local-button danger" data-action-delete>删除记录</button></div></section>`;
  document.body.append(root);
  overlayManager.openOverlay({ id: overlayId, element: root, restoreFocus });
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-action-close]")) { overlayManager.closeOverlay(overlayId); return; }
    if (event.target.closest("[data-action-view]")) { overlayManager.closeOverlay(overlayId); navigate(`/tastings/${id}`); return; }
    if (event.target.closest("[data-action-edit]")) { overlayManager.closeOverlay(overlayId); navigate(`/tastings/${id}/edit`); return; }
    if (event.target.closest("[data-action-delete]")) { overlayManager.closeOverlay(overlayId); openDeleteConfirm("tasting", id, restoreFocus); }
  });
}
function openDeleteConfirm(kind, id, restoreFocus = null) { const overlayId = `delete-${kind}`; const root = document.createElement("div"); root.className = "local-delete-confirm"; root.innerHTML = `<div class="local-sheet-overlay" data-confirm-close></div><section class="local-sheet"><div class="local-sheet-head"><h2>确认删除</h2><button type="button" class="local-sheet-close" data-confirm-close>×</button></div><p>这条记录会被软删除，可在回收站恢复。</p><div class="local-actions"><button class="local-button secondary" type="button" data-confirm-close>取消</button><button class="local-button danger" type="button" data-confirm-accept data-delete-kind="${kind}" data-delete-id="${esc(id)}">确认删除</button></div></section>`; document.body.append(root); overlayManager.openOverlay({ id: overlayId, element: root, restoreFocus }); }
function firstTastingSheet(beer) { const root = document.createElement("div"); root.className = "local-first-tasting"; root.innerHTML = `<div class="local-sheet-overlay" data-first-close></div><section class="local-sheet"><div class="local-sheet-head"><h2>添加首次品饮？</h2></div><p>现在记录这次饮用，或稍后再补充。</p><div class="local-actions"><button class="local-button secondary" data-first-later>稍后添加</button><button class="local-button" data-first-add>添加首次品饮</button></div></section>`; document.body.append(root); overlayManager.openOverlay({ id: "first-tasting", element: root }); root.addEventListener("click", (event) => { if (event.target.closest("[data-first-later]")) { overlayManager.closeOverlay("first-tasting"); navigate(`/beers/${beer.id}`); } if (event.target.closest("[data-first-add]")) { overlayManager.closeOverlay("first-tasting"); navigate(`/tastings/new?beer_id=${beer.id}`); } }); }
function renderFilterPortal() {
  const portal = document.querySelector("#overlay-root");
  if (!portal) return;

  const currentSheet = portal.querySelector("[data-filter-sheet]");
  if (currentSheet && overlayManager.getTopOverlay()?.id === "filter-sheet") {
    const template = document.createElement("template");
    template.innerHTML = renderFilterSheet(window.__beerJournalAvailableTags || []);
    const nextSheet = template.content.querySelector("[data-filter-sheet]");
    if (updateFilterSheetPreservingScroll(currentSheet, nextSheet)) {
      ensureCreatedOrderChoice(currentSheet);
      return;
    }
  }

  portal.innerHTML = renderFilterSheet(window.__beerJournalAvailableTags || []);
  const sheet = portal.querySelector("[data-filter-sheet]");
  ensureCreatedOrderChoice(sheet);
  const backdrop = portal.querySelector("[data-filter-overlay]");
  portal.classList.add("filter-overlay-root", "is-open");
  sheet?.classList.add("is-open");
  backdrop?.classList.add("is-open");
  document.body.classList.add("filter-sheet-open");
  overlayManager.openOverlay({
    id: "filter-sheet",
    element: sheet,
    removeElement: false,
    restoreFocus: document.querySelector("[data-filter-open]"),
    onClose: () => {
      portal.classList.remove("is-open");
      portal.innerHTML = "";
      document.body.classList.remove("filter-sheet-open");
    },
  });
}

function ensureCreatedOrderChoice(sheet) {
  if (!sheet) return;
  const orderField = sheet?.querySelectorAll(".filter-field")?.item((sheet.querySelectorAll(".filter-field")?.length || 1) - 1);
  const orderGrid = orderField?.querySelector(".filter-choice-grid");
  if (orderGrid && !orderGrid.querySelector('[data-filter-order="created"]')) orderGrid.insertAdjacentHTML("afterbegin", `<button type="button" class="filter-choice${filters.order === "created" ? " is-selected" : ""}" data-filter-order="created">最新录入</button>`);
}

function updateTagEditor(editor, names) { editor.dataset.tags = JSON.stringify(names); editor.querySelector("[data-tag-chips]").innerHTML = names.map((name) => `<span class="local-tag-pill">${esc(name)} <button type="button" data-remove-tag="${esc(name)}">×</button><input type="hidden" name="flavor_tags" value="${esc(name)}"></span>`).join(""); editor.querySelector("[data-tag-input]").value = ""; }
function addTags(editor, value) { const names = splitTagInput([...(JSON.parse(editor.dataset.tags || "[]")), ...splitTagInput(value)]); updateTagEditor(editor, names); }

async function render() {
  const serial = ++renderSerial; const current = normalizeRoute(route().split("?")[0]); if (!app) return; try {
    if (current === HOME || current === "/") app.innerHTML = await renderBeerListPage();
    else if (current === "/profile") { const dashboard = await localDataAdapter.getDashboard(); const beers = await localDataAdapter.listBeers(); app.innerHTML = profilePage(dashboard, beers); }
    else if (current === "/tastings") { const all = await localDataAdapter.listTastings({ query: tastingFilters.query, ...(tastingFilters.period === "recent" ? { from: new Date(Date.now() - 30 * 86400000).toISOString() } : tastingFilters.period === "year" ? { from: `${new Date().getFullYear()}-01-01` } : tastingFilters.period === "history" ? { to: `${new Date().getFullYear()}-01-01` } : {}) }); await Promise.all(all.map(async (tasting) => { const photos = await localDataAdapter.listForOwner("tasting", tasting.id).catch(() => []); tasting.cover_photo = photos.find((photo) => photo.is_cover) || photos[0]; })); const stats = await localDataAdapter.getStats(); stats.year_count = (await localDataAdapter.listTastings({ from: `${new Date().getFullYear()}-01-01` })).length; app.innerHTML = tastingListPage(all, stats); }
    else if (current === "/tastings/new") { const query = new URLSearchParams(route().split("?")[1] || ""); const beer = query.get("beer_id") ? await localDataAdapter.getBeerById(query.get("beer_id")) : null; app.innerHTML = beer ? tastingFormV2(null, beer) : shell(tastingBeerSelectPage(await localDataAdapter.listBeers())); }
    else if (current === "/trash") { const beers = await localDataAdapter.listDeletedBeers(); const tastings = await localDataAdapter.listDeletedTastings(); const photos = await localDataAdapter.listDeletedPhotos(); app.innerHTML = shell(`${pageBack("/profile")}<section class="local-card"><h2>已删除啤酒</h2>${beers.map((beer) => `<div class="trash-row"><span>${esc(beer.name)}</span><button type="button" data-restore-beer="${beer.id}">恢复</button></div>`).join("") || `<p class="local-muted">暂无已删除啤酒</p>`}</section><section class="local-card"><h2>已删除品饮</h2>${tastings.filter((t) => t.deleted_at).map((t) => `<div class="trash-row"><span>${esc(t.beer_name)} · ${esc(displayDate(t.consumed_at))}</span><button type="button" data-restore-tasting="${t.id}">恢复</button></div>`).join("") || `<p class="local-muted">暂无已删除品饮</p>`}</section><section class="local-card"><h2>已删除照片</h2>${photos.map((photo) => `<div class="trash-row"><span>${esc(photo.id)}</span><button type="button" data-restore-photo="${photo.id}">恢复</button></div>`).join("") || `<p class="local-muted">暂无已删除照片</p>`}</section>`, "回收站"); }
    else if (current === "/settings") app.innerHTML = shell(`${routeHeader("设置")}${pageBack("/profile")}${emptyState("⚙️", "数据管理", "备份、恢复和清空数据都在个人数据页完成。", button("返回个人数据", "/profile"))}`);
    else if (current === "/beers/new") app.innerHTML = shell(beerForm());
    else if (parseBeerEditRoute(current)) { const id = parseBeerEditRoute(current); const beer = await localDataAdapter.getBeerById(id); if (!beer) app.innerHTML = secondaryPage("找不到啤酒", "这条记录可能已被删除。", button("返回列表", HOME)); else { beer.photos = await localDataAdapter.listForOwner("beer", beer.id); app.innerHTML = shell(beerForm(beer)); } }
    else if (parseBeerDetailRoute(current)) { const id = parseBeerDetailRoute(current); const beer = await localDataAdapter.getBeerById(id); if (!beer) app.innerHTML = secondaryPage("找不到啤酒", "这条记录可能已被删除。", button("返回列表", HOME)); else { const [tastings, stats, photos] = await Promise.all([localDataAdapter.listTastingsByBeerId(id), localDataAdapter.getStatsByBeerId(id), localDataAdapter.listForOwner("beer", id)]); app.innerHTML = beerDetailPage(beer, tastings, stats, photos); } }
    else { const tastingMatch = current.match(/^\/tastings\/([0-9a-f-]{36})(\/edit)?$/i); if (tastingMatch) { const tasting = await localDataAdapter.getTastingById(tastingMatch[1]); if (!tasting) app.innerHTML = secondaryPage("找不到品饮记录", "这条记录可能已被删除。", button("返回品饮记录", "/tastings")); else if (tastingMatch[2]) { tasting.photos = await localDataAdapter.listForOwner("tasting", tasting.id); app.innerHTML = shell(tastingFormV2(tasting)); } else { const photos = await localDataAdapter.listForOwner("tasting", tasting.id); app.innerHTML = tastingDetailPageFinal(tasting, photos); } } else app.innerHTML = secondaryPage("页面不存在", "请返回我的啤酒。", button("返回我的啤酒", HOME)); }
    if (serial !== renderSerial) return; app.classList.remove("is-entering"); void app.offsetWidth; app.classList.add("is-entering"); const resetScroll = current === "/beers/new" || current === "/tastings/new" || /^\/beers\/[0-9a-f-]{36}$|^\/tastings\/[0-9a-f-]{36}$/.test(current); if (resetScroll) { app.scrollTop = 0; requestAnimationFrame(() => { if (serial === renderSerial) app.scrollTop = 0; }); } verifyShellStability(); verifyRouteStructure(); hydratePhotoImages(app); syncBottomNavigation();
  } catch (error) { dbError = error; app.innerHTML = shell(emptyState("⚠️", "本地数据库暂不可用", databaseUnavailableMessage(), `<button class="local-button" type="button" data-db-retry>重试</button>`), "Beer Journal"); }
}
function tastingBeerSelectPage(beers) { return `<div class="select-beer-page"><a class="back-link" href="#/tastings" data-back-path="/tastings">← 返回饮用记录</a><section class="screen-heading"><p class="screen-kicker">NEW TASTING</p><h1>选择一款啤酒</h1><p>找到它后，马上记录这次饮用。</p></section><form class="beer-picker-form record-form" data-beer-select-search><label class="search-field" for="beer-search">按名称搜索</label><input id="beer-search" name="query" type="search" placeholder="输入啤酒名称" autocomplete="off"><div class="beer-picker-list" data-beer-picker-list>${beers.map((beer) => `<label class="beer-picker-card app-card"><input type="radio" name="select_beer" value="${beer.id}"><span class="picker-radio" aria-hidden="true"></span><span class="picker-copy"><strong>${esc(beer.name)}</strong><em>${esc(beer.brand || "未填写品牌")}</em><small>${esc(beer.country_name || "")} · ${esc(beer.category || "未分类")} · ${esc(beer.style || "未填写")}</small></span></label>`).join("") || `<p class="muted">还没有可选的啤酒。</p>`}</div><button type="button" class="button" data-start-selected-tasting>继续记录</button></form><section class="new-beer-callout app-card"><h2>没有这款啤酒？</h2><p>先补充啤酒资料，保存后再添加首次饮用。</p>${button("创建新啤酒", "/beers/new", "button-secondary")}</section></div>`; }
function syncBottomNavigation() { const current = normalizeRoute(route().split("?")[0]); bottomNavigation?.querySelectorAll("[data-route]").forEach((link) => link.classList.toggle("is-active", link.dataset.route === current || (current.startsWith("/beers/") && link.dataset.route === HOME) || (current.startsWith("/tastings/") && link.dataset.route === "/tastings"))); }

document.addEventListener("click", async (event) => {
  const resetFilters = event.target.closest?.("[data-filter-reset]");
  if (resetFilters) {
    event.preventDefault();
    event.stopImmediatePropagation();
    filters = { query: "", category: "", style: "", country_code: "", country_name: "", min_rating: "", max_rating: "", mouthfeel_rating: "", tag_ids: [], tag_match: "and", has_photo: "", order: "created" };
    overlayManager.closeOverlay("filter-sheet");
    await render();
    return;
  }
  const add = event.target.closest("[data-add-beer]"); if (add) { event.preventDefault(); navigate("/beers/new"); return; }
  const link = event.target.closest("a[data-route]"); if (link) { event.preventDefault(); if (!overlayManager.hasOpenOverlay()) navigate(link.dataset.route); return; }
  const back = event.target.closest("[data-back-path]"); if (back) { navigate(back.dataset.backPath); return; }
  if (event.target.closest("[data-country-picker]")) { openCountryPicker("form"); return; }
  const choice = event.target.closest("[data-choice-picker]"); if (choice) { openChoicePicker(choice.dataset.choicePicker); return; }
  if (event.target.closest("[data-purchase-picker]")) { openPurchaseChannelPicker(); return; }
  if (event.target.closest("[data-date-picker]")) { openDatePicker(event.target.closest("[data-date-picker]")); return; }
  const pendingDelete = event.target.closest("[data-photo-pending-delete]");
  if (pendingDelete) {
    const form = pendingDelete.closest("form");
    removePendingPhoto(form, Number(pendingDelete.dataset.photoPendingDelete));
    pendingDelete.closest(".photo-item")?.remove();
    form?.querySelectorAll(".photo-item--pending [data-photo-pending-delete]").forEach((button, index) => { button.dataset.photoPendingDelete = String(index); });
    return;
  }
  const editor = event.target.closest("[data-tag-editor]"); const remove = event.target.closest("[data-remove-tag]"); if (remove && editor) { updateTagEditor(editor, JSON.parse(editor.dataset.tags || "[]").filter((name) => normalizeTagName(name) !== normalizeTagName(remove.dataset.removeTag))); return; }
  if (event.target.closest("[data-add-tag]") && editor) { addTags(editor, editor.querySelector("[data-tag-input]").value); return; }
  const suggestion = event.target.closest("[data-tag-suggestion]"); if (suggestion) { addTags(suggestion.closest("[data-tag-editor]"), suggestion.dataset.tagSuggestion); return; }
  if (event.target.closest("[data-photo-delete]")) { await localDataAdapter.deletePhoto(event.target.closest("[data-photo-delete]").dataset.photoDelete); await render(); return; }
  if (event.target.closest("[data-photo-cover]")) {
    const button = event.target.closest("[data-photo-cover]");
    const section = button.closest("[data-photo-section]");
    await localDataAdapter.setCover(button.dataset.photoCover, section?.dataset.ownerType, section?.dataset.ownerId);
    await render();
    return;
  }
  if (event.target.closest("[data-camera-photo]")) { const form = event.target.closest("form"); const photo = await localDataAdapter.takePhoto(); if (photo) { try { const prepared = await localDataAdapter.preparePhoto(photo); const files = [...(pendingFiles.get(form) || []), prepared]; pendingFiles.set(form, files); appendPendingPhotoPreview(form, prepared, files.length - 1); } catch (error) { showToast(error.message || "照片处理失败，请重试"); } } return; }
  if (event.target.closest("[data-filter-open]")) { renderFilterPortal(); return; }
  if (event.target.closest("[data-filter-close], [data-filter-overlay]")) { overlayManager.closeOverlay("filter-sheet"); return; }
  const category = event.target.closest("[data-filter-category]"); if (category) { filters.category = category.dataset.filterCategory; if (!filters.category) filters.style = ""; document.querySelectorAll("[data-filter-category]").forEach((node) => node.classList.toggle("is-selected", node === category)); renderFilterPortal(); return; }
  const style = event.target.closest("[data-filter-style]"); if (style) { filters.style = style.dataset.filterStyle; renderFilterPortal(); return; }
  const tag = event.target.closest("[data-filter-tag]"); if (tag) { const id = tag.dataset.filterTag; filters.tag_ids = filters.tag_ids.includes(id) ? filters.tag_ids.filter((value) => value !== id) : [...filters.tag_ids, id]; renderFilterPortal(); return; }
  const match = event.target.closest("[data-filter-match]"); if (match) { filters.tag_match = match.dataset.filterMatch; renderFilterPortal(); return; }
  const photoFilter = event.target.closest("[data-filter-photo]"); if (photoFilter) { filters.has_photo = photoFilter.dataset.filterPhoto; renderFilterPortal(); return; }
  const order = event.target.closest("[data-filter-order]"); if (order) { filters.order = order.dataset.filterOrder; renderFilterPortal(); return; }
  const clear = event.target.closest("[data-clear-filter]"); if (clear) { if (clear.dataset.clearFilter === "category") filters.category = ""; if (clear.dataset.clearFilter === "style") filters.style = ""; if (clear.dataset.clearFilter === "country") { filters.country_code = ""; filters.country_name = ""; } if (clear.dataset.clearFilter === "tag") filters.tag_ids = []; if (clear.dataset.clearFilter === "photo") filters.has_photo = ""; if (clear.dataset.clearFilter === "rating") { filters.min_rating = ""; filters.max_rating = ""; } await render(); return; }
  if (event.target.closest("[data-filter-country]")) { openCountryPicker("filter"); return; }
  if (event.target.closest("[data-filter-reset]")) { filters = { query: "", category: "", style: "", country_code: "", country_name: "", min_rating: "", max_rating: "", mouthfeel_rating: "", tag_ids: [], tag_match: "and", has_photo: "", order: "recent" }; overlayManager.closeOverlay("filter-sheet"); await render(); return; }
  if (event.target.closest("[data-filter-apply]")) { filters.min_rating = document.querySelector("[data-filter-min]")?.value || ""; filters.max_rating = document.querySelector("[data-filter-max]")?.value || ""; overlayManager.closeOverlay("filter-sheet"); await render(); return; }
  if (event.target.closest("[data-delete-beer]")) { openDeleteConfirm("beer", event.target.closest("[data-delete-beer]").dataset.deleteBeer); return; }
  if (event.target.closest("[data-delete-tasting]")) { openDeleteConfirm("tasting", event.target.closest("[data-delete-tasting]").dataset.deleteTasting); return; }
  if (event.target.closest("[data-confirm-close]")) { overlayManager.closeTopOverlay(); return; }
  const confirm = event.target.closest("[data-confirm-accept]"); if (confirm) { const kind = confirm.dataset.deleteKind; const id = confirm.dataset.deleteId; overlayManager.closeTopOverlay(); if (kind === "beer") { await localDataAdapter.softDeleteBeer(id); navigate(HOME); } else { const tasting = await localDataAdapter.getTastingById(id); await localDataAdapter.softDeleteTasting(id); navigate(tasting ? `/beers/${tasting.beer_id}` : "/tastings"); } return; }
  const restoreBeer = event.target.closest("[data-restore-beer]"); if (restoreBeer) { await localDataAdapter.restoreBeer(restoreBeer.dataset.restoreBeer); await render(); return; }
  const restoreTasting = event.target.closest("[data-restore-tasting]"); if (restoreTasting) { await localDataAdapter.restoreTasting(restoreTasting.dataset.restoreTasting); await render(); return; }
  const restorePhoto = event.target.closest("[data-restore-photo]"); if (restorePhoto) { await localDataAdapter.restorePhoto(restorePhoto.dataset.restorePhoto); await render(); return; }
  if (event.target.closest("[data-db-retry]")) { dbError = null; await render(); return; }
  if (event.target.closest("[data-start-selected-tasting]")) { const id = document.querySelector('[name="select_beer"]:checked')?.value; if (id) navigate(`/tastings/new?beer_id=${id}`); return; }
  const period = event.target.closest("[data-period]"); if (period) { tastingFilters.period = period.dataset.period; await render(); return; }
  if (event.target.closest("[data-backup-export]")) { await localDataAdapter.downloadBackup(); return; }
  if (event.target.closest("[data-clear-data]")) { if (window.confirm("确定清空本地所有数据吗？此操作不可撤销。")) { await localDataAdapter.clearAll(); await render(); } return; }
});

document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-photo-input]")) {
    const form = event.target.closest("form");
    const files = [...event.target.files];
    const existing = pendingFiles.get(form) || [];
    const prepared = await Promise.all(files.map(async (file) => {
      try { return await localDataAdapter.preparePhoto(file); }
      catch (error) { showToast(error.message || "照片处理失败，请重试"); return null; }
    }));
    const valid = prepared.filter(Boolean);
    pendingFiles.set(form, [...existing, ...valid]);
    valid.forEach((photo, offset) => appendPendingPhotoPreview(form, photo, existing.length + offset));
    event.target.value = "";
  }
  if (event.target.matches("[data-backup-import]")) { try { await localDataAdapter.importFile(event.target.files[0]); await render(); } catch (error) { showToast(error.message || "导入失败，请重试"); } }
});
document.addEventListener("input", async (event) => { if (!event.target.matches("[data-tag-input]")) return; const suggestions = event.target.closest("[data-tag-editor]")?.querySelector("[data-tag-suggestions]"); const query = event.target.value.trim(); if (!query) { suggestions.hidden = true; return; } const matches = await localDataAdapter.searchTags(query); suggestions.innerHTML = matches.slice(0, 8).map((tag) => `<button type="button" data-tag-suggestion="${esc(tag.name)}">${esc(tag.name)}</button>`).join(""); suggestions.hidden = !matches.length; });
document.addEventListener("keydown", (event) => { if (event.key === "Enter" && event.target.matches("[data-tag-input]")) { event.preventDefault(); addTags(event.target.closest("[data-tag-editor]"), event.target.value); } });
document.addEventListener("submit", async (event) => {
  if (!(event.target instanceof HTMLFormElement) || !event.target.matches("[data-beer-form], [data-tasting-form]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = event.target;
  const submit = form.querySelector("[type=submit]");
  const originalSubmitText = submit?.textContent || "保存";
  if (submit) {
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = "保存中…";
  }
  try {
    await nextPaint();
    if (form.matches("[data-tasting-form][data-tasting-id]")) {
      const beerInput = form.querySelector('[name="beer_id"]');
      const tasting = await localDataAdapter.getTastingById(form.dataset.tastingId);
      if (!tasting?.beer_id) throw new Error("关联的啤酒不存在或已删除");
      if (beerInput) beerInput.value = tasting.beer_id;
    }
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.flavor_tags = fd.getAll("flavor_tags");
    if (form.matches("[data-beer-form]")) {
      const beer = form.dataset.beerId ? await localDataAdapter.updateBeer(form.dataset.beerId, payload) : await localDataAdapter.createBeer(payload);
      const photoSave = savePendingPhotos(form, "beer", beer.id).catch((error) => { showToast(error.message || "照片保存失败，请重试"); });
      if (form.dataset.beerId) { await photoSave; navigate(`/beers/${beer.id}`, true); }
      else { firstTastingSheet(beer); void photoSave; }
    } else {
      const tasting = form.dataset.tastingId ? await localDataAdapter.updateTasting(form.dataset.tastingId, payload) : await localDataAdapter.createTasting(payload);
      await savePendingPhotos(form, "tasting", tasting.id);
      navigate(`/tastings/${tasting.id}`, Boolean(form.dataset.tastingId));
    }
  } catch (error) {
    showToast(error.message || "保存失败，请重试");
    if (submit) {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = originalSubmitText;
    }
  }
}, true);
document.addEventListener("submit", async (event) => {
  if (event.target.matches("[data-search-form]")) { event.preventDefault(); filters.query = new FormData(event.target).get("query") || ""; await render(); return; }
  if (event.target.matches("[data-tasting-search-form]")) { event.preventDefault(); tastingFilters.query = new FormData(event.target).get("query") || ""; await render(); return; }
  if (event.target.matches("[data-beer-select-search]")) { event.preventDefault(); const query = new FormData(event.target).get("query"); const beers = await localDataAdapter.searchBeers(query); event.target.closest(".select-beer-page").querySelector("[data-beer-picker-list]").innerHTML = beers.map((beer) => `<label class="beer-picker-card app-card"><input type="radio" name="select_beer" value="${beer.id}"><span class="picker-radio" aria-hidden="true"></span><span class="picker-copy"><strong>${esc(beer.name)}</strong><em>${esc(beer.brand || "未填写品牌")}</em><small>${esc(beer.country_name || "")} · ${esc(beer.category || "未分类")} · ${esc(beer.style || "未填写")}</small></span></label>`).join(""); return; }
  if (!event.target.matches("[data-beer-form], [data-tasting-form]")) return; event.preventDefault(); const form = event.target; const submit = form.querySelector("[type=submit]"); submit.disabled = true; try { const fd = new FormData(form); const payload = Object.fromEntries(fd.entries()); payload.flavor_tags = fd.getAll("flavor_tags"); if (form.matches("[data-beer-form]")) { const beer = form.dataset.beerId ? await localDataAdapter.updateBeer(form.dataset.beerId, payload) : await localDataAdapter.createBeer(payload); await savePendingPhotos(form, "beer", beer.id); if (form.dataset.beerId) navigate(`/beers/${beer.id}`, true); else firstTastingSheet(beer); } else { const tasting = form.dataset.tastingId ? await localDataAdapter.updateTasting(form.dataset.tastingId, payload) : await localDataAdapter.createTasting(payload); await savePendingPhotos(form, "tasting", tasting.id); navigate(`/tastings/${tasting.id}`, Boolean(form.dataset.tastingId)); } } catch (error) { showToast(error.message || "保存失败，请重试"); submit.disabled = false; } });

async function hideKeyboard() { await globalThis.Capacitor?.Plugins?.Keyboard?.hide?.().catch?.(() => {}); document.activeElement?.blur?.(); }
function isKeyboardVisible() { const active = document.activeElement; return Boolean(active?.matches?.("input,textarea,select") && ((window.visualViewport && window.innerHeight - window.visualViewport.height > 100) || active !== document.body)); }
async function goBack() { if (isKeyboardVisible()) { await hideKeyboard(); return; } if (overlayManager.hasOpenOverlay()) { overlayManager.closeTopOverlay(); return; } const current = normalizeRoute(route().split("?")[0]); if (current !== HOME && window.history.length > 1) { window.history.back(); return; } if (current !== HOME) { navigate(HOME, true); return; } if (Date.now() < exitArmedUntil) { App.exitApp?.(); return; } exitArmedUntil = Date.now() + 2200; showToast("再次按返回键退出 Beer Journal"); setTimeout(() => { exitArmedUntil = 0; }, 2200); }
App.addListener?.("backButton", goBack);
App.addListener?.("appStateChange", ({ isActive }) => {
  // Returning from the native photo picker/camera must not recreate an active
  // form: doing so would discard unsaved fields and pending photo previews.
  if (isActive && !document.querySelector("[data-beer-form], [data-tasting-form]")) render();
});
window.addEventListener("hashchange", render); window.addEventListener("popstate", render);
window.addEventListener("pageshow", () => {
  // Native pickers can resume the WebView with a pageshow event. Keep an
  // active form intact so unsaved fields and pending photo previews survive.
  if (!document.querySelector("[data-beer-form], [data-tasting-form]")) render();
});
// Tasting edit forms render a hidden beer_id from the tasting record. Resolve
// that association at the submit boundary so an edit can never submit the
// tasting UUID as its beer UUID.
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-tasting-form][data-tasting-id]") || form.dataset.beerIdFixed === "1") return;
  const tastingId = form.dataset.tastingId;
  const beerInput = form.querySelector('[name="beer_id"]');
  if (!tastingId || !beerInput) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    const tasting = await localDataAdapter.getTastingById(tastingId);
    if (!tasting?.beer_id) throw new Error("关联的啤酒不存在或已删除");
    beerInput.value = tasting.beer_id;
    form.dataset.beerIdFixed = "1";
    form.requestSubmit();
  } catch (error) {
    showToast(error.message || "保存失败，请重试");
  }
}, true);
async function initialize() { try { await preloadLogo(); await initializeDatabase(); await render(); } catch (error) { dbError = error; await render(); } }
if (!window.location.hash) window.history.replaceState({}, "", `#${HOME}`);
initialize();
