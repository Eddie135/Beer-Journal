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
    TastingTag,
    TastingTagLink,
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


class PublicWorkflowTests(TestCase):
    def setUp(self):
        self.style = BeerStyle.objects.create(name="IPA", normalized_name="public-ipa")
        self.flavor = FlavorTag.objects.create(name="柑橘", normalized_name="public-柑橘", category="水果")
        self.food = TastingTag.objects.create(name="烧烤", normalized_name="public-烧烤", category="food_pairing")
        self.occasion = TastingTag.objects.create(name="独饮", normalized_name="public-独饮", category="occasion")
        self.dimension = RatingDimension.objects.create(code="public_aroma", name="香气", sort_order=1)

    def _valid_payload(self):
        return {
            "name": "用户流程 IPA",
            "brand_name": "测试品牌",
            "brewery_name": "测试酒厂",
            "origin_country_code": "DE",
            "style": str(self.style.id),
            "abv": "6.50",
            "ibu": "45.00",
            "flavor_tags": [str(self.flavor.id)],
            "tasted_at": "2026-07-15T20:30",
            "drinking_location": "家中",
            "price_amount": "22.00",
            "overall_score": "8.5",
            "notes": "第一次真实流程测试。",
            "food_tags": [str(self.food.id)],
            "occasion_tags": [str(self.occasion.id)],
            f"rating_{self.dimension.id}": "8.0",
        }

    def test_create_page_creates_beer_and_first_tasting_together(self):
        response = self.client.post("/beers/add/", self._valid_payload())
        self.assertEqual(response.status_code, 302)
        beer = Beer.objects.get(name="用户流程 IPA")
        tasting = beer.tastings.get()
        self.assertEqual(beer.origin_country_code, "DE")
        self.assertEqual(beer.flavor_tag_links.count(), 1)
        self.assertEqual(tasting.rating_values.get().dimension_name_snapshot, "香气")
        self.assertEqual(tasting.tag_links.count(), 2)

    def test_invalid_first_tasting_does_not_create_beer(self):
        payload = self._valid_payload()
        payload["overall_score"] = "8.3"
        response = self.client.post("/beers/add/", payload)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "总评分必须以 0.5 为步进。")
        self.assertFalse(Beer.objects.filter(name="用户流程 IPA").exists())

    def test_list_and_detail_pages_show_created_records(self):
        beer = Beer.objects.create(name="列表测试啤酒", style=self.style, origin_country_code="CN")
        tasting = Tasting.objects.create(
            beer=beer,
            tasted_at=timezone.make_aware(datetime(2026, 7, 15, 20, 30)),
            overall_score=Decimal("8.0"),
        )
        TastingTagLink.objects.create(tasting=tasting, tag=self.food)
        BeerFlavorTag.objects.create(beer=beer, tag=self.flavor)
        list_response = self.client.get("/beers/")
        self.assertEqual(list_response.status_code, 200)
        self.assertContains(list_response, "列表测试啤酒")
        self.assertContains(list_response, "8.0")
        beer_response = self.client.get(f"/beers/{beer.id}/")
        self.assertEqual(beer_response.status_code, 200)
        self.assertContains(beer_response, "柑橘")
        tasting_response = self.client.get(f"/tastings/{tasting.id}/")
        self.assertEqual(tasting_response.status_code, 200)
        self.assertContains(tasting_response, "烧烤")
