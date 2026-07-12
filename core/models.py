import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Q


class TimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SoftDeletableModel(TimestampedModel):
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True


class BeerStyle(SoftDeletableModel):
    name = models.CharField(max_length=120)
    normalized_name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    sort_order = models.SmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "beer_styles"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class SourceEntity(SoftDeletableModel):
    name = models.CharField(max_length=200)
    normalized_name = models.CharField(max_length=200)
    country_code = models.CharField(
        max_length=2,
        blank=True,
        validators=[RegexValidator(r"^[A-Z]{2}$", "国家代码必须为两个大写英文字母。")],
    )
    region = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        abstract = True
        constraints = [
            models.UniqueConstraint(fields=["normalized_name", "country_code", "region"], name="%(class)s_normalized_location_unique"),
        ]
        ordering = ["name"]


class Brand(SourceEntity):
    class Meta(SourceEntity.Meta):
        db_table = "brands"

    def __str__(self):
        return self.name


class Brewery(SourceEntity):
    class Meta(SourceEntity.Meta):
        db_table = "breweries"

    def __str__(self):
        return self.name


class Beer(SoftDeletableModel):
    name = models.CharField(max_length=200)
    brand = models.ForeignKey(Brand, null=True, blank=True, on_delete=models.PROTECT, related_name="beers")
    brewery = models.ForeignKey(Brewery, null=True, blank=True, on_delete=models.PROTECT, related_name="beers")
    origin_country_code = models.CharField(
        max_length=2,
        blank=True,
        validators=[RegexValidator(r"^[A-Z]{2}$", "国家代码必须为两个大写英文字母。")],
    )
    origin_region = models.CharField(max_length=120, blank=True)
    style = models.ForeignKey(BeerStyle, null=True, blank=True, on_delete=models.PROTECT, related_name="beers")
    abv = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))])
    ibu = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal("0.00"))])
    color_ebc = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal("0.00"))])
    catalog_notes = models.TextField(blank=True)

    class Meta:
        db_table = "beers"
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(abv__isnull=True) | Q(abv__gte=0, abv__lte=100), name="beer_abv_range"),
            models.CheckConstraint(condition=Q(ibu__isnull=True) | Q(ibu__gte=0), name="beer_ibu_non_negative"),
            models.CheckConstraint(condition=Q(color_ebc__isnull=True) | Q(color_ebc__gte=0), name="beer_color_ebc_non_negative"),
        ]
        indexes = [models.Index(fields=["origin_country_code"]), models.Index(fields=["style"])]

    def __str__(self):
        return self.name


class Tasting(SoftDeletableModel):
    beer = models.ForeignKey(Beer, on_delete=models.PROTECT, related_name="tastings")
    tasted_at = models.DateTimeField()
    drinking_location = models.CharField(max_length=255, blank=True)
    volume_ml = models.PositiveIntegerField(null=True, blank=True)
    price_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency_code = models.CharField(max_length=3, default="CNY", validators=[RegexValidator(r"^[A-Z]{3}$", "货币代码必须为三个大写英文字母。")])
    purchase_channel = models.CharField(max_length=100, blank=True)
    purchase_location = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    overall_score = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True, validators=[MinValueValidator(Decimal("0.0")), MaxValueValidator(Decimal("10.0"))])

    class Meta:
        db_table = "tastings"
        ordering = ["-tasted_at", "-created_at", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(volume_ml__isnull=True) | Q(volume_ml__gt=0), name="tasting_volume_positive"),
            models.CheckConstraint(condition=Q(price_amount__isnull=True) | Q(price_amount__gte=0), name="tasting_price_non_negative"),
            models.CheckConstraint(condition=Q(overall_score__isnull=True) | Q(overall_score__gte=0, overall_score__lte=10), name="tasting_overall_score_range"),
        ]
        indexes = [models.Index(fields=["beer", "-tasted_at", "-created_at"]), models.Index(fields=["-tasted_at"])]

    def __str__(self):
        return f"{self.beer} - {self.tasted_at:%Y-%m-%d}"


class Photo(TimestampedModel):
    tasting = models.ForeignKey(Tasting, on_delete=models.CASCADE, related_name="photos")
    storage_key = models.CharField(max_length=500, unique=True)
    thumbnail_key = models.CharField(max_length=500, unique=True)
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100)
    byte_size = models.PositiveBigIntegerField()
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    sort_order = models.PositiveSmallIntegerField(default=0)
    checksum_sha256 = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "photos"
        ordering = ["sort_order", "created_at"]
        indexes = [models.Index(fields=["tasting", "sort_order", "created_at"])]

    def __str__(self):
        return self.storage_key


class RatingDimension(TimestampedModel):
    code = models.CharField(max_length=50, unique=True, validators=[RegexValidator(r"^[a-z0-9_]+$", "评分维度代码只能使用小写字母、数字和下划线。")])
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    scale_min = models.DecimalField(max_digits=6, decimal_places=3, default=Decimal("0"))
    scale_max = models.DecimalField(max_digits=6, decimal_places=3, default=Decimal("10"))
    step = models.DecimalField(max_digits=6, decimal_places=3, default=Decimal("0.5"))
    sort_order = models.SmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "rating_dimensions"
        ordering = ["sort_order", "code"]
        constraints = [
            models.CheckConstraint(condition=Q(scale_min__lt=models.F("scale_max")), name="rating_scale_min_lt_max"),
            models.CheckConstraint(condition=Q(step__gt=0), name="rating_step_positive"),
        ]

    def __str__(self):
        return self.name


class TastingRatingValue(TimestampedModel):
    tasting = models.ForeignKey(Tasting, on_delete=models.CASCADE, related_name="rating_values")
    dimension = models.ForeignKey(RatingDimension, on_delete=models.PROTECT, related_name="rating_values")
    value = models.DecimalField(max_digits=6, decimal_places=3)
    dimension_name_snapshot = models.CharField(max_length=80)
    scale_min_snapshot = models.DecimalField(max_digits=6, decimal_places=3)
    scale_max_snapshot = models.DecimalField(max_digits=6, decimal_places=3)
    step_snapshot = models.DecimalField(max_digits=6, decimal_places=3)

    class Meta:
        db_table = "tasting_rating_values"
        constraints = [models.UniqueConstraint(fields=["tasting", "dimension"], name="tasting_dimension_unique")]


class FlavorTag(TimestampedModel):
    name = models.CharField(max_length=80)
    normalized_name = models.CharField(max_length=80, unique=True)
    category = models.CharField(max_length=40)

    class Meta:
        db_table = "flavor_tags"
        ordering = ["category", "name"]

    def __str__(self):
        return self.name


class BeerFlavorTag(TimestampedModel):
    beer = models.ForeignKey(Beer, on_delete=models.CASCADE, related_name="flavor_tag_links")
    tag = models.ForeignKey(FlavorTag, on_delete=models.CASCADE, related_name="beer_links")

    class Meta:
        db_table = "beer_flavor_tags"
        constraints = [models.UniqueConstraint(fields=["beer", "tag"], name="beer_flavor_tag_unique")]


class TastingTag(TimestampedModel):
    name = models.CharField(max_length=80)
    normalized_name = models.CharField(max_length=80, unique=True)
    category = models.CharField(max_length=40)

    class Meta:
        db_table = "tasting_tags"
        ordering = ["category", "name"]

    def __str__(self):
        return self.name


class TastingTagLink(TimestampedModel):
    tasting = models.ForeignKey(Tasting, on_delete=models.CASCADE, related_name="tag_links")
    tag = models.ForeignKey(TastingTag, on_delete=models.CASCADE, related_name="tasting_links")

    class Meta:
        db_table = "tasting_tag_links"
        constraints = [models.UniqueConstraint(fields=["tasting", "tag"], name="tasting_tag_unique")]
