document.addEventListener("DOMContentLoaded", () => {
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
});
