/**
 * The five-option Beer experience controls used by the last complete web UI.
 * Values intentionally stay compatible with the existing local Beer columns.
 */
export const FIVE_OPTION_RATINGS = Object.freeze({
  mouthfeel_rating: Object.freeze({
    label: "口感",
    start: "清爽",
    end: "醇厚",
    options: Object.freeze([
      [1, "清爽"],
      [2, "偏清爽"],
      [3, "平衡"],
      [4, "偏醇厚"],
      [5, "醇厚"],
    ]),
  }),
  bitterness_rating: Object.freeze({
    label: "苦度",
    start: "淡",
    end: "苦",
    options: Object.freeze([
      [1, "淡"],
      [2, "微苦"],
      [3, "平衡"],
      [4, "偏苦"],
      [5, "苦"],
    ]),
  }),
  complexity_rating: Object.freeze({
    label: "风味复杂度",
    start: "简单",
    end: "复杂",
    options: Object.freeze([
      [1, "简单"],
      [2, "较简单"],
      [3, "平衡"],
      [4, "较复杂"],
      [5, "复杂"],
    ]),
  }),
});

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const normalizeValue = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5 ? numeric : null;
};

const configFor = (name) => {
  const config = FIVE_OPTION_RATINGS[name];
  if (!config) throw new Error(`Unknown five-option rating: ${name}`);
  return config;
};

export function renderFiveOptionRating(name, value = null) {
  const config = configFor(name);
  const selected = normalizeValue(value);
  const emptyOption = `<label class="five-option-rating__option five-option-rating__option--empty"><input type="radio" name="${escapeHtml(name)}" value=""${selected === null ? " checked" : ""}><span>未填写</span></label>`;
  const options = config.options.map(([optionValue, optionLabel]) => `<label class="five-option-rating__option"><input type="radio" name="${escapeHtml(name)}" value="${optionValue}"${selected === optionValue ? " checked" : ""}><span>${escapeHtml(optionLabel)}</span></label>`).join("");
  return `<fieldset class="five-option-rating" data-five-option-rating="${escapeHtml(name)}"><legend>${escapeHtml(config.label)}</legend><div class="five-option-rating__scale"><span class="five-option-rating__endpoint">${escapeHtml(config.start)}</span><div class="five-option-rating__options" role="radiogroup" aria-label="${escapeHtml(config.label)}">${emptyOption}${options}</div><span class="five-option-rating__endpoint">${escapeHtml(config.end)}</span></div></fieldset>`;
}

export function renderFiveOptionSummary(name, value = null) {
  const config = configFor(name);
  const selected = normalizeValue(value);
  const stars = selected === null ? "—" : `${"★".repeat(selected)}${"☆".repeat(5 - selected)}`;
  return `<div class="five-option-rating-summary" data-five-option-summary="${escapeHtml(name)}"><strong>${escapeHtml(config.label)}</strong><span>${escapeHtml(config.start)}</span><b aria-label="${selected === null ? "未填写" : `${selected} / 5`}">${stars}</b><span>${escapeHtml(config.end)}</span></div>`;
}

export function readFiveOptionRating(form, name) {
  const field = form?.elements?.namedItem?.(name);
  return field?.value || "";
}
