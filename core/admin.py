from django.contrib import admin

from .models import (
    Beer,
    BeerFlavorTag,
    BeerStyle,
    Brand,
    Brewery,
    FlavorTag,
    Photo,
    RatingDimension,
    Tasting,
    TastingRatingValue,
    TastingTag,
    TastingTagLink,
)


@admin.register(BeerStyle)
class BeerStyleAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "deleted_at")
    search_fields = ("name", "normalized_name")


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "country_code", "region", "deleted_at")
    search_fields = ("name", "normalized_name")


@admin.register(Brewery)
class BreweryAdmin(admin.ModelAdmin):
    list_display = ("name", "country_code", "region", "deleted_at")
    search_fields = ("name", "normalized_name")


@admin.register(Beer)
class BeerAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "brewery", "style", "abv", "ibu", "deleted_at")
    list_filter = ("style", "origin_country_code")
    search_fields = ("name", "brand__name", "brewery__name")


@admin.register(Tasting)
class TastingAdmin(admin.ModelAdmin):
    list_display = ("beer", "tasted_at", "drinking_location", "overall_score", "deleted_at")
    list_filter = ("currency_code",)
    search_fields = ("beer__name", "drinking_location", "notes")
    date_hierarchy = "tasted_at"


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ("tasting", "storage_key", "sort_order", "created_at")
    search_fields = ("storage_key", "original_filename")


@admin.register(RatingDimension)
class RatingDimensionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "scale_min", "scale_max", "step", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")


@admin.register(TastingRatingValue)
class TastingRatingValueAdmin(admin.ModelAdmin):
    list_display = ("tasting", "dimension", "value", "dimension_name_snapshot")
    list_filter = ("dimension",)


@admin.register(FlavorTag)
class FlavorTagAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "normalized_name")
    list_filter = ("category",)
    search_fields = ("name", "normalized_name")


@admin.register(BeerFlavorTag)
class BeerFlavorTagAdmin(admin.ModelAdmin):
    list_display = ("beer", "tag", "created_at")
    list_filter = ("tag",)
    search_fields = ("beer__name", "tag__name")


@admin.register(TastingTag)
class TastingTagAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "normalized_name")
    list_filter = ("category",)
    search_fields = ("name", "normalized_name")


@admin.register(TastingTagLink)
class TastingTagLinkAdmin(admin.ModelAdmin):
    list_display = ("tasting", "tag", "created_at")
    list_filter = ("tag",)
    search_fields = ("tasting__beer__name", "tag__name")
