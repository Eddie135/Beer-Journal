from datetime import datetime
from decimal import Decimal

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from .models import (
    Beer,
    BeerFlavorTag,
    BeerStyle,
    FlavorTag,
    RatingDimension,
    Tasting,
    TastingRatingValue,
)

class HealthPageTests(SimpleTestCase):
    def test_home_page(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "BEER JOURNAL 运行正常")

    def test_health_endpoint(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content, {"status": "ok", "service": "beer-journal"})


class CoreModelTests(TestCase):
    def setUp(self):
        self.style = BeerStyle.objects.create(name="IPA", normalized_name="ipa")
        self.beer = Beer.objects.create(
            name="测试 IPA",
            style=self.style,
            abv=Decimal("6.50"),
            ibu=Decimal("45.00"),
            color_ebc=Decimal("12.00"),
        )

    def test_create_beer(self):
        self.assertEqual(Beer.objects.count(), 1)
        self.assertEqual(self.beer.style, self.style)
        self.assertEqual(self.beer.abv, Decimal("6.50"))

    def test_create_tasting_is_independent(self):
        tasting = Tasting.objects.create(
            beer=self.beer,
            tasted_at=timezone.make_aware(datetime(2026, 7, 12, 20, 30)),
            drinking_location="家中",
            price_amount=Decimal("18.00"),
            overall_score=Decimal("8.5"),
            notes="柑橘和松脂。",
        )
        second = Tasting.objects.create(
            beer=self.beer,
            tasted_at=timezone.make_aware(datetime(2026, 7, 13, 20, 30)),
        )
        self.assertEqual(self.beer.tastings.count(), 2)
        self.assertNotEqual(tasting.id, second.id)
        self.assertEqual(tasting.overall_score, Decimal("8.5"))

    def test_flavor_tag_relation(self):
        tag = FlavorTag.objects.create(name="柑橘", normalized_name="柑橘", category="水果")
        link = BeerFlavorTag.objects.create(beer=self.beer, tag=tag)
        self.assertEqual(self.beer.flavor_tag_links.get(), link)
        self.assertEqual(tag.beer_links.get(), link)

    def test_rating_dimension_relation_keeps_snapshot(self):
        tasting = Tasting.objects.create(
            beer=self.beer,
            tasted_at=timezone.make_aware(datetime(2026, 7, 12, 20, 30)),
        )
        dimension = RatingDimension.objects.create(code="aroma", name="香气")
        rating = TastingRatingValue.objects.create(
            tasting=tasting,
            dimension=dimension,
            value=Decimal("8.0"),
            dimension_name_snapshot="香气",
            scale_min_snapshot=Decimal("0"),
            scale_max_snapshot=Decimal("10"),
            step_snapshot=Decimal("0.5"),
        )
        dimension.name = "香气（已改名）"
        dimension.save(update_fields=["name", "updated_at"])
        rating.refresh_from_db()
        self.assertEqual(rating.dimension.name, "香气（已改名）")
        self.assertEqual(rating.dimension_name_snapshot, "香气")
