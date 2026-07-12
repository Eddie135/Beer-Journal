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


class AdminWorkflowTests(TestCase):
    def setUp(self):
        self.admin_user = self._create_admin_user()
        self.client.force_login(self.admin_user)
        self.style = BeerStyle.objects.create(name="Lager", normalized_name="lager")
        self.dimension = RatingDimension.objects.create(code="aroma_admin", name="香气")

    def _create_admin_user(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_superuser(
            username="admin",
            email="admin@example.invalid",
            password="test-only-password",
        )

    def test_beer_admin_list_search_and_add_page(self):
        beer = Beer.objects.create(name="Admin Test Lager", style=self.style)
        listing = self.client.get("/admin/core/beer/", {"q": "Admin Test"})
        self.assertEqual(listing.status_code, 200)
        self.assertContains(listing, beer.name)
        add_page = self.client.get("/admin/core/beer/add/")
        self.assertEqual(add_page.status_code, 200)
        self.assertContains(add_page, "基本资料")

    def test_admin_can_create_beer_and_tasting_workflow(self):
        beer_response = self.client.post(
            "/admin/core/beer/add/",
            {
                "name": "Admin Workflow IPA",
                "style": str(self.style.pk),
                "brand": "",
                "brewery": "",
                "origin_country_code": "DE",
                "origin_region": "Bavaria",
                "abv": "6.50",
                "ibu": "45.00",
                "color_ebc": "12.00",
                "catalog_notes": "Admin 录入测试。",
                "deleted_at": "",
                "flavor_tag_links-TOTAL_FORMS": "0",
                "flavor_tag_links-INITIAL_FORMS": "0",
                "flavor_tag_links-MIN_NUM_FORMS": "0",
                "flavor_tag_links-MAX_NUM_FORMS": "1000",
                "_save": "保存",
            },
        )
        self.assertEqual(beer_response.status_code, 302)
        beer = Beer.objects.get(name="Admin Workflow IPA")

        tasting_response = self.client.post(
            "/admin/core/tasting/add/",
            {
                "beer": str(beer.pk),
                "tasted_at_0": "2026-07-14",
                "tasted_at_1": "20:00:00",
                "drinking_location": "家中",
                "volume_ml": "500",
                "price_amount": "20.00",
                "currency_code": "CNY",
                "purchase_channel": "超市",
                "purchase_location": "测试超市",
                "notes": "第一次 Admin 流程录入。",
                "overall_score": "8.0",
                "deleted_at": "",
                "photos-TOTAL_FORMS": "0",
                "photos-INITIAL_FORMS": "0",
                "photos-MIN_NUM_FORMS": "0",
                "photos-MAX_NUM_FORMS": "1000",
                "rating_values-TOTAL_FORMS": "1",
                "rating_values-INITIAL_FORMS": "0",
                "rating_values-MIN_NUM_FORMS": "0",
                "rating_values-MAX_NUM_FORMS": "1000",
                "rating_values-0-dimension": str(self.dimension.pk),
                "rating_values-0-value": "8.0",
                "tag_links-TOTAL_FORMS": "0",
                "tag_links-INITIAL_FORMS": "0",
                "tag_links-MIN_NUM_FORMS": "0",
                "tag_links-MAX_NUM_FORMS": "1000",
                "_save": "保存",
            },
        )
        if tasting_response.status_code != 302:
            errors = [tasting_response.context["adminform"].errors.as_text()]
            errors.extend(str(formset.formset.errors) for formset in tasting_response.context["inline_admin_formsets"])
            self.fail("Admin tasting form did not save: " + " | ".join(errors))
        tasting = Tasting.objects.get(beer=beer)
        self.assertEqual(Tasting.objects.filter(beer=beer).count(), 1)
        rating = tasting.rating_values.get()
        self.assertEqual(rating.dimension_name_snapshot, "香气")
        self.assertEqual(rating.scale_max_snapshot, Decimal("10.000"))
