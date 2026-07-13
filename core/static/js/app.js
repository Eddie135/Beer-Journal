const initializeApp = () => {
  document.querySelectorAll(".progressive-image").forEach((image) => {
    const reveal = () => image.classList.add("is-loaded");
    if (image.complete) reveal();
    else image.addEventListener("load", reveal, { once: true });
  });

  document.querySelectorAll("[data-category-select]").forEach((categorySelect) => {
    const form = categorySelect.closest("form");
    const styleSelect = form?.querySelector("[data-style-select]");
    if (!styleSelect) return;
    const filterStyles = () => {
      const categoryId = categorySelect.value;
      Array.from(styleSelect.options).forEach((option) => {
        if (!option.value) return;
        option.hidden = Boolean(categoryId) && option.dataset.categoryId !== categoryId;
      });
      if (styleSelect.selectedOptions[0]?.hidden) styleSelect.value = "";
    };
    categorySelect.addEventListener("change", filterStyles);
    filterStyles();
  });

  document.querySelectorAll("[data-beer-search]").forEach((searchField) => {
    const form = searchField.closest("form");
    const items = form?.querySelectorAll("[data-beer-picker-item]") || [];
    searchField.addEventListener("input", () => {
      const term = searchField.value.trim().toLocaleLowerCase("zh-CN");
      items.forEach((item) => {
        item.hidden = Boolean(term) && !item.dataset.searchText.includes(term);
      });
    });
  });

  document.querySelectorAll("[data-filter-sheet]").forEach((sheet) => {
    const overlay = document.querySelector("[data-filter-overlay]");
    const openButton = document.querySelector("[data-filter-open]");
    const closeButton = sheet.querySelector("[data-filter-close]");
    const close = () => {
      sheet.classList.remove("is-open");
      overlay?.classList.remove("is-open");
      document.body.classList.remove("filter-sheet-open");
      sheet.setAttribute("aria-hidden", "true");
    };
    const open = () => {
      sheet.classList.add("is-open");
      overlay?.classList.add("is-open");
      document.body.classList.add("filter-sheet-open");
      sheet.setAttribute("aria-hidden", "false");
    };
    openButton?.addEventListener("click", open);
    closeButton?.addEventListener("click", close);
    overlay?.addEventListener("click", close);
  });

  const installButton = document.querySelector("[data-pwa-install]");
  let installPrompt;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });
  installButton?.addEventListener("click", async () => {
    if (!installPrompt) return;
    installButton.hidden = true;
    await installPrompt.prompt();
    installPrompt = null;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
  });
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
  }, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}
