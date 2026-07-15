export const COUNTRIES = [
  ["CN", "中国", "China"], ["DE", "德国", "Germany"], ["BE", "比利时", "Belgium"],
  ["US", "美国", "United States USA"], ["GB", "英国", "United Kingdom England UK"],
  ["IE", "爱尔兰", "Ireland"], ["JP", "日本", "Japan"], ["CZ", "捷克", "Czechia Czech Republic"],
  ["NL", "荷兰", "Netherlands Holland"], ["DK", "丹麦", "Denmark"], ["FR", "法国", "France"],
  ["IT", "意大利", "Italy"], ["ES", "西班牙", "Spain"], ["AU", "澳大利亚", "Australia"],
  ["NZ", "新西兰", "New Zealand"], ["CA", "加拿大", "Canada"],
];

export const flagForCountry = (code) => {
  if (!code || code.length !== 2) return "🌍";
  return [...code.toUpperCase()].map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("");
};

export const findCountry = (code) => {
  const item = COUNTRIES.find(([value]) => value === code);
  return item ? { code: item[0], name: item[1], english: item[2], flag: flagForCountry(item[0]) } : { code: "", name: "未选择国家", english: "", flag: "🌍" };
};
