const makeIcon = (path) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;

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
    control.querySelector("strong").textContent = selected?.value ? selected.textContent.trim() : `请选择${label}`;
  };
  const render = () => {
    sheet.body.replaceChildren();
    Array.from(select.options).filter((option) => option.value && !option.hidden).forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sheet-option";
      item.textContent = option.textContent.trim();
      item.classList.toggle("is-selected", option.selected);
      item.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        sync();
        sheet.close();
      });
      sheet.body.append(item);
    });
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

const initializeApp = () => {
  document.querySelectorAll(".progressive-image").forEach((image) => {
    const reveal = () => image.classList.add("is-loaded");
    if (image.complete) reveal();
    else image.addEventListener("load", reveal, { once: true });
  });
  initializeCategorySelects();
  document.querySelectorAll("[data-datetime-picker]").forEach(enhanceDateInput);
  document.querySelectorAll('input[type="file"][multiple]').forEach(enhancePhotoInput);

  document.querySelectorAll("[data-beer-search]").forEach((searchField) => {
    const form = searchField.closest("form");
    const items = form?.querySelectorAll("[data-beer-picker-item]") || [];
    searchField.addEventListener("input", () => {
      const term = searchField.value.trim().toLocaleLowerCase("zh-CN");
      items.forEach((item) => { item.hidden = Boolean(term) && !item.dataset.searchText.includes(term); });
    });
  });

  document.querySelectorAll("[data-filter-sheet]").forEach((sheet) => {
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
