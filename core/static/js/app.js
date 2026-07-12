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
});
