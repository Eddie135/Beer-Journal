export const FIVE_OPTION_RATINGS = Object.freeze({
  mouthfeel_rating: Object.freeze({ label: "口感", start: "清爽", end: "醇厚", options: Object.freeze([[1, "清爽"], [2, "偏清爽"], [3, "平衡"], [4, "偏醇厚"], [5, "醇厚"]]) }),
  bitterness_rating: Object.freeze({ label: "苦味", start: "淡", end: "苦", options: Object.freeze([[1, "淡"], [2, "微苦"], [3, "平衡"], [4, "偏苦"], [5, "苦"]]) }),
  complexity_rating: Object.freeze({ label: "风味复杂度", start: "简单", end: "复杂", options: Object.freeze([[1, "简单"], [2, "较简单"], [3, "平衡"], [4, "较复杂"], [5, "复杂"]]) }),
});

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const normalizeValue = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
};

export function renderFiveOptionRating(name, value = null) {
  const config = FIVE_OPTION_RATINGS[name];
  if (!config) throw new Error(`Unknown five-option rating: ${name}`);
  const selected = normalizeValue(value);
  const options = [["", "未填写"], ...config.options].map(([optionValue, label]) => `<label class="five-option-rating__option${String(optionValue) === String(selected ?? "") ? " is-selected" : ""}"><input type="radio" name="${escapeHtml(name)}" value="${optionValue}"${String(optionValue) === String(selected ?? "") ? " checked" : ""}><span>${escapeHtml(label)}</span></label>`).join("");
  return `<fieldset class="five-option-rating" data-five-option-rating="${escapeHtml(name)}"><legend>${escapeHtml(config.label)}</legend><div class="five-option-rating__scale"><span class="five-option-rating__endpoint">${escapeHtml(config.start)}</span><div class="five-option-rating__options" role="radiogroup" aria-label="${escapeHtml(config.label)}">${options}</div><span class="five-option-rating__endpoint">${escapeHtml(config.end)}</span></div></fieldset>`;
}

export function renderFiveOptionSummary(name, value = null) {
  const config = FIVE_OPTION_RATINGS[name];
  if (!config) throw new Error(`Unknown five-option rating: ${name}`);
  const selected = normalizeValue(value);
  const stars = selected === null ? "未填写" : `${"★".repeat(selected)}${"☆".repeat(5 - selected)}`;
  return `<div class="five-option-rating-summary" data-five-option-summary="${escapeHtml(name)}"><strong>${escapeHtml(config.label)}</strong><span>${escapeHtml(config.start)}</span><b aria-label="${selected === null ? "未填写" : `${selected} / 5`}">${stars}</b><span>${escapeHtml(config.end)}</span></div>`;
}

export function readFiveOptionRating(form, name) { return form?.elements?.namedItem?.(name)?.value || ""; }
