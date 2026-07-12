from django import template

from core.countries import COUNTRY_NAMES, country_flag

register = template.Library()


@register.filter
def country_name(code):
    return COUNTRY_NAMES.get(code, code or "未填写国家")


@register.filter
def flag(code):
    return country_flag(code)
