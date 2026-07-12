from decimal import Decimal

from django import forms
from django.db import transaction
from django.utils import timezone

from .models import (
    Beer,
    BeerFlavorTag,
    BeerStyle,
    Brand,
    Brewery,
    FlavorTag,
    RatingDimension,
    Tasting,
    TastingRatingValue,
    TastingTag,
    TastingTagLink,
)


class TastingRatingValueAdminForm(forms.ModelForm):
    class Meta:
        model = TastingRatingValue
        fields = ("tasting", "dimension", "value")

    def save(self, commit=True):
        instance = super().save(commit=False)
        dimension = instance.dimension
        instance.dimension_name_snapshot = dimension.name
        instance.scale_min_snapshot = dimension.scale_min
        instance.scale_max_snapshot = dimension.scale_max
        instance.step_snapshot = dimension.step
        if commit:
            instance.save()
            self.save_m2m()
        return instance


class CreateBeerTastingForm(forms.Form):
    name = forms.CharField(label="啤酒名称", max_length=200)
    brand_name = forms.CharField(label="品牌", max_length=200, required=False)
    brewery_name = forms.CharField(label="酒厂", max_length=200, required=False)
    origin_country_code = forms.CharField(label="国家代码", max_length=2, help_text="使用两位大写代码，例如 CN、DE、US。")
    style = forms.ModelChoiceField(label="啤酒类型", queryset=BeerStyle.objects.none())
    abv = forms.DecimalField(label="ABV 酒精度（%）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"), max_value=Decimal("100"))
    ibu = forms.DecimalField(label="IBU 苦度", max_digits=6, decimal_places=2, required=False, min_value=Decimal("0"))
    flavor_tags = forms.ModelMultipleChoiceField(label="风味标签", queryset=FlavorTag.objects.none(), required=False, widget=forms.CheckboxSelectMultiple)
    tasted_at = forms.DateTimeField(label="品饮时间", widget=forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"), input_formats=["%Y-%m-%dT%H:%M"], initial=timezone.localtime)
    drinking_location = forms.CharField(label="饮用地点", max_length=255, required=False)
    price_amount = forms.DecimalField(label="价格", max_digits=12, decimal_places=2, required=False, min_value=Decimal("0"))
    overall_score = forms.DecimalField(label="总评分（0–10，0.5 步进）", max_digits=3, decimal_places=1, required=False, min_value=Decimal("0"), max_value=Decimal("10"))
    notes = forms.CharField(label="品饮笔记", required=False, widget=forms.Textarea)
    food_tags = forms.ModelMultipleChoiceField(label="食物搭配", queryset=TastingTag.objects.none(), required=False, widget=forms.CheckboxSelectMultiple)
    occasion_tags = forms.ModelMultipleChoiceField(label="饮用场景", queryset=TastingTag.objects.none(), required=False, widget=forms.CheckboxSelectMultiple)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["style"].queryset = BeerStyle.objects.filter(is_active=True, deleted_at__isnull=True)
        self.fields["flavor_tags"].queryset = FlavorTag.objects.all()
        self.fields["food_tags"].queryset = TastingTag.objects.filter(category="food_pairing")
        self.fields["occasion_tags"].queryset = TastingTag.objects.filter(category="occasion")
        self.dimensions = list(RatingDimension.objects.filter(is_active=True).order_by("sort_order", "code"))
        for dimension in self.dimensions:
            self.fields[self._rating_field_name(dimension)] = forms.DecimalField(
                label=f"{dimension.name}（{dimension.scale_min}–{dimension.scale_max}）",
                max_digits=6,
                decimal_places=3,
                required=False,
                min_value=dimension.scale_min,
                max_value=dimension.scale_max,
            )
        self.beer_fields = [self[name] for name in ("name", "brand_name", "brewery_name", "origin_country_code", "style", "abv", "ibu", "flavor_tags")]
        self.tasting_fields = [self[name] for name in ("tasted_at", "drinking_location", "price_amount", "overall_score", "notes", "food_tags", "occasion_tags")]
        self.rating_fields = [self[self._rating_field_name(dimension)] for dimension in self.dimensions]

    @staticmethod
    def _rating_field_name(dimension):
        return f"rating_{dimension.id}"

    @staticmethod
    def _is_step(value, minimum, step):
        return (value - minimum) % step == 0

    def clean_name(self):
        name = self.cleaned_data["name"].strip()
        if not name:
            raise forms.ValidationError("请填写啤酒名称。")
        return name

    def clean_origin_country_code(self):
        country_code = self.cleaned_data["origin_country_code"].strip().upper()
        if len(country_code) != 2 or not country_code.isalpha():
            raise forms.ValidationError("请填写两位大写国家代码，例如 CN、DE、US。")
        return country_code

    def clean(self):
        cleaned_data = super().clean()
        overall_score = cleaned_data.get("overall_score")
        if overall_score is not None and not self._is_step(overall_score, Decimal("0"), Decimal("0.5")):
            self.add_error("overall_score", "总评分必须以 0.5 为步进。")
        for dimension in self.dimensions:
            field_name = self._rating_field_name(dimension)
            value = cleaned_data.get(field_name)
            if value is not None and not self._is_step(value, dimension.scale_min, dimension.step):
                self.add_error(field_name, f"评分必须以 {dimension.step} 为步进。")
        return cleaned_data

    @staticmethod
    def _get_or_create_source(model, value, country_code):
        value = value.strip()
        if not value:
            return None
        source, _ = model.objects.get_or_create(
            normalized_name=value.casefold(),
            country_code=country_code,
            region="",
            defaults={"name": value},
        )
        return source

    @transaction.atomic
    def create_records(self):
        if not self.is_valid():
            raise ValueError("表单必须先通过校验。")
        data = self.cleaned_data
        brand = self._get_or_create_source(Brand, data["brand_name"], data["origin_country_code"])
        brewery = self._get_or_create_source(Brewery, data["brewery_name"], data["origin_country_code"])
        beer = Beer.objects.create(
            name=data["name"],
            brand=brand,
            brewery=brewery,
            origin_country_code=data["origin_country_code"],
            style=data["style"],
            abv=data["abv"],
            ibu=data["ibu"],
        )
        for tag in data["flavor_tags"]:
            BeerFlavorTag.objects.create(beer=beer, tag=tag)
        tasting = Tasting.objects.create(
            beer=beer,
            tasted_at=data["tasted_at"],
            drinking_location=data["drinking_location"],
            price_amount=data["price_amount"],
            notes=data["notes"],
            overall_score=data["overall_score"],
        )
        for tag in list(data["food_tags"]) + list(data["occasion_tags"]):
            TastingTagLink.objects.create(tasting=tasting, tag=tag)
        for dimension in self.dimensions:
            value = data.get(self._rating_field_name(dimension))
            if value is not None:
                TastingRatingValue.objects.create(
                    tasting=tasting,
                    dimension=dimension,
                    value=value,
                    dimension_name_snapshot=dimension.name,
                    scale_min_snapshot=dimension.scale_min,
                    scale_max_snapshot=dimension.scale_max,
                    step_snapshot=dimension.step,
                )
        return beer, tasting
