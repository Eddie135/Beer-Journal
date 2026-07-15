import { beerRepository } from "./beer-repository.js";
import { databaseUnavailableMessage, initializeDatabase } from "./database.js";
import { COUNTRIES, findCountry, flagForCountry } from "./countries.js";

const app = document.querySelector("#route-content");
const appShell = document.querySelector("[data-app-shell]");
const appLogo = document.querySelector("#app-logo");
const bottomNavigation = document.querySelector("[data-app-bottom-nav]");
const HOME = "/beers";
const CATEGORIES = ["拉格", "艾尔"];
const STYLES = {
  拉格: ["皮尔森", "淡色拉格", "黑拉格"],
  艾尔: ["IPA", "小麦啤酒", "世涛"],
};
let dbReady = false;
let dbError = null;
let exitArmedUntil = 0;
let renderSerial = 0;
let filters = { query: "", category: "", country_code: "", min_rating: "", max_rating: "" };

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const route = () => window.location.hash.replace(/^#/, "") || HOME;
const navigate = (path, replace = false) => {
  const next = `#${path}`;
  if (replace) window.history.replaceState({}, "", next);
  else window.history.pushState({}, "", next);
  render();
};
const stars = (value) => value === "" || value === null || value === undefined ? "—" : `${"★".repeat(Number(value))}${"☆".repeat(5 - Number(value))}`;

const pageHeading = (title, subtitle = "") => `<h1 class="local-page-title">${title}</h1>${subtitle ? `<p class="local-subtitle">${subtitle}</p>` : ""}`;
const shell = (content, title, subtitle = "") => `<div class="local-shell">${pageHeading(title, subtitle)}${content}</div>`;
const button = (label, path, className = "") => `<a class="local-button ${className}" href="#${path}" data-route="${path}">${label}</a>`;

const shellDebug = {
  logoNode: appLogo,
  headerNode: document.querySelector("[data-app-header]"),
  bottomNavigationNode: bottomNavigation,
  routeContentNode: app,
  navigationCount: 0,
};
globalThis.__BEER_JOURNAL_SHELL_DEBUG__ = shellDebug;

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
  const country = findCountry(beer.country_code);
  return `<a class="local-beer-card" href="#/beers/${beer.id}" data-route="/beers/${beer.id}">
    <div class="local-beer-card-top"><span>${country.flag} ${esc(beer.country_name || country.name)}</span><span class="local-rating">${esc(beer.overall_rating || "—")}</span></div>
    <h2>${esc(beer.name)}</h2><p>${esc(beer.brand || "品牌未填写")}</p>
    <div class="local-beer-meta"><span>${esc(beer.category || "未分类")}</span><span>${esc(beer.style || "未填写风格")}</span></div>
    <div class="local-beer-footer"><span>★ ${esc(beer.overall_rating || "—")}</span><span>${beer.personal_note ? "有个人笔记" : "暂无笔记"}</span></div>
  </a>`;
}

function filterSheet() {
  const country = findCountry(filters.country_code);
  return `<div class="local-sheet-overlay" data-filter-overlay hidden></div><section class="local-sheet" data-filter-sheet hidden aria-label="筛选啤酒">
    <div class="local-sheet-head"><h2>筛选啤酒</h2><button class="local-sheet-close" type="button" data-filter-close aria-label="关闭">×</button></div>
    <div class="local-choice-grid"><button type="button" class="local-choice${!filters.category ? " is-selected" : ""}" data-filter-category="">全部分类</button>${CATEGORIES.map((item) => `<button type="button" class="local-choice${filters.category === item ? " is-selected" : ""}" data-filter-category="${esc(item)}">${esc(item)}</button>`).join("")}</div>
    <button class="local-picker-trigger" type="button" data-filter-country><span>国家</span><strong>${country.flag} ${esc(filters.country_code ? country.name : "全部国家")}</strong></button>
    <div class="local-range"><label>最低评分<input type="number" min="0" max="10" step="0.5" value="${esc(filters.min_rating)}" data-filter-min></label><label>最高评分<input type="number" min="0" max="10" step="0.5" value="${esc(filters.max_rating)}" data-filter-max></label></div>
    <div class="local-actions"><button class="local-button" type="button" data-filter-apply>应用筛选</button><button class="local-button secondary" type="button" data-filter-reset>重置</button></div>
  </section>`;
}

function listPage(beers) {
  const content = `<section class="local-search-row"><form class="local-search-form" data-search-form><input name="query" value="${esc(filters.query)}" placeholder="搜索名称、品牌、国家" aria-label="搜索啤酒"><button type="submit">搜索</button></form><button class="local-filter-button" type="button" data-filter-open>筛选</button></section>
    <div class="local-filter-summary">${filters.category ? `<span>${esc(filters.category)}</span>` : ""}${filters.country_code ? `<span>${findCountry(filters.country_code).flag} ${esc(findCountry(filters.country_code).name)}</span>` : ""}${filters.min_rating || filters.max_rating ? `<span>评分范围</span>` : ""}</div>
    ${beers.length ? `<section class="local-beer-list">${beers.map(beerCard).join("")}</section>` : emptyState("＋", "还没有匹配的啤酒", filters.query || filters.category || filters.country_code ? "可以调整搜索或筛选条件。" : "你的本地收藏会保存在这台手机上，断网也可以继续使用。", button("添加啤酒", "/beers/new"))}${filterSheet()}`;
  return shell(content, "我的啤酒", `${beers.length} 款本地收藏`);
}

function countryButton(code, name) {
  const country = findCountry(code);
  const selectedName = code ? (name || country.name) : "";
  const displayName = code ? selectedName : "未选择国家";
  return `<input type="hidden" name="country_code" value="${esc(code)}"><input type="hidden" name="country_name" value="${esc(selectedName)}"><button class="local-picker-trigger" type="button" data-country-picker><span>国家</span><strong>${code ? `${country.flag} ${esc(displayName)}` : esc(displayName)}</strong></button>`;
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
    <div class="local-form-grid"><label>口感评分<input type="number" name="mouthfeel_rating" min="1" max="5" step="1" value="${esc(beer?.mouthfeel_rating)}"></label><label>苦味评分<input type="number" name="bitterness_rating" min="1" max="5" step="1" value="${esc(beer?.bitterness_rating)}"></label></div>
    <label>风味复杂度评分<input type="number" name="complexity_rating" min="1" max="5" step="1" value="${esc(beer?.complexity_rating)}"></label>
    <label>个人感想<textarea name="personal_note" rows="4" maxlength="5000" placeholder="记录你的长期印象">${esc(beer?.personal_note)}</textarea></label>
    <button class="local-button" type="submit">${editing ? "保存修改" : "保存啤酒"}</button>
  </form></section>`;
}

function detailPage(beer) {
  const country = findCountry(beer.country_code);
  return shell(`<a class="local-back" href="#${HOME}" data-route="${HOME}">← 返回我的啤酒</a><section class="local-card local-detail-card"><div class="local-detail-flag">${country.flag}</div><h2>${esc(beer.name)}</h2><p>${esc(beer.brand || "品牌未填写")} · ${esc(beer.brewery || "酒厂未填写")}</p><div class="local-beer-meta"><span>${esc(beer.category || "未分类")}</span><span>${esc(beer.style || "未填写风格")}</span><span>${esc(beer.country_name || country.name)}</span></div><div class="local-stat-grid"><div class="local-stat"><strong>${esc(beer.overall_rating || "—")}</strong><span>总体评分</span></div><div class="local-stat"><strong>${esc(beer.abv || "—")}</strong><span>ABV</span></div><div class="local-stat"><strong>${esc(beer.default_volume_ml || "—")}</strong><span>容量 ml</span></div></div><p class="local-note">${esc(beer.personal_note || "暂无个人感想")}</p><div class="local-actions">${button("编辑资料", `/beers/${beer.id}/edit`, "secondary")}<button class="local-button danger" type="button" data-delete-beer="${esc(beer.id)}">删除啤酒</button></div></section>`, beer.name);
}

function secondaryPage(title, text, action = "") {
  return shell(`<a class="local-back" href="#${HOME}" data-route="${HOME}">← 返回</a><section class="local-card"><h2>${title}</h2><p class="local-note">${text}</p>${action ? `<div class="local-actions">${action}</div>` : ""}</section>`, title);
}

function profilePage(beers) {
  return shell(`<section class="local-card"><h2>我的啤酒画像</h2><div class="local-stat-grid"><div class="local-stat"><strong>${beers.length}</strong><span>收藏</span></div><div class="local-stat"><strong>0</strong><span>品饮</span></div><div class="local-stat"><strong>—</strong><span>平均评分</span></div></div></section><section class="local-card"><h2>本地数据</h2><p class="local-note">v1.0 数据保存在当前设备。云同步将在 v1.1 提供。</p><div class="local-actions">${button("设置与数据管理", "/settings", "secondary")}</div></section>`, "个人数据", "只属于你的啤酒记录");
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
    if (current === HOME) {
      app.innerHTML = listPage(await beerRepository.listBeers(filters));
    } else if (current === "/profile") {
      app.innerHTML = profilePage(await beerRepository.listBeers());
    } else if (current === "/tastings") {
      app.innerHTML = shell(emptyState("✎", "饮用记录将在 L3 开启", "L2 只实现 Beer 本地数据库和完整 CRUD。"), "饮用记录", "你的饮酒日记");
    } else if (current === "/settings") {
      app.innerHTML = secondaryPage("设置与数据管理", "本地备份、导入和清空数据将在 L4 实现。", `<button class="local-button secondary" type="button" disabled>导出备份（L4）</button>`);
    } else if (current === "/beers/new") {
      app.innerHTML = shell(beerForm(), "添加啤酒", "保存到本机 SQLite");
    } else if (current.endsWith("/edit")) {
      const id = current.split("/")[2];
      const beer = await beerRepository.getBeerById(id);
      app.innerHTML = beer ? shell(beerForm(beer), "编辑啤酒", "修改会增加本地 revision") : secondaryPage("找不到啤酒", "这条记录可能已被删除。", button("返回列表", HOME));
    } else if (current.startsWith("/beers/")) {
      const beer = await beerRepository.getBeerById(current.split("/")[2]);
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

function closeCountryPicker() { document.querySelector(".local-country-picker")?.remove(); }

function openCountryPicker(target = "form") {
  closeCountryPicker();
  const root = document.createElement("div");
  root.className = "local-country-picker";
  root.innerHTML = `<div class="local-sheet-overlay" data-country-close></div><section class="local-sheet local-country-sheet"><div class="local-sheet-head"><h2>选择国家</h2><button class="local-sheet-close" type="button" data-country-close>×</button></div><input class="local-country-search" type="search" placeholder="搜索中文或英文国家" data-country-search><div class="local-country-list" data-country-list></div></section>`;
  document.body.append(root);
  const list = root.querySelector("[data-country-list]");
  const draw = (query = "") => {
    const needle = query.trim().toLowerCase();
    list.innerHTML = COUNTRIES.filter(([, name, english]) => !needle || `${name} ${english}`.toLowerCase().includes(needle)).map(([code, name, english]) => `<button class="local-country-option" type="button" data-country-code="${code}" data-country-name="${esc(name)}"><span>${flagForCountry(code)}</span><strong>${esc(name)}</strong><small>${esc(english)}</small></button>`).join("");
  };
  draw();
  root.querySelector("[data-country-search]").addEventListener("input", (event) => draw(event.target.value));
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-country-close]")) { closeCountryPicker(); return; }
    const option = event.target.closest("[data-country-code]");
    if (!option) return;
    const form = document.querySelector("[data-beer-form]");
    if (target === "filter") {
      filters.country_code = option.dataset.countryCode;
      filters.country_name = option.dataset.countryName;
      closeCountryPicker();
      render();
      return;
    }
    if (form) {
      form.querySelector('[name="country_code"]').value = option.dataset.countryCode;
      form.querySelector('[name="country_name"]').value = option.dataset.countryName;
      const trigger = form.querySelector("[data-country-picker] strong");
      if (trigger) trigger.textContent = `${flagForCountry(option.dataset.countryCode)} ${option.dataset.countryName}`;
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
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-choice-close]")) { root.remove(); return; }
    const option = event.target.closest("[data-choice-value]");
    if (!option) return;
    form.querySelector(`[name="${type}"]`).value = option.dataset.choiceValue;
    form.querySelector(`[data-choice-picker="${type}"] strong`).textContent = option.dataset.choiceValue;
    if (type === "category") {
      form.querySelector('[name="style"]').value = "";
      form.querySelector('[data-choice-picker="style"] strong').textContent = "请选择风格";
    }
    root.remove();
  });
}

document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-route]");
  if (link) { event.preventDefault(); navigate(link.dataset.route); return; }
  if (event.target.closest("[data-country-picker]")) { openCountryPicker("form"); return; }
  if (event.target.closest("[data-choice-picker]")) { openChoicePicker(event.target.closest("[data-choice-picker]").dataset.choicePicker); return; }
  if (event.target.closest("[data-filter-open]")) { document.querySelector("[data-filter-sheet]")?.removeAttribute("hidden"); document.querySelector("[data-filter-overlay]")?.removeAttribute("hidden"); return; }
  if (event.target.closest("[data-filter-close], [data-filter-overlay]")) { document.querySelector("[data-filter-sheet]")?.setAttribute("hidden", ""); document.querySelector("[data-filter-overlay]")?.setAttribute("hidden", ""); return; }
  const category = event.target.closest("[data-filter-category]");
  if (category) { filters.category = category.dataset.filterCategory; document.querySelectorAll("[data-filter-category]").forEach((item) => item.classList.toggle("is-selected", item === category)); return; }
  if (event.target.closest("[data-filter-country]")) { openCountryPicker("filter"); return; }
  if (event.target.closest("[data-filter-reset]")) { filters = { query: "", category: "", country_code: "", min_rating: "", max_rating: "" }; render(); return; }
  if (event.target.closest("[data-filter-apply]")) { filters.min_rating = document.querySelector("[data-filter-min]")?.value || ""; filters.max_rating = document.querySelector("[data-filter-max]")?.value || ""; render(); return; }
  const deleteButton = event.target.closest("[data-delete-beer]");
  if (deleteButton && window.confirm("确定删除这款啤酒吗？它会被软删除，不会物理清除。")) { await beerRepository.softDeleteBeer(deleteButton.dataset.deleteBeer); navigate(HOME); return; }
  if (event.target.closest("[data-db-retry]")) { dbError = null; await initialize(); }
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("[data-search-form]")) {
    event.preventDefault();
    filters.query = new FormData(event.target).get("query") || "";
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
    const beer = form.dataset.beerId ? await beerRepository.updateBeer(form.dataset.beerId, payload) : await beerRepository.createBeer(payload);
    navigate(`/beers/${beer.id}`);
  } catch (error) {
    window.alert(error?.message || "保存失败，请稍后重试");
    submit.disabled = false;
  }
});

window.addEventListener("hashchange", render);
window.addEventListener("popstate", render);
window.addEventListener("pageshow", render);

function goBack() {
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
