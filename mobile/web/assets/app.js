import { beerRepository } from "./beer-repository.js";
import { databaseUnavailableMessage, initializeDatabase } from "./database.js";
import { COUNTRIES, countrySearchText, findCountry, flagForCountry } from "./countries.js";
import { normalizeRoute, parseBeerDetailRoute, parseBeerEditRoute, readRoute } from "./route-utils.mjs";
import { tastingRepository } from "./tasting-repository.js";
import { overlayManager } from "./overlay-manager.mjs";
import { renderFiveOptionRating, renderFiveOptionSummary } from "./five-option-rating.mjs";

const app = document.querySelector("#route-content");
const appShell = document.querySelector("[data-app-shell]");
const appLogo = document.querySelector("#app-logo");
const bottomNavigation = document.querySelector("[data-app-bottom-nav]");
const HOME = "/beers";
const BUILD_LABEL = "beta3-ratingfix";
const BUILD_VERSION_CODE = 14;
const CATEGORIES = ["拉格", "艾尔"];
const STYLES = {
  拉格: ["皮尔森", "淡色拉格", "黑拉格"],
  艾尔: ["IPA", "小麦啤酒", "世涛"],
};
let dbReady = false;
let dbError = null;
let exitArmedUntil = 0;
let renderSerial = 0;
let filters = { query: "", category: "", country_code: "", country_name: "", min_rating: "", max_rating: "" };
let tastingFilters = { query: "" };

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let lastRouteDebug = null;
const route = () => readRoute(window.location, HOME);
const navigate = (path, replace = false) => {
  const next = `#${path}`;
  if (replace) window.history.replaceState({}, "", next);
  else window.history.pushState({}, "", next);
  render();
};
const stars = (value) => value === "" || value === null || value === undefined ? "—" : `${"★".repeat(Number(value))}${"☆".repeat(5 - Number(value))}`;
const localDateTime = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const displayDate = (value) => value ? new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" }) : "未记录";
const money = (value) => value === "" || value === null || value === undefined ? "未记录" : `¥${Number(value).toFixed(2)}`;

const pageHeading = (title, subtitle = "") => `<h1 class="local-page-title">${title}</h1>${subtitle ? `<p class="local-subtitle">${subtitle}</p>` : ""}`;
const buildInfo = () => `<footer class="local-build-info"><strong>Build: ${BUILD_LABEL}</strong><span>Version code: ${BUILD_VERSION_CODE}</span>${lastRouteDebug ? `<details open><summary>Route debug</summary><pre>${esc(JSON.stringify(lastRouteDebug, null, 2))}</pre></details>` : ""}</footer>`;
const shell = (content, title, subtitle = "") => `<div class="local-shell">${pageHeading(title, subtitle)}${content}${buildInfo()}</div>`;
const button = (label, path, className = "") => `<a class="local-button ${className}" href="#${path}" data-route="${path}">${label}</a>`;
const addBeerButton = () => `<button class="local-button" type="button" data-add-beer>添加啤酒</button>`;

const shellDebug = {
  logoNode: appLogo,
  headerNode: document.querySelector("[data-app-header]"),
  bottomNavigationNode: bottomNavigation,
  routeContentNode: app,
  navigationCount: 0,
};
globalThis.__BEER_JOURNAL_SHELL_DEBUG__ = shellDebug;

function captureRouteDebug(source, element = null, targetRoute = "") {
  const location = window.location;
  const raw = location.hash ? location.hash.slice(1) : location.pathname;
  lastRouteDebug = {
    source,
    locationHref: location.href,
    pathname: location.pathname,
    hash: location.hash,
    search: location.search,
    rawRoute: raw,
    normalizedRoute: normalizeRoute(raw),
    dataRoute: element?.dataset?.route || "",
    href: element?.getAttribute?.("href") || "",
    targetRoute: targetRoute || element?.dataset?.route || "",
  };
  console.debug("Beer Journal route debug", lastRouteDebug);
}

function verifyShellStability() {
  const stable = shellDebug.logoNode === document.querySelector("#app-logo")
    && shellDebug.headerNode === document.querySelector("[data-app-header]")
    && shellDebug.bottomNavigationNode === document.querySelector("[data-app-bottom-nav]")
    && shellDebug.routeContentNode === document.querySelector("#route-content");
  if (!stable) console.warn("Beer Journal App Shell DOM changed unexpectedly");
  if (globalThis.__BEER_JOURNAL_DEV__) console.assert(stable, "Beer Journal App Shell nodes must remain stable");
  return stable;
}

async function preloadLogo() {
  if (!appLogo) return;
  appLogo.loading = "eager";
  appLogo.decoding = "async";
  if (appLogo.complete && appLogo.naturalWidth > 0) {
    if (typeof appLogo.decode === "function") await appLogo.decode().catch(() => {});
    return;
  }
  await new Promise((resolve) => {
    appLogo.addEventListener("load", resolve, { once: true });
    appLogo.addEventListener("error", resolve, { once: true });
  });
  if (typeof appLogo.decode === "function") await appLogo.decode().catch(() => {});
}

function emptyState(icon, title, text, action = "") {
  return `<section class="local-card local-empty"><div class="local-empty-icon" aria-hidden="true">${icon}</div><h2>${title}</h2><p>${text}</p>${action}</section>`;
}

function beerCard(beer) {
  const country = findCountry(beer.country_code, beer.country_name);
  return `<a class="local-beer-card" href="#/beers/${beer.id}" data-route="/beers/${beer.id}">
    <div class="local-beer-card-top"><span>${country.flag} ${esc(beer.country_name || country.name)}</span><span class="local-rating">${esc(beer.overall_rating || "—")}</span></div>
    <h2>${esc(beer.name)}</h2><p>${esc(beer.brand || "品牌未填写")}</p>
    <div class="local-beer-meta"><span>${esc(beer.category || "未分类")}</span><span>${esc(beer.style || "未填写风格")}</span></div>
    <div class="local-beer-footer"><span>★ ${esc(beer.overall_rating || "—")}</span><span>${beer.personal_note ? "有个人笔记" : "暂无笔记"}</span></div>
  </a>`;
}

function beerExperienceSummary(beer) {
  return `<section class="local-experience-card"><div class="local-section-title"><h3>我的风格评价</h3><span>长期资料</span></div><div class="five-option-rating-summary-list">${renderFiveOptionSummary("mouthfeel_rating", beer.mouthfeel_rating)}${renderFiveOptionSummary("bitterness_rating", beer.bitterness_rating)}${renderFiveOptionSummary("complexity_rating", beer.complexity_rating)}</div></section>`;
}

function filterSheet() {
  const country = findCountry(filters.country_code, filters.country_name);
  return `<div class="local-sheet-overlay" data-filter-overlay hidden></div><section class="local-sheet" data-filter-sheet hidden aria-label="筛选啤酒">
    <div class="local-sheet-head"><h2>筛选啤酒</h2><button class="local-sheet-close" type="button" data-filter-close aria-label="关闭">×</button></div>
    <div class="local-choice-grid"><button type="button" class="local-choice${!filters.category ? " is-selected" : ""}" data-filter-category="">全部分类</button>${CATEGORIES.map((item) => `<button type="button" class="local-choice${filters.category === item ? " is-selected" : ""}" data-filter-category="${esc(item)}">${esc(item)}</button>`).join("")}</div>
    <button class="local-picker-trigger" type="button" data-filter-country><span>国家</span><strong>${country.flag} ${esc(filters.country_code || filters.country_name ? country.name : "全部国家")}</strong></button>
    <div class="local-range"><label>最低评分<input type="number" min="0" max="10" step="0.5" value="${esc(filters.min_rating)}" data-filter-min></label><label>最高评分<input type="number" min="0" max="10" step="0.5" value="${esc(filters.max_rating)}" data-filter-max></label></div>
    <div class="local-actions"><button class="local-button" type="button" data-filter-apply>应用筛选</button><button class="local-button secondary" type="button" data-filter-reset>重置</button></div>
  </section>`;
}

function listPage(beers) {
  const content = `<section class="local-search-row"><form class="local-search-form" data-search-form><input name="query" value="${esc(filters.query)}" placeholder="搜索名称、品牌、国家" aria-label="搜索啤酒"><button type="submit">搜索</button></form><button class="local-filter-button" type="button" data-filter-open>筛选</button></section>
    <div class="local-filter-summary">${filters.category ? `<span>${esc(filters.category)}</span>` : ""}${filters.country_code || filters.country_name ? `<span>${findCountry(filters.country_code, filters.country_name).flag} ${esc(findCountry(filters.country_code, filters.country_name).name)}</span>` : ""}${filters.min_rating || filters.max_rating ? `<span>评分范围</span>` : ""}</div>
    ${beers.length ? `<section class="local-beer-list">${beers.map(beerCard).join("")}</section>` : emptyState("＋", "还没有匹配的啤酒", filters.query || filters.category || filters.country_code || filters.country_name ? "可以调整搜索或筛选条件。" : "你的本地收藏会保存在这台手机上，断网也可以继续使用。", addBeerButton())}${filterSheet()}`;
  return shell(content, "我的啤酒", `${beers.length} 款本地收藏`);
}

function countryButton(code, name) {
  const country = findCountry(code, name);
  const selectedName = String(name || (code ? country.name : "")).trim();
  const displayName = selectedName || "未选择国家";
  const flag = code ? country.flag : (selectedName ? "🌐" : "");
  return `<input type="hidden" name="country_code" value="${esc(code)}"><input type="hidden" name="country_name" value="${esc(selectedName)}"><button class="local-picker-trigger" type="button" data-country-picker><span>国家</span><strong>${flag ? `${flag} ` : ""}${esc(displayName)}</strong></button>`;
}

function choiceButton(type, value, label) {
  return `<input type="hidden" name="${type}" value="${esc(value)}"><button class="local-picker-trigger" type="button" data-choice-picker="${type}"><span>${type === "category" ? "啤酒大类" : "啤酒风格"}</span><strong>${esc(label || "请选择")}</strong></button>`;
}

function beerForm(beer = null) {
  const editing = Boolean(beer);
  return `<section class="local-card local-form-card"><a class="local-back" href="#${editing ? `/beers/${beer.id}` : HOME}" data-route="${editing ? `/beers/${beer.id}` : HOME}">← 返回</a><h2>${editing ? "编辑啤酒" : "添加啤酒"}</h2><form data-beer-form data-beer-id="${esc(beer?.id || "")}">
    <label>名称<input name="name" required maxlength="200" value="${esc(beer?.name)}" placeholder="例如 Sierra Nevada Pale Ale"></label>
    <label>品牌<input name="brand" maxlength="200" value="${esc(beer?.brand)}" placeholder="品牌"></label>
    <label>酒厂<input name="brewery" maxlength="200" value="${esc(beer?.brewery)}" placeholder="酒厂"></label>
    ${countryButton(beer?.country_code || "", beer?.country_name || "未选择国家")}
    ${choiceButton("category", beer?.category || "", beer?.category || "请选择大类")}
    ${choiceButton("style", beer?.style || "", beer?.style || "请选择风格")}
    <div class="local-form-grid"><label>ABV<input type="number" name="abv" min="0" max="100" step="0.01" value="${esc(beer?.abv)}"></label><label>Plato<input type="number" name="plato" min="0" max="100" step="0.01" value="${esc(beer?.plato)}"></label></div>
    <label>默认容量（ml）<input type="number" name="default_volume_ml" min="1" step="1" value="${esc(beer?.default_volume_ml)}"></label>
    <label>总体评分（0-10）<input type="number" name="overall_rating" min="0" max="10" step="0.1" value="${esc(beer?.overall_rating)}"></label>
    <div class="five-option-rating-grid">${renderFiveOptionRating("mouthfeel_rating", beer?.mouthfeel_rating)}${renderFiveOptionRating("bitterness_rating", beer?.bitterness_rating)}</div>
    ${renderFiveOptionRating("complexity_rating", beer?.complexity_rating)}
    <label>个人感想<textarea name="personal_note" rows="4" maxlength="5000" placeholder="记录你的长期印象">${esc(beer?.personal_note)}</textarea></label>
    <button class="local-button" type="submit">${editing ? "保存修改" : "保存啤酒"}</button>
  </form></section>`;
}

function tastingCard(tasting) {
  return `<a class="local-beer-card local-tasting-card" href="#/tastings/${tasting.id}" data-route="/tastings/${tasting.id}">
    <div class="local-beer-card-top"><span>${esc(displayDate(tasting.consumed_at))}</span><span class="local-rating">${esc(tasting.rating || "—")}</span></div>
    <h2>${esc(tasting.beer_name || "未关联啤酒")}</h2>
    <p>${esc(tasting.location || "未记录地点")}</p>
    <div class="local-beer-meta"><span>${esc(tasting.volume_ml || "—")} ml × ${esc(tasting.bottle_count || "—")}</span><span>${esc(tasting.purchase_channel || "未记录渠道")}</span></div>
    <div class="local-beer-footer"><span>★ ${esc(tasting.rating || "—")}</span><span>${esc(tasting.note || "暂无笔记")}</span></div>
  </a>`;
}

function tastingListPage(tastings) {
  const content = `<section class="local-search-row"><form class="local-search-form" data-tasting-search-form><input name="query" value="${esc(tastingFilters.query)}" placeholder="搜索啤酒、地点或笔记" aria-label="搜索饮用记录"><button type="submit">搜索</button></form></section>
    ${tastings.length ? `<section class="local-beer-list">${tastings.map(tastingCard).join("")}</section>` : emptyState("📝", "还没有饮用记录", tastingFilters.query ? "可以换一个搜索词。" : "记录每一次真实品饮，形成你的本地饮酒日记。", button("记录本次饮用", "/tastings/new"))}`;
  return shell(content, "饮用记录", `${tastings.length} 条本地记录`);
}

function tastingBeerSelectPage(beers) {
  const options = beers.length ? beers.map((beer) => `<a class="local-beer-card" href="#/tastings/new?beer_id=${encodeURIComponent(beer.id)}" data-route="/tastings/new?beer_id=${encodeURIComponent(beer.id)}"><h2>${esc(beer.name)}</h2><p>${esc(beer.brand || "品牌未填写")}</p><div class="local-beer-meta"><span>${esc(beer.country_name || "未选择国家")}</span><span>${esc(beer.category || "未分类")} · ${esc(beer.style || "未填写风格")}</span></div></a>`).join("") : emptyState("🍺", "还没有啤酒", "先添加一款啤酒，再记录饮用。", addBeerButton());
  return shell(`<a class="local-back" href="#/tastings" data-route="/tastings">← 返回饮用记录</a><section class="local-card"><h2>选择啤酒</h2><p class="local-note">选择已有啤酒后填写本次饮用信息。</p></section><section class="local-beer-list">${options}</section>`, "记录饮用");
}

function tastingForm(tasting = null, beer = null) {
  const editing = Boolean(tasting);
  const selectedBeer = beer || tasting;
  const beerId = tasting?.beer_id || beer?.id || "";
  return shell(`<section class="local-card local-form-card"><a class="local-back" href="#${editing ? `/tastings/${tasting.id}` : (beer ? `/beers/${beer.id}` : "/tastings")}" data-route="${editing ? `/tastings/${tasting.id}` : (beer ? `/beers/${beer.id}` : "/tastings")}">← 返回</a><h2>${editing ? "编辑饮用记录" : "记录本次饮用"}</h2><form data-tasting-form data-tasting-id="${esc(tasting?.id || "")}" data-beer-id="${esc(beerId)}">
    <label>关联啤酒<input type="text" value="${esc(selectedBeer?.beer_name || selectedBeer?.name || "请选择啤酒")}" readonly></label>
    <input type="hidden" name="beer_id" value="${esc(beerId)}">
    <label>饮用时间<input type="datetime-local" name="consumed_at" required value="${esc(tasting?.consumed_at ? localDateTime(tasting.consumed_at) : localDateTime())}"></label>
    <label>地点<input name="location" maxlength="200" value="${esc(tasting?.location)}" placeholder="例如：家里、酒吧"></label>
    <div class="local-form-grid"><label>容量（ml）<input type="number" name="volume_ml" min="1" step="1" required value="${esc(tasting?.volume_ml ?? beer?.default_volume_ml ?? "")}"></label><label>瓶数<input type="number" name="bottle_count" min="1" step="1" required value="${esc(tasting?.bottle_count ?? 1)}"></label></div>
    <label>购买渠道<input name="purchase_channel" maxlength="100" value="${esc(tasting?.purchase_channel)}" placeholder="线上、线下或赠送"></label>
    <div class="local-form-grid"><label>价格（元）<input type="number" name="price" min="0" step="0.01" value="${esc(tasting?.price)}"></label><label>本次评分（0-10）<input type="number" name="rating" min="0" max="10" step="0.1" value="${esc(tasting?.rating)}"></label></div>
    <label>品饮笔记<textarea name="note" rows="5" maxlength="5000" placeholder="记录这次品饮的感受">${esc(tasting?.note)}</textarea></label>
    <button class="local-button" type="submit">${editing ? "保存修改" : "保存饮用记录"}</button>
  </form></section>`, editing ? "编辑饮用记录" : "记录饮用");
}

function tastingDetailPage(tasting) {
  const country = findCountry(tasting.beer_country_code, tasting.beer_country_name);
  return shell(`<a class="local-back" href="#/beers/${tasting.beer_id}" data-route="/beers/${tasting.beer_id}">← 返回啤酒详情</a><section class="local-card local-detail-card"><div class="local-detail-flag">${country.flag}</div><h2>${esc(tasting.beer_name)}</h2><p>${esc(tasting.beer_brand || "品牌未填写")} · ${esc(tasting.beer_country_name || country.name)}</p><div class="local-stat-grid"><div class="local-stat"><strong>${esc(tasting.rating || "—")}</strong><span>本次评分</span></div><div class="local-stat"><strong>${esc(tasting.volume_ml || "—")}</strong><span>容量 ml</span></div><div class="local-stat"><strong>${esc(tasting.bottle_count || "—")}</strong><span>瓶数</span></div></div><div class="local-beer-meta"><span>${esc(displayDate(tasting.consumed_at))}</span><span>${esc(tasting.location || "未记录地点")}</span><span>${money(tasting.price)}</span></div><p class="local-note">${esc(tasting.note || "暂无品饮笔记")}</p><div class="local-actions">${button("编辑记录", `/tastings/${tasting.id}/edit`, "secondary")}<button class="local-button danger" type="button" data-delete-tasting="${esc(tasting.id)}">删除记录</button></div></section>`, "饮用记录详情");
}

function firstTastingSheet(beer) {
  const root = document.createElement("div");
  root.className = "local-first-tasting-sheet";
  root.innerHTML = `<div class="local-sheet-overlay" data-first-tasting-close></div><section class="local-sheet"><div class="local-sheet-head"><h2>啤酒已保存</h2><button class="local-sheet-close" type="button" data-first-tasting-close>×</button></div><p class="local-note">要现在记录第一次品饮吗？不会自动创建空记录。</p><div class="local-actions"><button class="local-button" type="button" data-first-tasting-add>添加首次品饮</button><button class="local-button secondary" type="button" data-first-tasting-later>稍后添加</button></div></section>`;
  document.body.append(root);
  overlayManager.openOverlay({ id: "first-tasting", element: root });
  const close = () => overlayManager.closeOverlay("first-tasting");
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-first-tasting-close], [data-first-tasting-later]")) { close(); navigate(`/beers/${beer.id}`); return; }
    if (event.target.closest("[data-first-tasting-add]")) { close(); navigate(`/tastings/new?beer_id=${encodeURIComponent(beer.id)}`); }
  });
}

function detailPage(beer) {
  const country = findCountry(beer.country_code, beer.country_name);
  return shell(`<a class="local-back" href="#${HOME}" data-route="${HOME}">← 返回我的啤酒</a><section class="local-card local-detail-card"><div class="local-detail-flag">${country.flag}</div><h2>${esc(beer.name)}</h2><p>${esc(beer.brand || "品牌未填写")} · ${esc(beer.brewery || "酒厂未填写")}</p><div class="local-beer-meta"><span>${esc(beer.category || "未分类")}</span><span>${esc(beer.style || "未填写风格")}</span><span>${esc(beer.country_name || country.name)}</span></div><div class="local-stat-grid"><div class="local-stat"><strong>${esc(beer.overall_rating || "—")}</strong><span>总体评分</span></div><div class="local-stat"><strong>${esc(beer.abv || "—")}</strong><span>ABV</span></div><div class="local-stat"><strong>${esc(beer.default_volume_ml || "—")}</strong><span>容量 ml</span></div></div>${beerExperienceSummary(beer)}<p class="local-note">${esc(beer.personal_note || "暂无个人感想")}</p><div class="local-actions">${button("编辑资料", `/beers/${beer.id}/edit`, "secondary")}<button class="local-button danger" type="button" data-delete-beer="${esc(beer.id)}">删除啤酒</button></div></section>`, beer.name);
}

function secondaryPage(title, text, action = "") {
  return shell(`<a class="local-back" href="#${HOME}" data-route="${HOME}">← 返回</a><section class="local-card"><h2>${title}</h2><p class="local-note">${text}</p>${action ? `<div class="local-actions">${action}</div>` : ""}</section>`, title);
}

function profilePage(beers) {
  return shell(`<section class="local-card"><h2>我的啤酒画像</h2><div class="local-stat-grid"><div class="local-stat"><strong>${beers.length}</strong><span>收藏</span></div><div class="local-stat"><strong>0</strong><span>品饮</span></div><div class="local-stat"><strong>—</strong><span>平均评分</span></div></div></section><section class="local-card"><h2>本地数据</h2><p class="local-note">v1.0 数据保存在当前设备。云同步将在 v1.1 提供。</p><div class="local-actions">${button("设置与数据管理", "/settings", "secondary")}</div></section>`, "个人数据", "只属于你的啤酒记录");
}

function detailPageWithTastings(beer, tastings, tastingStats) {
  const country = findCountry(beer.country_code, beer.country_name);
  const history = tastings.length ? `<div class="local-beer-list">${tastings.map(tastingCard).join("")}</div>` : `<p class="local-note">还没有这款啤酒的饮用记录。</p>`;
  return shell(`<a class="local-back" href="#${HOME}" data-route="${HOME}">← 返回我的啤酒</a><section class="local-card local-detail-card"><div class="local-detail-flag">${country.flag}</div><h2>${esc(beer.name)}</h2><p>${esc(beer.brand || "品牌未填写")} · ${esc(beer.brewery || "酒厂未填写")}</p><div class="local-beer-meta"><span>${esc(beer.category || "未分类")}</span><span>${esc(beer.style || "未填写风格")}</span><span>${esc(beer.country_name || country.name)}</span></div><div class="local-stat-grid"><div class="local-stat"><strong>${esc(beer.overall_rating || "—")}</strong><span>总体评分</span></div><div class="local-stat"><strong>${esc(beer.abv || "—")}</strong><span>ABV</span></div><div class="local-stat"><strong>${esc(beer.default_volume_ml || "—")}</strong><span>容量 ml</span></div></div>${beerExperienceSummary(beer)}<p class="local-note">${esc(beer.personal_note || "暂无个人感想")}</p><div class="local-actions">${button("编辑资料", `/beers/${beer.id}/edit`, "secondary")}<button class="local-button danger" type="button" data-delete-beer="${esc(beer.id)}">删除啤酒</button></div></section><section class="local-card"><div class="local-section-title"><h2>我的品饮历史</h2>${button("记录本次饮用", `/tastings/new?beer_id=${beer.id}`, "secondary")}</div><div class="local-stat-grid"><div class="local-stat"><strong>${esc(tastingStats.tasting_count || 0)}</strong><span>饮用次数</span></div><div class="local-stat"><strong>${esc(tastingStats.bottle_count || 0)}</strong><span>总瓶数</span></div><div class="local-stat"><strong>${esc(tastingStats.latest_consumed_at ? displayDate(tastingStats.latest_consumed_at) : "—")}</strong><span>最近饮用</span></div></div>${history}</section>`, beer.name);
}

function profilePageWithStats(beers, tastingStats) {
  const ratedBeers = beers.filter((beer) => beer.overall_rating !== "");
  const averageBeer = ratedBeers.reduce((sum, beer) => sum + Number(beer.overall_rating), 0) / (ratedBeers.length || 1);
  const countries = new Set(beers.map((beer) => beer.country_code).filter(Boolean)).size;
  return shell(`<section class="local-card"><h2>我的啤酒画像</h2><div class="local-stat-grid"><div class="local-stat"><strong>${beers.length}</strong><span>收藏啤酒</span></div><div class="local-stat"><strong>${esc(tastingStats.tasting_count || 0)}</strong><span>饮用记录</span></div><div class="local-stat"><strong>${tastingStats.average_rating_scaled == null ? "—" : (Number(tastingStats.average_rating_scaled) / 10).toFixed(1)}</strong><span>平均饮用评分</span></div></div></section><section class="local-card"><h2>本地统计</h2><div class="local-stat-grid"><div class="local-stat"><strong>${esc(tastingStats.bottle_count || 0)}</strong><span>总饮用瓶数</span></div><div class="local-stat"><strong>${countries}</strong><span>探索国家</span></div><div class="local-stat"><strong>${ratedBeers.length ? averageBeer.toFixed(1) : "—"}</strong><span>平均 Beer 评分</span></div></div></section><section class="local-card"><h2>本地数据</h2><p class="local-note">数据只保存在当前设备，离线也可以继续记录。</p><div class="local-actions">${button("设置与数据管理", "/settings", "secondary")}</div></section>`, "个人数据", "只属于你的啤酒记录");
}

function tastingDetailPageWithActions(tasting) {
  const country = findCountry(tasting.beer_country_code, tasting.beer_country_name);
  return shell(`<a class="local-back" href="#/beers/${tasting.beer_id}" data-route="/beers/${tasting.beer_id}">← 返回啤酒详情</a><section class="local-card local-detail-card"><div class="local-detail-flag">${country.flag}</div><h2>${esc(tasting.beer_name)}</h2><p>${esc(tasting.beer_brand || "品牌未填写")} · ${esc(tasting.beer_country_name || country.name)}</p><div class="local-stat-grid"><div class="local-stat"><strong>${esc(tasting.rating || "—")}</strong><span>本次评分</span></div><div class="local-stat"><strong>${esc(tasting.volume_ml || "—")}</strong><span>容量 ml</span></div><div class="local-stat"><strong>${esc(tasting.bottle_count || "—")}</strong><span>瓶数</span></div></div><div class="local-beer-meta"><span>${esc(displayDate(tasting.consumed_at))}</span><span>${esc(tasting.location || "未记录地点")}</span><span>${money(tasting.price)}</span></div><p class="local-note">${esc(tasting.note || "暂无品饮笔记")}</p><div class="local-actions"><button class="local-button secondary" type="button" data-tasting-actions="${esc(tasting.id)}">更多操作</button></div></section>`, "饮用记录详情");
}

function openTastingActions(id) {
  overlayManager.closeOverlay("tasting-actions");
  const root = document.createElement("div");
  root.className = "local-tasting-actions";
  root.innerHTML = `<div class="local-sheet-overlay" data-tasting-actions-close></div><section class="local-sheet"><div class="local-sheet-head"><h2>饮用记录操作</h2><button class="local-sheet-close" type="button" data-tasting-actions-close>×</button></div><div class="local-actions"><button class="local-button secondary" type="button" data-tasting-actions-close>查看详情</button><a class="local-button secondary" href="#/tastings/${id}/edit" data-route="/tastings/${id}/edit">编辑记录</a><button class="local-button danger" type="button" data-delete-tasting="${esc(id)}">删除记录</button></div></section>`;
  document.body.append(root);
  overlayManager.openOverlay({ id: "tasting-actions", element: root });
}

function syncBottomNavigation() {
  const current = route();
  bottomNavigation?.querySelectorAll("[data-route]").forEach((link) => {
    const active = link.dataset.route === "/beers" ? current === HOME || current.startsWith("/beers/") : current === link.dataset.route;
    link.classList.toggle("is-active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
}

async function render() {
  if (!app) return;
  shellDebug.navigationCount += 1;
  syncBottomNavigation();
  verifyShellStability();
  const serial = ++renderSerial;
  if (dbError) {
    app.innerHTML = shell(emptyState("!", "本地数据库未就绪", databaseUnavailableMessage(), `<button class="local-button" type="button" data-db-retry>重试初始化</button>`), "Beer Journal");
    return;
  }
  if (!dbReady) {
    app.innerHTML = shell(`<section class="local-card local-empty"><div class="local-empty-icon">…</div><h2>正在打开本地数据库</h2><p>不会连接网络，也不会清空已有数据。</p></section>`, "Beer Journal");
    return;
  }
  const current = route();
  try {
    const [currentPath, queryString = ""] = current.split("?");
    const queryParams = new URLSearchParams(queryString);
    const finishRoute = () => {
      if (serial !== renderSerial) return false;
      app.classList.remove("is-entering");
      void app.offsetWidth;
      app.classList.add("is-entering");
      verifyShellStability();
      document.title = `Beer Journal · ${currentPath === HOME ? "我的啤酒" : "本地应用"}`;
      return true;
    };
    if (currentPath === "/profile") {
      const [beers, tastingStats] = await Promise.all([beerRepository.listBeers(), tastingRepository.getStats()]);
      app.innerHTML = profilePageWithStats(beers, tastingStats);
      finishRoute();
      return;
    }
    if (currentPath === "/tastings") {
      app.innerHTML = tastingListPage(await tastingRepository.listTastings(tastingFilters));
      finishRoute();
      return;
    }
    if (currentPath === "/tastings/new") {
      const beer = queryParams.get("beer_id") ? await beerRepository.getBeerById(queryParams.get("beer_id")) : null;
      app.innerHTML = beer ? tastingForm(null, beer) : tastingBeerSelectPage(await beerRepository.listBeers());
      finishRoute();
      return;
    }
    if (currentPath.startsWith("/tastings/") && currentPath.endsWith("/edit")) {
      const id = currentPath.split("/")[2];
      const tasting = await tastingRepository.getTastingById(id);
      const beer = tasting ? await beerRepository.getBeerById(tasting.beer_id) : null;
      app.innerHTML = tasting && beer ? tastingForm(tasting, beer) : secondaryPage("找不到饮用记录", "这条记录可能已被删除。", button("返回饮用记录", "/tastings"));
      finishRoute();
      return;
    }
    if (currentPath.startsWith("/tastings/")) {
      const tasting = await tastingRepository.getTastingById(currentPath.split("/")[2]);
      app.innerHTML = tasting ? tastingDetailPageWithActions(tasting) : secondaryPage("找不到饮用记录", "这条记录可能已被删除。", button("返回饮用记录", "/tastings"));
      finishRoute();
      return;
    }
    // Keep the create route ahead of the generic /beers/:id detail route.
    // Otherwise /beers/new is interpreted as id="new".
    if (currentPath === "/beers/new") {
      app.innerHTML = shell(beerForm(), "添加啤酒", "记录一款新的啤酒收藏");
      finishRoute();
      return;
    }
    const beerId = parseBeerDetailRoute(currentPath);
    if (beerId) {
      const beer = await beerRepository.getBeerById(beerId);
      if (beer) {
        const [tastings, tastingStats] = await Promise.all([tastingRepository.listTastingsByBeerId(beer.id), tastingRepository.getStatsByBeerId(beer.id)]);
        app.innerHTML = detailPageWithTastings(beer, tastings, tastingStats);
      } else {
        app.innerHTML = secondaryPage("找不到啤酒", "这条记录可能已被删除。", button("返回列表", HOME));
      }
      finishRoute();
      return;
    }
    if (current === HOME) {
      app.innerHTML = listPage(await beerRepository.listBeers(filters));
    } else if (current === "/profile") {
      app.innerHTML = profilePage(await beerRepository.listBeers());
    } else if (current === "/tastings") {
      app.innerHTML = shell(emptyState("✎", "饮用记录将在 L3 开启", "L2 只实现 Beer 本地数据库和完整 CRUD。"), "饮用记录", "你的饮酒日记");
    } else if (current === "/settings") {
      app.innerHTML = secondaryPage("设置与数据管理", "本地备份、导入和清空数据将在 L4 实现。", `<button class="local-button secondary" type="button" disabled>导出备份（L4）</button>`);
    } else if (current === "/beers/new") {
      app.innerHTML = shell(beerForm(), "添加啤酒", "记录一款新的啤酒收藏");
    } else if (parseBeerEditRoute(current)) {
      const id = parseBeerEditRoute(current);
      const beer = await beerRepository.getBeerById(id);
      app.innerHTML = beer ? shell(beerForm(beer), "编辑啤酒", "修改会增加本地 revision") : secondaryPage("找不到啤酒", "这条记录可能已被删除。", button("返回列表", HOME));
    } else if (parseBeerDetailRoute(current)) {
      const beer = await beerRepository.getBeerById(parseBeerDetailRoute(current));
      app.innerHTML = beer ? detailPage(beer) : secondaryPage("找不到啤酒", "这条记录可能已被删除。", button("返回列表", HOME));
    } else {
      app.innerHTML = secondaryPage("本地页面", "该页面将在后续检查点实现。", button("回到我的啤酒", HOME));
    }
    if (serial !== renderSerial) return;
    app.classList.remove("is-entering");
    void app.offsetWidth;
    app.classList.add("is-entering");
    verifyShellStability();
    document.title = `Beer Journal · ${current === HOME ? "我的啤酒" : "本地应用"}`;
  } catch (error) {
    dbError = error;
    app.innerHTML = shell(emptyState("!", "本地数据库错误", error?.message || databaseUnavailableMessage(), `<button class="local-button" type="button" data-db-retry>重试初始化</button>`), "Beer Journal");
  }
}

function closeCountryPicker() { overlayManager.closeOverlay("country-picker"); }

async function countryPickerRecords() {
  const records = [...COUNTRIES];
  const seen = new Set(records.map(([, name]) => name.trim().toLowerCase()));
  const beers = await beerRepository.listBeers();
  beers.forEach((beer) => {
    const name = String(beer.country_name || "").trim();
    if (!name || beer.country_code || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    records.push(["", name, name, [name], true]);
  });
  return records;
}

async function openCountryPicker(target = "form") {
  closeCountryPicker();
  const restoreFocus = document.activeElement;
  const root = document.createElement("div");
  root.className = "local-country-picker";
  root.innerHTML = `<div class="local-sheet-overlay" data-country-close></div><section class="local-sheet local-country-sheet"><div class="local-sheet-head"><h2>选择国家</h2><button class="local-sheet-close" type="button" data-country-close>×</button></div><input class="local-country-search" type="search" placeholder="搜索中文、英文、代码或别名" data-country-search><div class="local-country-list" data-country-list></div></section>`;
  document.body.append(root);
  overlayManager.openOverlay({ id: "country-picker", element: root, restoreFocus });
  const list = root.querySelector("[data-country-list]");
  const records = await countryPickerRecords();
  const draw = (query = "") => {
    const rawQuery = String(query).trim();
    const matches = records.filter((record) => !rawQuery || countrySearchText(record).includes(rawQuery.toLowerCase()));
    const customAction = rawQuery && !matches.length
      ? `<button class="local-country-custom" type="button" data-custom-country data-country-name="${esc(rawQuery)}"><span>🌐</span><strong>使用“${esc(rawQuery)}”</strong><small>保存为自定义国家</small></button>`
      : "";
    list.innerHTML = customAction + matches.map(([code, name, english, aliases = []]) => `<button class="local-country-option" type="button" data-country-code="${esc(code)}" data-country-name="${esc(name)}"><span>${flagForCountry(code)}</span><strong>${esc(name)}</strong><small>${esc(english)}${aliases.length ? ` · ${esc(aliases[0])}` : ""}</small></button>`).join("");
  };
  draw();
  root.querySelector("[data-country-search]").addEventListener("input", (event) => draw(event.target.value));
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-country-close]")) { closeCountryPicker(); return; }
    const custom = event.target.closest("[data-custom-country]");
    const option = event.target.closest("[data-country-option]") || event.target.closest("[data-country-code]");
    const countryCode = custom ? "" : option?.dataset.countryCode;
    const countryName = custom ? custom.dataset.countryName : option?.dataset.countryName;
    if (!countryName) return;
    const form = document.querySelector("[data-beer-form]");
    if (target === "filter") {
      filters.country_code = countryCode;
      filters.country_name = countryName;
      closeCountryPicker();
      render();
      return;
    }
    if (form) {
      form.querySelector('[name="country_code"]').value = countryCode;
      form.querySelector('[name="country_name"]').value = countryName;
      const trigger = form.querySelector("[data-country-picker] strong");
      if (trigger) trigger.textContent = `${flagForCountry(countryCode)} ${countryName}`;
    }
    closeCountryPicker();
  });
  root.querySelector("[data-country-search]").focus();
}

function openChoicePicker(type) {
  const form = document.querySelector("[data-beer-form]");
  if (!form) return;
  const currentCategory = form.querySelector('[name="category"]').value;
  const options = type === "category" ? CATEGORIES : (STYLES[currentCategory] || Object.values(STYLES).flat());
  const root = document.createElement("div");
  root.className = "local-choice-picker";
  root.innerHTML = `<div class="local-sheet-overlay" data-choice-close></div><section class="local-sheet"><div class="local-sheet-head"><h2>${type === "category" ? "选择啤酒大类" : "选择啤酒风格"}</h2><button class="local-sheet-close" type="button" data-choice-close>×</button></div><div class="local-choice-grid">${options.map((item) => `<button type="button" class="local-choice" data-choice-value="${esc(item)}">${esc(item)}</button>`).join("")}</div></section>`;
  document.body.append(root);
  const overlayId = `choice-${type}`;
  overlayManager.openOverlay({ id: overlayId, element: root, restoreFocus: document.activeElement });
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-choice-close]")) { overlayManager.closeOverlay(overlayId); return; }
    const option = event.target.closest("[data-choice-value]");
    if (!option) return;
    form.querySelector(`[name="${type}"]`).value = option.dataset.choiceValue;
    form.querySelector(`[data-choice-picker="${type}"] strong`).textContent = option.dataset.choiceValue;
    if (type === "category") {
      form.querySelector('[name="style"]').value = "";
      form.querySelector('[data-choice-picker="style"] strong').textContent = "请选择风格";
    }
    overlayManager.closeOverlay(overlayId);
  });
}

function openDeleteConfirm(kind, id, restoreFocus = null) {
  const overlayId = `delete-${kind}`;
  overlayManager.closeOverlay(overlayId);
  const root = document.createElement("div");
  root.className = "local-delete-confirm";
  root.innerHTML = `<div class="local-sheet-overlay" data-confirm-close></div><section class="local-sheet local-confirm-sheet"><div class="local-sheet-head"><h2>确认删除</h2><button class="local-sheet-close" type="button" data-confirm-close aria-label="关闭">×</button></div><p class="local-note">这条记录会被软删除，不会物理清除。</p><div class="local-actions"><button class="local-button secondary" type="button" data-confirm-close>取消</button><button class="local-button danger" type="button" data-confirm-accept data-delete-kind="${esc(kind)}" data-delete-id="${esc(id)}">确认删除</button></div></section>`;
  document.body.append(root);
  overlayManager.openOverlay({ id: overlayId, element: root, restoreFocus });
}

document.addEventListener("click", async (event) => {
  const addBeer = event.target.closest("[data-add-beer]");
  if (addBeer) {
    event.preventDefault();
    captureRouteDebug("add-beer", addBeer, "/beers/new");
    navigate("/beers/new");
    return;
  }
  const link = event.target.closest("a[data-route]");
  if (link) {
    event.preventDefault();
    if (overlayManager.hasOpenOverlay()) overlayManager.closeTopOverlay();
    if (link.dataset.route === "/beers/new") captureRouteDebug("add-beer-link", link, "/beers/new");
    navigate(link.dataset.route);
    return;
  }
  if (event.target.closest("[data-country-picker]")) { openCountryPicker("form"); return; }
  if (event.target.closest("[data-choice-picker]")) { openChoicePicker(event.target.closest("[data-choice-picker]").dataset.choicePicker); return; }
  if (event.target.closest("[data-filter-open]")) {
    const trigger = event.target.closest("[data-filter-open]");
    const sheet = document.querySelector("[data-filter-sheet]");
    const overlay = document.querySelector("[data-filter-overlay]");
    sheet?.removeAttribute("hidden");
    overlay?.removeAttribute("hidden");
    overlayManager.openOverlay({ id: "filter-sheet", element: sheet, restoreFocus: trigger, removeElement: false, onClose: () => { sheet?.setAttribute("hidden", ""); overlay?.setAttribute("hidden", ""); } });
    return;
  }
  if (event.target.closest("[data-filter-close], [data-filter-overlay]")) { overlayManager.closeOverlay("filter-sheet"); return; }
  const category = event.target.closest("[data-filter-category]");
  if (category) { filters.category = category.dataset.filterCategory; document.querySelectorAll("[data-filter-category]").forEach((item) => item.classList.toggle("is-selected", item === category)); return; }
  if (event.target.closest("[data-filter-country]")) { openCountryPicker("filter"); return; }
  if (event.target.closest("[data-filter-reset]")) { filters = { query: "", category: "", country_code: "", country_name: "", min_rating: "", max_rating: "" }; overlayManager.closeOverlay("filter-sheet"); render(); return; }
  if (event.target.closest("[data-filter-apply]")) { filters.min_rating = document.querySelector("[data-filter-min]")?.value || ""; filters.max_rating = document.querySelector("[data-filter-max]")?.value || ""; overlayManager.closeOverlay("filter-sheet"); render(); return; }
  if (event.target.closest("[data-tasting-actions]")) { openTastingActions(event.target.closest("[data-tasting-actions]").dataset.tastingActions); return; }
  if (event.target.closest("[data-tasting-actions-close]")) { overlayManager.closeOverlay("tasting-actions"); return; }
  const confirmClose = event.target.closest("[data-confirm-close]");
  if (confirmClose) { overlayManager.closeTopOverlay(); return; }
  const confirmAccept = event.target.closest("[data-confirm-accept]");
  if (confirmAccept) {
    const kind = confirmAccept.dataset.deleteKind;
    const id = confirmAccept.dataset.deleteId;
    overlayManager.closeTopOverlay();
    if (kind === "tasting") {
      await tastingRepository.softDeleteTasting(id);
      overlayManager.closeOverlay("tasting-actions");
      navigate("/tastings");
    } else {
      await beerRepository.softDeleteBeer(id);
      navigate(HOME);
    }
    return;
  }
  const pendingDeleteTasting = event.target.closest("[data-delete-tasting]");
  if (pendingDeleteTasting) { openDeleteConfirm("tasting", pendingDeleteTasting.dataset.deleteTasting, pendingDeleteTasting); return; }
  const pendingDeleteBeer = event.target.closest("[data-delete-beer]");
  if (pendingDeleteBeer) { openDeleteConfirm("beer", pendingDeleteBeer.dataset.deleteBeer, pendingDeleteBeer); return; }
  if (event.target.closest("[data-db-retry]")) { dbError = null; await initialize(); }
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("[data-search-form]")) {
    event.preventDefault();
    filters.query = new FormData(event.target).get("query") || "";
    await render();
    return;
  }
  if (event.target.matches("[data-tasting-search-form]")) {
    event.preventDefault();
    tastingFilters.query = new FormData(event.target).get("query") || "";
    await render();
    return;
  }
  if (!event.target.matches("[data-beer-form]")) return;
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    if (form.matches("[data-tasting-form]")) {
      const tasting = form.dataset.tastingId ? await tastingRepository.updateTasting(form.dataset.tastingId, payload) : await tastingRepository.createTasting(payload);
      navigate(`/tastings/${tasting.id}`);
      return;
    }
    const beer = form.dataset.beerId ? await beerRepository.updateBeer(form.dataset.beerId, payload) : await beerRepository.createBeer(payload);
    if (!beer?.id) throw new Error("啤酒保存后没有返回有效 ID");
    if (form.dataset.beerId) navigate(`/beers/${beer.id}`);
    else firstTastingSheet(beer);
  } catch (error) {
    window.alert(error?.message || "保存失败，请稍后重试");
    submit.disabled = false;
  }
});

window.addEventListener("hashchange", render);
window.addEventListener("popstate", render);
window.addEventListener("pageshow", render);

function isKeyboardVisible() {
  const active = document.activeElement;
  const editable = active && (active.matches?.("input, textarea, select, [contenteditable='true']"));
  const viewportGap = window.visualViewport ? window.innerHeight - window.visualViewport.height : 0;
  return Boolean(editable && (viewportGap > 100 || active !== document.body));
}

async function hideKeyboard() {
  await globalThis.Capacitor?.Plugins?.Keyboard?.hide?.().catch?.(() => {});
  document.activeElement?.blur?.();
}

async function goBack() {
  if (isKeyboardVisible()) { await hideKeyboard(); return; }
  if (overlayManager.hasOpenOverlay()) { overlayManager.closeTopOverlay(); return; }
  if (route() !== HOME && window.history.length > 1) { window.history.back(); return; }
  if (route() !== HOME) { navigate(HOME, true); return; }
  if (Date.now() < exitArmedUntil) { globalThis.Capacitor?.Plugins?.App?.exitApp?.(); return; }
  exitArmedUntil = Date.now() + 2200;
  globalThis.alert?.("再次按返回键退出 Beer Journal");
  window.setTimeout(() => { exitArmedUntil = 0; }, 2200);
}

const nativeApp = globalThis.Capacitor?.Plugins?.App;
nativeApp?.addListener?.("backButton", goBack);
nativeApp?.addListener?.("appStateChange", ({ isActive }) => { if (isActive) render(); });

async function initialize() {
  try {
    await preloadLogo();
    verifyShellStability();
    await initializeDatabase();
    dbReady = true;
    await render();
  } catch (error) {
    dbError = error;
    await render();
  }
}

if (!window.location.hash) window.history.replaceState({}, "", `#${HOME}`);
initialize();
