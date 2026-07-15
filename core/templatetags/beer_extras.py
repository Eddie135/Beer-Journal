from django import template

from core.countries import COUNTRY_ENGLISH_NAMES, COUNTRY_NAMES, country_flag

register = template.Library()


@register.filter
def country_name(code):
    return COUNTRY_NAMES.get(code, code or "未填写国家")


@register.filter
def flag(code):
    return country_flag(code)


@register.filter
def country_english(code):
    return COUNTRY_ENGLISH_NAMES.get(code, "")
