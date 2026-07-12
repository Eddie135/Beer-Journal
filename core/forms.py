from decimal import Decimal

from django import forms
from django.db import transaction
from django.utils import timezone

from .countries import COUNTRIES
from .models import (
    Beer,
    BeerCategory,
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


class StyleSelect(forms.Select):
    def create_option(self, name, value, label, selected, index, subindex=None, attrs=None):
        option = super().create_option(name, value, label, selected, index, subindex, attrs)
        if hasattr(value, "instance"):
            option["attrs"]["data-category-id"] = str(value.instance.category_id)
        return option


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


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleFileField(forms.FileField):
    widget = MultipleFileInput

    def clean(self, data, initial=None):
        single_file_clean = super().clean
        if not data:
            return []
        return [single_file_clean(item, initial) for item in data]


class CreateBeerTastingForm(forms.Form):
    name = forms.CharField(label="啤酒名称", max_length=200)
    brand_name = forms.CharField(label="品牌", max_length=200, required=False)
    brewery_name = forms.CharField(label="酒厂", max_length=200, required=False)
    origin_country_code = forms.ChoiceField(label="国家", choices=COUNTRIES)
    category = forms.ModelChoiceField(label="啤酒大类", queryset=BeerCategory.objects.none(), widget=forms.Select(attrs={"data-category-select": ""}))
    style = forms.ModelChoiceField(label="啤酒类型", queryset=BeerStyle.objects.none(), widget=StyleSelect(attrs={"data-style-select": ""}))
    abv = forms.DecimalField(label="ABV 酒精度（%）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"), max_value=Decimal("100"))
    ibu = forms.DecimalField(label="IBU 苦度", max_digits=6, decimal_places=2, required=False, min_value=Decimal("0"))
    plato = forms.DecimalField(label="麦汁浓度 Plato（°P）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"))
    mouthfeel_profile = forms.ChoiceField(label="口感", required=False, choices=(("", "未填写"),) + Beer.MOUTHFEEL_CHOICES)
    flavor_tag_input = forms.CharField(label="风味标签", required=False, help_text="用逗号或顿号分隔，例如：柑橘、松脂、焦糖。")
    tasted_at = forms.DateTimeField(label="品饮时间", widget=forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"), input_formats=["%Y-%m-%dT%H:%M"], initial=timezone.localtime)
    drinking_location = forms.CharField(label="饮用地点", max_length=255, required=False)
    price_amount = forms.DecimalField(label="价格", max_digits=12, decimal_places=2, required=False, min_value=Decimal("0"))
    overall_score = forms.DecimalField(label="总评分（0–10，0.5 步进）", max_digits=3, decimal_places=1, required=False, min_value=Decimal("0"), max_value=Decimal("10"))
    notes = forms.CharField(label="品饮笔记", required=False, widget=forms.Textarea)
    food_tags = forms.ModelMultipleChoiceField(label="食物搭配", queryset=TastingTag.objects.none(), required=False, widget=forms.CheckboxSelectMultiple)
    occasion_tags = forms.ModelMultipleChoiceField(label="饮用场景", queryset=TastingTag.objects.none(), required=False, widget=forms.CheckboxSelectMultiple)
    photos = MultipleFileField(label="照片（可多选）", required=False, widget=MultipleFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}))

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["category"].queryset = BeerCategory.objects.filter(is_active=True, deleted_at__isnull=True)
        self.fields["style"].queryset = BeerStyle.objects.filter(is_active=True, deleted_at__isnull=True).select_related("category")
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
        self.beer_fields = [self[name] for name in ("name", "brand_name", "brewery_name", "origin_country_code", "category", "style", "abv", "ibu", "plato", "mouthfeel_profile", "flavor_tag_input")]
        self.tasting_fields = [self[name] for name in ("tasted_at", "drinking_location", "price_amount", "overall_score", "notes", "food_tags", "occasion_tags", "photos")]
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

    @staticmethod
    def _tag_names(value):
        return [item.strip() for item in value.replace("，", ",").replace("、", ",").split(",") if item.strip()]

    @classmethod
    def _get_or_create_flavor_tags(cls, value):
        tags = []
        seen_normalized_names = set()
        for name in cls._tag_names(value):
            normalized_name = FlavorTag.normalize_name(name)
            if not normalized_name or normalized_name in seen_normalized_names:
                continue
            seen_normalized_names.add(normalized_name)
            tag, _ = FlavorTag.objects.get_or_create(
                normalized_name=normalized_name,
                defaults={"name": name, "category": "自定义"},
            )
            tags.append(tag)
        return tags

    def clean(self):
        cleaned_data = super().clean()
        overall_score = cleaned_data.get("overall_score")
        style = cleaned_data.get("style")
        category = cleaned_data.get("category")
        if style and category and style.category_id != category.id:
            self.add_error("style", "请选择属于当前啤酒大类的类型。")
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
            plato=data["plato"],
            mouthfeel_profile=data["mouthfeel_profile"],
        )
        for tag in self._get_or_create_flavor_tags(data["flavor_tag_input"]):
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


class BeerEditForm(forms.Form):
    name = forms.CharField(label="啤酒名称", max_length=200)
    brand_name = forms.CharField(label="品牌", max_length=200, required=False)
    brewery_name = forms.CharField(label="酒厂", max_length=200, required=False)
    origin_country_code = forms.ChoiceField(label="国家", choices=COUNTRIES)
    category = forms.ModelChoiceField(label="啤酒大类", queryset=BeerCategory.objects.none(), widget=forms.Select(attrs={"data-category-select": ""}))
    style = forms.ModelChoiceField(label="啤酒类型", queryset=BeerStyle.objects.none(), widget=StyleSelect(attrs={"data-style-select": ""}))
    abv = forms.DecimalField(label="ABV 酒精度（%）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"), max_value=Decimal("100"))
    ibu = forms.DecimalField(label="IBU 苦度", max_digits=6, decimal_places=2, required=False, min_value=Decimal("0"))
    plato = forms.DecimalField(label="麦汁浓度 Plato（°P）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"))
    mouthfeel_profile = forms.ChoiceField(label="口感", required=False, choices=(("", "未填写"),) + Beer.MOUTHFEEL_CHOICES)
    flavor_tag_input = forms.CharField(label="风味标签", required=False, help_text="用逗号或顿号分隔，例如：柑橘、松脂、焦糖。")

    def __init__(self, *args, beer, **kwargs):
        super().__init__(*args, **kwargs)
        self.beer = beer
        self.fields["category"].queryset = BeerCategory.objects.filter(is_active=True, deleted_at__isnull=True)
        self.fields["style"].queryset = BeerStyle.objects.filter(is_active=True, deleted_at__isnull=True).select_related("category")
        if not self.is_bound:
            self.initial.update({
                "name": beer.name,
                "brand_name": beer.brand.name if beer.brand else "",
                "brewery_name": beer.brewery.name if beer.brewery else "",
                "origin_country_code": beer.origin_country_code,
                "category": beer.style.category if beer.style else None,
                "style": beer.style,
                "abv": beer.abv,
                "ibu": beer.ibu,
                "plato": beer.plato,
                "mouthfeel_profile": beer.mouthfeel_profile,
                "flavor_tag_input": "、".join(link.tag.name for link in beer.flavor_tag_links.all()),
            })

    def clean(self):
        cleaned_data = super().clean()
        style = cleaned_data.get("style")
        category = cleaned_data.get("category")
        if style and category and style.category_id != category.id:
            self.add_error("style", "请选择属于当前啤酒大类的类型。")
        return cleaned_data

    def save(self):
        data = self.cleaned_data
        self.beer.name = data["name"].strip()
        self.beer.origin_country_code = data["origin_country_code"]
        self.beer.style = data["style"]
        self.beer.abv = data["abv"]
        self.beer.ibu = data["ibu"]
        self.beer.plato = data["plato"]
        self.beer.mouthfeel_profile = data["mouthfeel_profile"]
        self.beer.brand = CreateBeerTastingForm._get_or_create_source(Brand, data["brand_name"], data["origin_country_code"])
        self.beer.brewery = CreateBeerTastingForm._get_or_create_source(Brewery, data["brewery_name"], data["origin_country_code"])
        self.beer.save()
        self.beer.flavor_tag_links.all().delete()
        for tag in CreateBeerTastingForm._get_or_create_flavor_tags(data["flavor_tag_input"]):
            BeerFlavorTag.objects.create(beer=self.beer, tag=tag)
        return self.beer


class TastingEditForm(forms.Form):
    tasted_at = forms.DateTimeField(label="品饮时间", widget=forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"), input_formats=["%Y-%m-%dT%H:%M"])
    drinking_location = forms.CharField(label="饮用地点", max_length=255, required=False)
    price_amount = forms.DecimalField(label="价格", max_digits=12, decimal_places=2, required=False, min_value=Decimal("0"))
    overall_score = forms.DecimalField(label="总评分（0–10，0.5 步进）", max_digits=3, decimal_places=1, required=False, min_value=Decimal("0"), max_value=Decimal("10"))
    notes = forms.CharField(label="品饮笔记", required=False, widget=forms.Textarea)
    food_tags = forms.ModelMultipleChoiceField(label="食物搭配", queryset=TastingTag.objects.none(), required=False, widget=forms.CheckboxSelectMultiple)
    occasion_tags = forms.ModelMultipleChoiceField(label="饮用场景", queryset=TastingTag.objects.none(), required=False, widget=forms.CheckboxSelectMultiple)
    photos = MultipleFileField(label="新增照片（可多选）", required=False, widget=MultipleFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}))

    def __init__(self, *args, tasting=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.tasting = tasting
        self.fields["food_tags"].queryset = TastingTag.objects.filter(category="food_pairing")
        self.fields["occasion_tags"].queryset = TastingTag.objects.filter(category="occasion")
        self.dimensions = list(RatingDimension.objects.filter(is_active=True).order_by("sort_order", "code"))
        existing = {rating.dimension_id: rating for rating in tasting.rating_values.all()} if tasting else {}
        for dimension in self.dimensions:
            field_name = CreateBeerTastingForm._rating_field_name(dimension)
            self.fields[field_name] = forms.DecimalField(label=f"{dimension.name}（{dimension.scale_min}–{dimension.scale_max}）", max_digits=6, decimal_places=3, required=False, min_value=dimension.scale_min, max_value=dimension.scale_max)
            if not self.is_bound and dimension.id in existing:
                self.initial[field_name] = existing[dimension.id].value
        if not self.is_bound and tasting:
            tags = list(tasting.tag_links.values_list("tag_id", "tag__category"))
            self.initial.update({
                "tasted_at": timezone.localtime(tasting.tasted_at).strftime("%Y-%m-%dT%H:%M"),
                "drinking_location": tasting.drinking_location,
                "price_amount": tasting.price_amount,
                "overall_score": tasting.overall_score,
                "notes": tasting.notes,
                "food_tags": [tag_id for tag_id, category in tags if category == "food_pairing"],
                "occasion_tags": [tag_id for tag_id, category in tags if category == "occasion"],
            })
        self.tasting_fields = [self[name] for name in ("tasted_at", "drinking_location", "price_amount", "overall_score", "notes", "food_tags", "occasion_tags", "photos")]
        self.rating_fields = [self[CreateBeerTastingForm._rating_field_name(dimension)] for dimension in self.dimensions]

    def clean(self):
        cleaned_data = super().clean()
        score = cleaned_data.get("overall_score")
        if score is not None and not CreateBeerTastingForm._is_step(score, Decimal("0"), Decimal("0.5")):
            self.add_error("overall_score", "总评分必须以 0.5 为步进。")
        for dimension in self.dimensions:
            field_name = CreateBeerTastingForm._rating_field_name(dimension)
            value = cleaned_data.get(field_name)
            if value is not None and not CreateBeerTastingForm._is_step(value, dimension.scale_min, dimension.step):
                self.add_error(field_name, f"评分必须以 {dimension.step} 为步进。")
        return cleaned_data

    def save(self, beer=None):
        data = self.cleaned_data
        if self.tasting is None:
            if beer is None:
                raise ValueError("创建品饮记录时必须提供啤酒。")
            self.tasting = Tasting(beer=beer)
        self.tasting.tasted_at = data["tasted_at"]
        self.tasting.drinking_location = data["drinking_location"]
        self.tasting.price_amount = data["price_amount"]
        self.tasting.overall_score = data["overall_score"]
        self.tasting.notes = data["notes"]
        self.tasting.save()
        self.tasting.tag_links.all().delete()
        for tag in list(data["food_tags"]) + list(data["occasion_tags"]):
            TastingTagLink.objects.create(tasting=self.tasting, tag=tag)
        for dimension in self.dimensions:
            field_name = CreateBeerTastingForm._rating_field_name(dimension)
            value = data.get(field_name)
            if value is None:
                self.tasting.rating_values.filter(dimension=dimension).delete()
            else:
                TastingRatingValue.objects.update_or_create(
                    tasting=self.tasting,
                    dimension=dimension,
                    defaults={"value": value, "dimension_name_snapshot": dimension.name, "scale_min_snapshot": dimension.scale_min, "scale_max_snapshot": dimension.scale_max, "step_snapshot": dimension.step},
                )
        return self.tasting
