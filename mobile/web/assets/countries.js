// ISO 3166-1 alpha-2 country and territory data. Names are resolved from the
// platform's built-in CLDR data, so the complete list remains bundled offline.
const ISO_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/);

const zhNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const enNames = new Intl.DisplayNames(["en"], { type: "region" });

const OVERRIDES = {
  KR: ["韩国", "South Korea", ["Korea", "Republic of Korea", "韩国", "南韩"]],
  KP: ["朝鲜", "North Korea", ["North Korea", "DPRK", "朝鲜", "北韩"]],
  US: ["美国", "United States", ["USA", "US", "United States of America", "美国"]],
  GB: ["英国", "United Kingdom", ["UK", "Great Britain", "England", "英国"]],
  CZ: ["捷克", "Czechia", ["Czech Republic", "Czechia", "捷克"]],
  TW: ["中国台湾", "Taiwan", ["Taiwan, China", "台湾"]],
  HK: ["中国香港", "Hong Kong", ["香港"]],
  MO: ["中国澳门", "Macao", ["澳门"]],
};

export const COUNTRIES = ISO_CODES.map((code) => {
  const override = OVERRIDES[code];
  const name = override?.[0] || zhNames.of(code) || code;
  const english = override?.[1] || enNames.of(code) || code;
  const aliases = override?.[2] || [];
  return [code, name, english, aliases];
});

export const flagForCountry = (code) => {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "🌐";
  return [...code.toUpperCase()].map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("");
};

export const countrySearchText = ([code, name, english, aliases = []]) =>
  [code, name, english, ...aliases].join(" ").toLowerCase();

export const searchCountries = (query = "") => {
  const needle = String(query).trim().toLowerCase();
  return COUNTRIES.filter((country) => !needle || countrySearchText(country).includes(needle));
};

export const findCountry = (code, customName = "") => {
  const item = COUNTRIES.find(([value]) => value === String(code || "").toUpperCase());
  if (item) return { code: item[0], name: item[1], english: item[2], aliases: item[3], flag: flagForCountry(item[0]), isCustom: false };
  const name = String(customName || "").trim();
  if (name) return { code: "", name, english: name, aliases: [name], flag: "🌐", isCustom: true };
  return { code: "", name: "未选择国家", english: "", aliases: [], flag: "🌐", isCustom: false };
};
