const makeIcon = (path) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;

const countryFlag = (code) => {
  if (!code || code.length !== 2) return "🌍";
  return [...code.toUpperCase()].map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("");
};

const countryDisplay = (option) => option ? `${option.dataset.countryFlag || countryFlag(option.value)} ${option.textContent.trim()}` : "请选择国家";
const countryRecentKey = "beer-journal-recent-countries";
const recentCountries = () => {
  try { return JSON.parse(window.localStorage.getItem(countryRecentKey) || "[]").filter(Boolean); } catch (error) { return []; }
};
const rememberCountry = (code) => {
  try { window.localStorage.setItem(countryRecentKey, JSON.stringify([code, ...recentCountries().filter((item) => item !== code)].slice(0, 5))); } catch (error) { /* private mode may block storage */ }
};

const createSheet = (className, title) => {
  const overlay = document.createElement("button");
  overlay.type = "button";
  overlay.className = "app-sheet-overlay";
  overlay.setAttribute("aria-label", "关闭选择面板");
  const sheet = document.createElement("section");
  sheet.className = `app-sheet ${className}`;
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-hidden", "true");
  sheet.innerHTML = `<div class="app-sheet-handle"></div><header class="app-sheet-header"><h2>${title}</h2><button type="button" class="sheet-close" aria-label="关闭">${makeIcon("M6 6l12 12M18 6 6 18")}</button></header><div class="app-sheet-body"></div>`;
  document.body.append(overlay, sheet);
  const close = () => {
    overlay.classList.remove("is-open");
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("app-sheet-open");
  };
  overlay.addEventListener("click", close);
  sheet.querySelector(".sheet-close").addEventListener("click", close);
  return {
    body: sheet.querySelector(".app-sheet-body"),
    close,
    open() {
      overlay.classList.add("is-open");
      sheet.classList.add("is-open");
      sheet.setAttribute("aria-hidden", "false");
      document.body.classList.add("app-sheet-open");
      sheet.querySelector(".sheet-close").focus();
    },
  };
};

const enhanceSelect = (select) => {
  if (select.dataset.enhanced) return;
  select.dataset.enhanced = "true";
  select.classList.add("select-native-control");
  const label = select.labels?.[0]?.textContent?.trim() || "选择";
  const control = document.createElement("button");
  control.type = "button";
  control.className = "select-sheet-trigger";
  control.setAttribute("aria-haspopup", "dialog");
  control.innerHTML = `<span class="select-trigger-copy"><small>${label}</small><strong></strong></span>${makeIcon("m9 18 6-6-6-6")}`;
  select.insertAdjacentElement("afterend", control);
  const sheet = createSheet("select-sheet", label);
  const sync = () => {
    const selected = select.selectedOptions[0];
    control.querySelector("strong").textContent = selected?.value ? (select.dataset.countrySelect !== undefined ? countryDisplay(selected) : selected.textContent.trim()) : `请选择${label}`;
  };
  const render = () => {
    sheet.body.replaceChildren();
    const search = select.dataset.countrySelect !== undefined ? document.createElement("input") : null;
    if (search) {
      search.type = "search";
      search.className = "sheet-search-input";
      search.placeholder = "搜索中文或英文国家名";
      search.setAttribute("aria-label", "搜索国家");
      sheet.body.append(search);
    }
    const optionsBody = document.createElement("div");
    optionsBody.className = "sheet-options-list";
    const renderOptions = () => {
      optionsBody.replaceChildren();
      const term = search?.value.trim().toLocaleLowerCase("zh-CN") || "";
      const allOptions = Array.from(select.options).filter((option) => option.value && !option.hidden);
      const orderedOptions = select.dataset.countrySelect !== undefined ? allOptions.sort((a, b) => { const recent = recentCountries(); const rank = (value) => { const index = recent.indexOf(value); return index === -1 ? 999 : index; }; return rank(a.value) - rank(b.value); }) : allOptions;
      orderedOptions.filter((option) => !term || `${option.value} ${option.textContent} ${option.dataset.countryEn || ""}`.toLocaleLowerCase("zh-CN").includes(term)).forEach((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sheet-option";
        item.textContent = select.dataset.countrySelect !== undefined ? countryDisplay(option) : option.textContent.trim();
        item.classList.toggle("is-selected", option.selected);
        item.addEventListener("click", () => {
          select.value = option.value;
          if (select.dataset.countrySelect !== undefined) rememberCountry(option.value);
          select.dispatchEvent(new Event("change", { bubbles: true }));
          sync();
          sheet.close();
        });
        optionsBody.append(item);
      });
    };
    if (search) search.addEventListener("input", renderOptions);
    sheet.body.append(optionsBody);
    renderOptions();
  };
  control.addEventListener("click", () => {
    render();
    sheet.open();
  });
  select.addEventListener("change", sync);
  sync();
};

const initializeCategorySelects = () => {
  document.querySelectorAll("[data-category-select]").forEach((categorySelect) => {
    const form = categorySelect.closest("form");
    const styleSelect = form?.querySelector("[data-style-select]");
    const filterStyles = () => {
      const categoryId = categorySelect.value;
      Array.from(styleSelect?.options || []).forEach((option) => {
        if (!option.value) return;
        option.hidden = Boolean(categoryId) && option.dataset.categoryId !== categoryId;
      });
      if (styleSelect?.selectedOptions[0]?.hidden) {
        styleSelect.value = "";
        styleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    categorySelect.addEventListener("change", filterStyles);
    filterStyles();
  });
  document.querySelectorAll("[data-category-select], [data-style-select]").forEach(enhanceSelect);
};

const pad = (value) => String(value).padStart(2, "0");
const dateValue = (input) => {
  const parsed = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})$/.exec(input.value);
  const fallback = new Date();
  return parsed ? { year: Number(parsed[1]), month: Number(parsed[2]), day: Number(parsed[3]), hour: Number(parsed[4]), minute: Number(parsed[5]) } : {
    year: fallback.getFullYear(), month: fallback.getMonth() + 1, day: fallback.getDate(), hour: fallback.getHours(), minute: fallback.getMinutes(),
  };
};

const displayDate = (value) => `${value.year}年${value.month}月${value.day}日 ${pad(value.hour)}:${pad(value.minute)}`;

const enhanceDateInput = (input) => {
  if (input.dataset.enhanced) return;
  input.dataset.enhanced = "true";
  input.classList.add("datetime-native-control");
  const label = input.labels?.[0]?.textContent?.trim() || "品饮时间";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "datetime-sheet-trigger";
  trigger.innerHTML = `<span><small>${label}</small><strong></strong></span>${makeIcon("M7 3v3M17 3v3M4 9h16M5 5h14v15H5z")}`;
  input.insertAdjacentElement("afterend", trigger);
  const sheet = createSheet("datetime-sheet", "选择品饮时间");
  let picked = dateValue(input);
  const sync = () => { trigger.querySelector("strong").textContent = displayDate(dateValue(input)); };
  const centerSelectedWheels = () => {
    sheet.body.querySelectorAll(".datetime-wheel-list .is-selected").forEach((selected) => {
      const list = selected.closest(".datetime-wheel-list");
      if (!list) return;
      list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
    });
  };
  const renderWheel = (key, values, formatter = (value) => value) => {
    const column = document.createElement("div");
    column.className = "datetime-wheel";
    const heading = document.createElement("small");
    heading.textContent = { year: "年", month: "月", day: "日", hour: "时", minute: "分" }[key];
    column.append(heading);
    const list = document.createElement("div");
    list.className = "datetime-wheel-list";
    values.forEach((value) => {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = formatter(value);
      item.classList.toggle("is-selected", picked[key] === value);
      item.addEventListener("click", () => { picked[key] = value; render(); });
      list.append(item);
    });
    column.append(list);
    return column;
  };
  const render = () => {
    const days = new Date(picked.year, picked.month, 0).getDate();
    picked.day = Math.min(picked.day, days);
    sheet.body.replaceChildren();
    const wheels = document.createElement("div");
    wheels.className = "datetime-wheels";
    const now = new Date();
    wheels.append(
      renderWheel("year", Array.from({ length: 9 }, (_, index) => now.getFullYear() - 4 + index)),
      renderWheel("month", Array.from({ length: 12 }, (_, index) => index + 1), (value) => `${value}月`),
      renderWheel("day", Array.from({ length: days }, (_, index) => index + 1), (value) => `${value}日`),
      renderWheel("hour", Array.from({ length: 24 }, (_, index) => index), (value) => pad(value)),
      renderWheel("minute", Array.from({ length: 60 }, (_, index) => index), (value) => pad(value)),
    );
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button button-secondary";
    cancel.textContent = "取消";
    cancel.addEventListener("click", sheet.close);
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "button";
    confirm.textContent = "确认时间";
    confirm.addEventListener("click", () => {
      input.value = `${picked.year}-${pad(picked.month)}-${pad(picked.day)}T${pad(picked.hour)}:${pad(picked.minute)}`;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
      sheet.close();
    });
    actions.append(cancel, confirm);
    sheet.body.append(wheels, actions);
    requestAnimationFrame(centerSelectedWheels);
  };
  trigger.addEventListener("click", () => {
    picked = dateValue(input);
    sheet.open();
    render();
    requestAnimationFrame(() => requestAnimationFrame(centerSelectedWheels));
  });
  input.addEventListener("change", sync);
  sync();
};

const enhancePhotoInput = (input) => {
  if (input.dataset.enhanced) return;
  input.dataset.enhanced = "true";
  input.classList.add("photo-native-control");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "photo-upload-card";
  button.innerHTML = `${makeIcon("M12 5v14M5 12h14")}<span><strong>添加照片</strong><small>可一次选择多张</small></span>`;
  const preview = document.createElement("div");
  preview.className = "photo-upload-preview";
  const urls = [];
  const resetPreview = () => {
    urls.splice(0).forEach((url) => URL.revokeObjectURL(url));
    preview.replaceChildren();
    Array.from(input.files || []).forEach((file) => {
      const item = document.createElement("figure");
      const image = document.createElement("img");
      const url = URL.createObjectURL(file);
      urls.push(url);
      image.src = url;
      image.alt = "待上传照片预览";
      const caption = document.createElement("figcaption");
      caption.textContent = file.name;
      item.append(image, caption);
      preview.append(item);
    });
  };
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", resetPreview);
  input.insertAdjacentElement("afterend", button);
  button.insertAdjacentElement("afterend", preview);
};

let exitArmedUntil = 0;

const initializeApp = () => {
  if (!window.__beerJournalNativeHooks) {
    window.__beerJournalNativeHooks = true;
    const nativeApp = window.Capacitor?.Plugins?.App;
    nativeApp?.addListener?.("backButton", () => window.dispatchEvent(new Event("nativeback")));
    nativeApp?.addListener?.("appStateChange", ({ isActive }) => {
      if (isActive) {
        window.dispatchEvent(new Event("pageshow"));
        document.querySelectorAll("[data-datetime-picker], [data-country-select]").forEach((element) => element.dispatchEvent(new Event("change", { bubbles: true })));
      }
    });
  }
  document.querySelectorAll(".progressive-image").forEach((image) => {
    const reveal = () => image.classList.add("is-loaded");
    if (image.complete) reveal();
    else image.addEventListener("load", reveal, { once: true });
  });
  initializeCategorySelects();
  document.querySelectorAll("[data-datetime-picker]").forEach(enhanceDateInput);
  document.querySelectorAll('input[type="file"][multiple]').forEach(enhancePhotoInput);

  document.querySelectorAll("[data-action-sheet]").forEach((trigger) => {
    if (trigger.dataset.enhanced) return;
    trigger.dataset.enhanced = "true";
    const sheet = document.querySelector(trigger.dataset.actionSheet);
    const overlay = sheet ? document.querySelector(`${trigger.dataset.actionSheet}-overlay`) : null;
    const close = () => { sheet?.classList.remove("is-open"); overlay?.classList.remove("is-open"); sheet?.setAttribute("aria-hidden", "true"); };
    trigger.addEventListener("click", () => { sheet?.classList.add("is-open"); overlay?.classList.add("is-open"); sheet?.setAttribute("aria-hidden", "false"); });
    sheet?.querySelectorAll("[data-action-close]").forEach((button) => button.addEventListener("click", close));
    overlay?.addEventListener("click", close);
  });

  if (!window.__beerJournalGlobalEvents) {
    window.__beerJournalGlobalEvents = true;
    window.addEventListener("nativeback", () => {
      const focused = document.activeElement;
      if (focused && ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName)) { focused.blur(); return; }
      const openSheet = document.querySelector(".is-open[data-action-sheet-panel], .filter-sheet.is-open, .app-sheet.is-open");
      if (openSheet) { openSheet.querySelector("[data-action-close], .sheet-close, [data-filter-close]")?.click(); return; }
      if (window.history.length > 1) { window.history.back(); return; }
      if (Date.now() < exitArmedUntil) { window.Capacitor?.Plugins?.App?.exitApp?.(); return; }
      exitArmedUntil = Date.now() + 2200;
      window.alert("再次按返回键退出 Beer Journal");
      window.setTimeout(() => { exitArmedUntil = 0; }, 2200);
    });
    window.addEventListener("pageshow", () => { initializeApp(); });
  }

  document.querySelectorAll("[data-tab-navigation]").forEach((link) => {
    if (link.dataset.enhanced) return;
    link.dataset.enhanced = "true";
    link.addEventListener("click", async (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      event.preventDefault();
      const swap = async () => {
        const response = await fetch(target.href, { headers: { "X-Requested-With": "BeerJournalTab" } });
        if (!response.ok || response.url.includes("/accounts/login/")) { window.location.href = target.href; return; }
        const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html");
        const nextContent = nextDocument.querySelector("#app-content");
        if (!nextContent) { window.location.href = target.href; return; }
        document.querySelector("#app-content")?.replaceWith(nextContent);
        document.title = nextDocument.title;
        document.querySelectorAll("[data-tab-navigation]").forEach((item) => item.classList.toggle("is-active", new URL(item.href, window.location.href).pathname === target.pathname));
        window.history.pushState({}, "", target.href);
        initializeApp();
      };
      if (document.startViewTransition) document.startViewTransition(swap);
      else await swap();
    });
  });

  document.querySelectorAll("[data-beer-search]").forEach((searchField) => {
    const form = searchField.closest("form");
    const items = form?.querySelectorAll("[data-beer-picker-item]") || [];
    searchField.addEventListener("input", () => {
      const term = searchField.value.trim().toLocaleLowerCase("zh-CN");
      items.forEach((item) => { item.hidden = Boolean(term) && !item.dataset.searchText.includes(term); });
    });
  });

  document.querySelectorAll("[data-filter-sheet]").forEach((sheet) => {
    if (sheet.dataset.enhanced) return;
    sheet.dataset.enhanced = "true";
    const overlay = document.querySelector("[data-filter-overlay]");
    const openButton = document.querySelector("[data-filter-open]");
    const closeButton = sheet.querySelector("[data-filter-close]");
    const close = () => { sheet.classList.remove("is-open"); overlay?.classList.remove("is-open"); document.body.classList.remove("filter-sheet-open"); sheet.setAttribute("aria-hidden", "true"); };
    const open = () => { sheet.classList.add("is-open"); overlay?.classList.add("is-open"); document.body.classList.add("filter-sheet-open"); sheet.setAttribute("aria-hidden", "false"); };
    openButton?.addEventListener("click", open);
    closeButton?.addEventListener("click", close);
    overlay?.addEventListener("click", close);
  });

  const installButton = document.querySelector("[data-pwa-install]");
  let installPrompt;
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; if (installButton) installButton.hidden = false; });
  installButton?.addEventListener("click", async () => { if (!installPrompt) return; installButton.hidden = true; await installPrompt.prompt(); installPrompt = null; });
  window.addEventListener("appinstalled", () => { installPrompt = null; if (installButton) installButton.hidden = true; });
};

if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {}); }, { once: true });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
else initializeApp();
