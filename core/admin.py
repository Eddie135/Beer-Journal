from django.contrib import admin

from .forms import TastingRatingValueAdminForm
from .models import (
    Beer,
    BeerCategory,
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


class BeerFlavorTagInline(admin.TabularInline):
    model = BeerFlavorTag
    extra = 1
    autocomplete_fields = ("tag",)


class TastingPhotoInline(admin.TabularInline):
    model = Photo
    extra = 0
    fields = ("storage_key", "thumbnail_key", "mime_type", "byte_size", "width", "height", "sort_order", "checksum_sha256")


class TastingRatingInline(admin.TabularInline):
    model = TastingRatingValue
    form = TastingRatingValueAdminForm
    extra = 0
    autocomplete_fields = ("dimension",)
    fields = ("dimension", "value")


class TastingTagInline(admin.TabularInline):
    model = TastingTagLink
    extra = 1
    autocomplete_fields = ("tag",)


@admin.register(BeerStyle)
class BeerStyleAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "deleted_at")
    search_fields = ("name", "normalized_name")
    list_filter = ("category", "is_active", "deleted_at")
    autocomplete_fields = ("category",)


@admin.register(BeerCategory)
class BeerCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "sort_order", "is_active", "deleted_at")
    search_fields = ("name", "code", "normalized_name")


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
    list_filter = ("style", "origin_country_code", "deleted_at")
    search_fields = ("name", "brand__name", "brewery__name")
    list_select_related = ("brand", "brewery", "style")
    autocomplete_fields = ("brand", "brewery", "style")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = (BeerFlavorTagInline,)
    fieldsets = (
        ("基本资料", {"fields": (("name", "style"), ("brand", "brewery"), ("origin_country_code", "origin_region"))}),
        ("规格", {"fields": (("abv", "ibu", "color_ebc"), "catalog_notes")}),
        ("记录状态", {"fields": ("id", "created_at", "updated_at", "deleted_at"), "classes": ("collapse",)}),
    )


@admin.register(Tasting)
class TastingAdmin(admin.ModelAdmin):
    list_display = ("beer", "tasted_at", "drinking_location", "overall_score", "deleted_at")
    list_filter = ("currency_code", "deleted_at")
    search_fields = ("beer__name", "drinking_location", "notes")
    date_hierarchy = "tasted_at"
    list_select_related = ("beer",)
    autocomplete_fields = ("beer",)
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = (TastingPhotoInline, TastingRatingInline, TastingTagInline)
    fieldsets = (
        ("品饮信息", {"fields": (("beer", "tasted_at"), ("drinking_location", "capacity", "bottle_count"), ("notes", "overall_score"))}),
        ("购买信息", {"fields": (("price_amount", "currency_code"), ("purchase_channel", "purchase_location"))}),
        ("记录状态", {"fields": ("id", "created_at", "updated_at", "deleted_at"), "classes": ("collapse",)}),
    )


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ("tasting", "storage_key", "sort_order", "created_at")
    search_fields = ("storage_key", "original_filename")
    autocomplete_fields = ("tasting",)


@admin.register(RatingDimension)
class RatingDimensionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "scale_min", "scale_max", "step", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")


@admin.register(TastingRatingValue)
class TastingRatingValueAdmin(admin.ModelAdmin):
    form = TastingRatingValueAdminForm
    list_display = ("tasting", "dimension", "value", "dimension_name_snapshot")
    list_filter = ("dimension",)
    search_fields = ("tasting__beer__name", "dimension_name_snapshot")
    autocomplete_fields = ("tasting", "dimension")


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
    autocomplete_fields = ("beer", "tag")


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
    autocomplete_fields = ("tasting", "tag")
