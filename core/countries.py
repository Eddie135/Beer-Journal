COUNTRIES = (
    ("CN", "中国"), ("DE", "德国"), ("BE", "比利时"), ("US", "美国"),
    ("GB", "英国"), ("IE", "爱尔兰"), ("JP", "日本"), ("CZ", "捷克"),
    ("NL", "荷兰"), ("DK", "丹麦"), ("FR", "法国"), ("IT", "意大利"),
    ("ES", "西班牙"), ("AU", "澳大利亚"), ("NZ", "新西兰"), ("CA", "加拿大"),
)

COUNTRY_NAMES = dict(COUNTRIES)
COUNTRY_ENGLISH_NAMES = {
    "CN": "China", "DE": "Germany", "BE": "Belgium", "US": "United States USA",
    "GB": "United Kingdom England UK", "IE": "Ireland", "JP": "Japan", "CZ": "Czechia Czech Republic",
    "NL": "Netherlands Holland", "DK": "Denmark", "FR": "France", "IT": "Italy",
    "ES": "Spain", "AU": "Australia", "NZ": "New Zealand", "CA": "Canada",
}


def country_flag(code):
    if not code or len(code) != 2 or not code.isalpha():
        return "🌍"
    return "".join(chr(0x1F1E6 + ord(letter) - ord("A")) for letter in code.upper())
