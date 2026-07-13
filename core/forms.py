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
    Tasting,
    TastingRatingValue,
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


def star_score_field(label, choices):
    return forms.TypedChoiceField(
        label=label,
        required=False,
        choices=(("", "未填写"),) + choices,
        coerce=int,
        empty_value=None,
        widget=forms.RadioSelect(attrs={"class": "star-score-input"}),
    )


class BeerSelectionForm(forms.Form):
    beer = forms.ModelChoiceField(
        label="选择啤酒",
        queryset=Beer.objects.none(),
        empty_label=None,
        widget=forms.RadioSelect,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["beer"].queryset = (
            Beer.objects.filter(deleted_at__isnull=True)
            .select_related("style", "style__category")
            .order_by("name", "id")
        )


class DailyTastingForm(forms.Form):
    tasted_at = forms.DateTimeField(
        label="饮用时间",
        widget=forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"),
        input_formats=["%Y-%m-%dT%H:%M"],
        initial=timezone.localtime,
    )
    drinking_location = forms.CharField(label="地点", max_length=255, required=False)
    overall_score = forms.DecimalField(label="总评分（0–10，0.5 步进）", max_digits=3, decimal_places=1, required=False, min_value=Decimal("0"), max_value=Decimal("10"))
    notes = forms.CharField(label="品饮笔记", required=False, widget=forms.Textarea)
    capacity = forms.IntegerField(label="容量（ml）", required=False, min_value=1)
    bottle_count = forms.DecimalField(label="饮用瓶数", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0.01"))
    purchase_channel = forms.ChoiceField(label="购买渠道", required=False, choices=(("", "未填写"),) + Tasting.PURCHASE_CHANNEL_CHOICES)
    photos = MultipleFileField(label="照片（可多选）", required=False, widget=MultipleFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}))

    def clean_overall_score(self):
        score = self.cleaned_data.get("overall_score")
        if score is not None and not CreateBeerTastingForm._is_step(score, Decimal("0"), Decimal("0.5")):
            raise forms.ValidationError("总评分必须以 0.5 为步进。")
        return score

    def save(self, beer):
        return Tasting.objects.create(
            beer=beer,
            tasted_at=self.cleaned_data["tasted_at"],
            drinking_location=self.cleaned_data["drinking_location"],
            overall_score=self.cleaned_data["overall_score"],
            notes=self.cleaned_data["notes"],
            capacity=self.cleaned_data["capacity"],
            bottle_count=self.cleaned_data["bottle_count"],
            purchase_channel=self.cleaned_data["purchase_channel"],
        )


class CreateBeerTastingForm(forms.Form):
    name = forms.CharField(label="啤酒名称", max_length=200)
    brand_name = forms.CharField(label="品牌", max_length=200, required=False)
    brewery_name = forms.CharField(label="酒厂", max_length=200, required=False)
    origin_country_code = forms.ChoiceField(label="国家", choices=COUNTRIES)
    category = forms.ModelChoiceField(label="啤酒大类", queryset=BeerCategory.objects.none(), widget=forms.Select(attrs={"data-category-select": ""}))
    style = forms.ModelChoiceField(label="啤酒类型", queryset=BeerStyle.objects.none(), widget=StyleSelect(attrs={"data-style-select": ""}))
    abv = forms.DecimalField(label="ABV 酒精度（%）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"), max_value=Decimal("100"))
    plato = forms.DecimalField(label="麦汁浓度 Plato（°P）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"))
    mouthfeel_score = star_score_field("口感", Beer.MOUTHFEEL_SCORE_CHOICES)
    bitterness_score = star_score_field("苦度", Beer.BITTERNESS_SCORE_CHOICES)
    flavor_complexity_score = star_score_field("风味复杂度", Beer.FLAVOR_COMPLEXITY_SCORE_CHOICES)
    flavor_tag_input = forms.CharField(label="风味标签", required=False, help_text="用逗号或顿号分隔，例如：柑橘、松脂、焦糖。")
    tasted_at = forms.DateTimeField(label="品饮时间", widget=forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"), input_formats=["%Y-%m-%dT%H:%M"], initial=timezone.localtime)
    drinking_location = forms.CharField(label="饮用地点", max_length=255, required=False)
    price_amount = forms.DecimalField(label="价格", max_digits=12, decimal_places=2, required=False, min_value=Decimal("0"))
    overall_score = forms.DecimalField(label="总评分（0–10，0.5 步进）", max_digits=3, decimal_places=1, required=False, min_value=Decimal("0"), max_value=Decimal("10"))
    notes = forms.CharField(label="品饮笔记", required=False, widget=forms.Textarea)
    photos = MultipleFileField(label="照片（可多选）", required=False, widget=MultipleFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}))

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["category"].queryset = BeerCategory.objects.filter(is_active=True, deleted_at__isnull=True)
        self.fields["style"].queryset = BeerStyle.objects.filter(is_active=True, deleted_at__isnull=True).select_related("category")
        self.beer_fields = [self[name] for name in ("name", "brand_name", "brewery_name", "origin_country_code", "category", "style", "abv", "plato", "mouthfeel_score", "bitterness_score", "flavor_complexity_score", "flavor_tag_input")]
        self.tasting_fields = [self[name] for name in ("tasted_at", "drinking_location", "price_amount", "overall_score", "notes", "photos")]

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
            plato=data["plato"],
            mouthfeel_score=data["mouthfeel_score"],
            bitterness_score=data["bitterness_score"],
            flavor_complexity_score=data["flavor_complexity_score"],
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
        return beer, tasting


class BeerEditForm(forms.Form):
    name = forms.CharField(label="啤酒名称", max_length=200)
    brand_name = forms.CharField(label="品牌", max_length=200, required=False)
    brewery_name = forms.CharField(label="酒厂", max_length=200, required=False)
    origin_country_code = forms.ChoiceField(label="国家", choices=COUNTRIES)
    category = forms.ModelChoiceField(label="啤酒大类", queryset=BeerCategory.objects.none(), widget=forms.Select(attrs={"data-category-select": ""}))
    style = forms.ModelChoiceField(label="啤酒类型", queryset=BeerStyle.objects.none(), widget=StyleSelect(attrs={"data-style-select": ""}))
    abv = forms.DecimalField(label="ABV 酒精度（%）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"), max_value=Decimal("100"))
    plato = forms.DecimalField(label="麦汁浓度 Plato（°P）", max_digits=5, decimal_places=2, required=False, min_value=Decimal("0"))
    mouthfeel_score = star_score_field("口感", Beer.MOUTHFEEL_SCORE_CHOICES)
    bitterness_score = star_score_field("苦度", Beer.BITTERNESS_SCORE_CHOICES)
    flavor_complexity_score = star_score_field("风味复杂度", Beer.FLAVOR_COMPLEXITY_SCORE_CHOICES)
    flavor_tag_input = forms.CharField(label="风味标签", required=False, help_text="用逗号或顿号分隔，例如：柑橘、松脂、焦糖。")
    photos = MultipleFileField(label="新增照片（可多选）", required=False, widget=MultipleFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}))

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
                "plato": beer.plato,
                "mouthfeel_score": beer.mouthfeel_score,
                "bitterness_score": beer.bitterness_score,
                "flavor_complexity_score": beer.flavor_complexity_score,
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
        self.beer.plato = data["plato"]
        self.beer.mouthfeel_score = data["mouthfeel_score"]
        self.beer.bitterness_score = data["bitterness_score"]
        self.beer.flavor_complexity_score = data["flavor_complexity_score"]
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
    photos = MultipleFileField(label="新增照片（可多选）", required=False, widget=MultipleFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}))

    def __init__(self, *args, tasting=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.tasting = tasting
        if not self.is_bound and tasting:
            self.initial.update({
                "tasted_at": timezone.localtime(tasting.tasted_at).strftime("%Y-%m-%dT%H:%M"),
                "drinking_location": tasting.drinking_location,
                "price_amount": tasting.price_amount,
                "overall_score": tasting.overall_score,
                "notes": tasting.notes,
            })
        self.tasting_fields = [self[name] for name in ("tasted_at", "drinking_location", "price_amount", "overall_score", "notes", "photos")]

    def clean(self):
        cleaned_data = super().clean()
        score = cleaned_data.get("overall_score")
        if score is not None and not CreateBeerTastingForm._is_step(score, Decimal("0"), Decimal("0.5")):
            self.add_error("overall_score", "总评分必须以 0.5 为步进。")
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
        return self.tasting
