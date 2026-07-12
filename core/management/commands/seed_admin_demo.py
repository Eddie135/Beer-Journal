from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import (
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


class Command(BaseCommand):
    help = "创建用于 Django Admin 验证的个人啤酒演示数据。"

    def handle(self, *args, **options):
        styles = {}
        for name, normalized in (("Lager", "lager"), ("IPA", "ipa"), ("小麦啤酒", "wheat")):
            styles[normalized], _ = BeerStyle.objects.get_or_create(
                normalized_name=normalized,
                defaults={"name": name},
            )

        sources = [
            ("青岛啤酒", "青岛啤酒股份有限公司", "CN", "山东"),
            ("Weihenstephaner", "Bayerische Staatsbrauerei Weihenstephan", "DE", "Bavaria"),
            ("Sierra Nevada", "Sierra Nevada Brewing Co.", "US", "California"),
        ]
        beers = []
        for name, brewery_name, country, region in sources:
            brand, _ = Brand.objects.get_or_create(
                normalized_name=name.lower(),
                country_code=country,
                region=region,
                defaults={"name": name},
            )
            brewery, _ = Brewery.objects.get_or_create(
                normalized_name=brewery_name.lower(),
                country_code=country,
                region=region,
                defaults={"name": brewery_name},
            )
            beer, _ = Beer.objects.get_or_create(
                name={"CN": "青岛经典", "DE": "Weihenstephaner Hefeweissbier", "US": "Sierra Nevada Pale Ale"}[country],
                defaults={
                    "brand": brand,
                    "brewery": brewery,
                    "origin_country_code": country,
                    "origin_region": region,
                    "style": styles[{"CN": "lager", "DE": "wheat", "US": "ipa"}[country]],
                    "abv": {"CN": Decimal("4.70"), "DE": Decimal("5.30"), "US": Decimal("5.60")}[country],
                    "ibu": {"CN": Decimal("10.00"), "DE": Decimal("14.00"), "US": Decimal("38.00")}[country],
                    "color_ebc": {"CN": Decimal("6.00"), "DE": Decimal("8.00"), "US": Decimal("18.00")}[country],
                    "catalog_notes": "Django Admin 阶段 3 演示数据。",
                },
            )
            beers.append(beer)

        flavor_specs = (("柑橘", "水果"), ("香蕉", "水果"), ("松脂", "树脂"), ("面包麦芽", "麦芽"))
        flavors = {}
        for name, category in flavor_specs:
            flavors[name], _ = FlavorTag.objects.get_or_create(
                normalized_name=name.lower(),
                defaults={"name": name, "category": category},
            )
        BeerFlavorTag.objects.get_or_create(beer=beers[0], tag=flavors["面包麦芽"])
        BeerFlavorTag.objects.get_or_create(beer=beers[1], tag=flavors["香蕉"])
        BeerFlavorTag.objects.get_or_create(beer=beers[2], tag=flavors["柑橘"])
        BeerFlavorTag.objects.get_or_create(beer=beers[2], tag=flavors["松脂"])

        dimension_specs = (("aroma", "香气"), ("flavor", "味道"), ("mouthfeel", "口感"))
        dimensions = {}
        for code, name in dimension_specs:
            dimensions[code], _ = RatingDimension.objects.get_or_create(code=code, defaults={"name": name})

        tag_specs = (("烧烤", "food_pairing"), ("海鲜", "food_pairing"), ("聚会", "occasion"), ("独饮", "occasion"))
        tasting_tags = {}
        for name, category in tag_specs:
            tasting_tags[name], _ = TastingTag.objects.get_or_create(
                normalized_name=name.lower(),
                defaults={"name": name, "category": category},
            )

        tasting_specs = (
            (beers[2], datetime(2026, 7, 10, 19, 30), Decimal("7.5"), "聚会", "烧烤"),
            (beers[2], datetime(2026, 7, 12, 20, 0), Decimal("8.5"), "独饮", "海鲜"),
            (beers[1], datetime(2026, 7, 11, 18, 30), Decimal("8.0"), "聚会", "海鲜"),
        )
        for beer, tasted_at, score, occasion, food in tasting_specs:
            tasting, _ = Tasting.objects.get_or_create(
                beer=beer,
                tasted_at=timezone.make_aware(tasted_at),
                defaults={
                    "drinking_location": "家中",
                    "volume_ml": 500,
                    "price_amount": Decimal("22.00"),
                    "currency_code": "CNY",
                    "purchase_channel": "超市",
                    "notes": "Admin 演示品饮记录。",
                    "overall_score": score,
                },
            )
            TastingTagLink.objects.get_or_create(tasting=tasting, tag=tasting_tags[occasion])
            TastingTagLink.objects.get_or_create(tasting=tasting, tag=tasting_tags[food])
            for code, value in (("aroma", score), ("flavor", score - Decimal("0.5")), ("mouthfeel", score - Decimal("1.0"))):
                dimension = dimensions[code]
                TastingRatingValue.objects.get_or_create(
                    tasting=tasting,
                    dimension=dimension,
                    defaults={
                        "value": value,
                        "dimension_name_snapshot": dimension.name,
                        "scale_min_snapshot": dimension.scale_min,
                        "scale_max_snapshot": dimension.scale_max,
                        "step_snapshot": dimension.step,
                    },
                )

        self.stdout.write(self.style.SUCCESS("已创建/确认 Django Admin 演示数据：3 款啤酒、3 种类型、4 个风味标签、3 次品饮记录。"))
