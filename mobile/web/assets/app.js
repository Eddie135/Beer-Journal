(() => {
  "use strict";

  const app = document.querySelector("#app");
  const HOME = "/beers";
  let exitArmedUntil = 0;

  const route = () => {
    const value = window.location.hash.replace(/^#/, "");
    return value || HOME;
  };

  const navigate = (path, replace = false) => {
    const next = `#${path}`;
    if (replace) window.history.replaceState({}, "", next);
    else window.history.pushState({}, "", next);
    render();
  };

  const tab = (path, icon, label) => `<a class="local-tab${route() === path ? " is-active" : ""}" href="#${path}" data-route="${path}"><span class="local-tab-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`;
  const bottomNav = () => `<nav class="local-bottom-nav" aria-label="主要导航">${tab("/beers", "🍺", "我的啤酒")}${tab("/tastings", "📝", "饮用记录")}${tab("/profile", "◉", "个人数据")}</nav>`;
  const header = (title, subtitle = "") => `<header class="local-header"><div class="local-brand"><img src="assets/beer-journal-icon.png" alt=""><div><small>BEER JOURNAL</small><strong>本地收藏</strong></div></div></header><h1 class="local-page-title">${title}</h1>${subtitle ? `<p class="local-subtitle">${subtitle}</p>` : ""}`;
  const shell = (content, title, subtitle = "") => `<main class="local-shell">${header(title, subtitle)}${content}</main>${bottomNav()}`;
  const emptyState = (icon, title, text, action = "") => `<section class="local-card local-empty"><div class="local-empty-icon" aria-hidden="true">${icon}</div><h2>${title}</h2><p>${text}</p>${action}</section>`;

  const beersPage = () => shell(`<section class="local-card"><div class="local-section-title"><h2>我的收藏</h2><span class="local-note">0 款啤酒</span></div>${emptyState("＋", "还没有啤酒", "你的本地收藏会保存在这台手机上，断网也可以继续使用。", `<a class="local-button" href="#/beers/new" data-route="/beers/new">添加啤酒</a>`)}</section>`, "我的啤酒", "所有记录只保存在本机");
  const tastingsPage = () => shell(`<section class="local-card"><div class="local-section-title"><h2>饮用记录</h2><span class="local-note">0 次品饮</span></div>${emptyState("✎", "还没有品饮记录", "保存啤酒后，可以在本机记录每一次饮用。", `<a class="local-button" href="#/tastings/new" data-route="/tastings/new">记录饮用</a>`)}</section>`, "饮用记录", "你的饮酒日记");
  const profilePage = () => shell(`<section class="local-card"><h2>我的啤酒画像</h2><div class="local-stat-grid"><div class="local-stat"><strong>0</strong><span>收藏</span></div><div class="local-stat"><strong>0</strong><span>品饮</span></div><div class="local-stat"><strong>—</strong><span>平均评分</span></div></div></section><section class="local-card"><h2>本地数据</h2><p class="local-note">v1.0 数据保存在当前设备。云同步将在 v1.1 提供。</p><div class="local-actions"><a class="local-button secondary" href="#/settings" data-route="/settings">设置与数据管理</a></div></section>`, "个人数据", "只属于你的啤酒记录");
  const secondaryPage = (title, text, action = "") => shell(`<a class="local-back" href="#/beers" data-route="/beers">← 返回</a><section class="local-card"><h2>${title}</h2><p class="local-note">${text}</p>${action ? `<div class="local-actions">${action}</div>` : ""}</section>`, title);

  const render = () => {
    if (!app) return;
    const current = route();
    if (current === HOME) app.innerHTML = beersPage();
    else if (current === "/tastings") app.innerHTML = tastingsPage();
    else if (current === "/profile") app.innerHTML = profilePage();
    else if (current === "/settings") app.innerHTML = secondaryPage("设置与数据管理", "本地备份、导入和清空数据将在 L4 实现。", `<button class="local-button secondary" type="button" disabled>导出备份（即将支持）</button>`);
    else if (current === "/beers/new") app.innerHTML = secondaryPage("添加啤酒", "L1 已建立本地页面骨架；Beer 表单与 SQLite 保存将在 L2 实现。", `<a class="local-button" href="#/beers" data-route="/beers">返回我的啤酒</a>`);
    else if (current === "/tastings/new") app.innerHTML = secondaryPage("记录饮用", "Tasting 表单与本地保存将在 L3 实现。", `<a class="local-button" href="#/tastings" data-route="/tastings">返回饮用记录</a>`);
    else app.innerHTML = secondaryPage("本地页面", "此页面将在后续 L2-L4 检查点逐步实现。", `<a class="local-button" href="#/beers" data-route="/beers">回到我的啤酒</a>`);
    document.title = `Beer Journal · ${current === HOME ? "我的啤酒" : "本地应用"}`;
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-route]");
    if (!link) return;
    event.preventDefault();
    navigate(link.dataset.route);
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("popstate", render);
  window.addEventListener("pageshow", render);

  const goBack = () => {
    if (route() !== HOME && window.history.length > 1) {
      window.history.back();
      return;
    }
    if (route() !== HOME) {
      navigate(HOME, true);
      return;
    }
    if (Date.now() < exitArmedUntil) {
      globalThis.Capacitor?.Plugins?.App?.exitApp?.();
      return;
    }
    exitArmedUntil = Date.now() + 2200;
    globalThis.alert?.("再次按返回键退出 Beer Journal");
    window.setTimeout(() => { exitArmedUntil = 0; }, 2200);
  };

  const nativeApp = globalThis.Capacitor?.Plugins?.App;
  nativeApp?.addListener?.("backButton", goBack);
  nativeApp?.addListener?.("appStateChange", ({ isActive }) => { if (isActive) render(); });
  if (!window.location.hash) navigate(HOME, true);
  render();
})();
