from datetime import datetime, timedelta
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.test.utils import override_settings
from django.utils import timezone
from PIL import Image

from config.settings import parse_allowed_hosts

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

class HealthPageTests(TestCase):
    def test_allowed_hosts_parser_accepts_lan_ip_without_wildcard(self):
        hosts = parse_allowed_hosts("localhost, 127.0.0.1, 192.168.31.101, ")
        self.assertEqual(hosts, ["localhost", "127.0.0.1", "192.168.31.101"])
        self.assertNotIn("*", hosts)

    def test_home_page(self):
        response = self.client.get("/")
        self.assertRedirects(response, "/beers/", fetch_redirect_response=False)

    def test_app_tabs_are_available(self):
        for url in ("/beers/", "/tastings/", "/personal/"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            self.assertContains(response, "bottom-tab-bar")

    def test_mobile_design_system_has_safe_bottom_navigation_rules(self):
        stylesheet = (Path(__file__).parent / "static" / "css" / "app.css").read_text(encoding="utf-8")
        self.assertIn("--bg: #f7f7f5", stylesheet)
        self.assertIn("--accent: #f4a340", stylesheet)
        self.assertIn("--radius-card: 24px", stylesheet)
        self.assertIn("--shadow-card: 0 8px 30px rgba(0, 0, 0, .06)", stylesheet)
        self.assertIn("--motion-fast: 150ms", stylesheet)
        self.assertIn("--motion-slow: 300ms", stylesheet)
        self.assertIn("bottom-tab-bar", stylesheet)
        self.assertIn("safe-area-inset-bottom", stylesheet)
        self.assertIn("164px", stylesheet)
        self.assertIn("height: 52px", stylesheet)
        self.assertIn("min-height: 52px", stylesheet)
        self.assertIn("@media (prefers-reduced-motion: reduce)", stylesheet)

    def test_base_template_uses_versioned_v3_collection_card_assets(self):
        response = self.client.get("/beers/")
        self.assertContains(response, "css/app.css?v=20260712-v3b2")
        self.assertContains(response, "js/app.js?v=20260712-v3b2")

    def test_floating_add_buttons_only_appear_on_collection_and_tasting_lists(self):
        self.assertContains(self.client.get("/beers/"), "floating-add-button")
        self.assertContains(self.client.get("/tastings/"), "floating-add-button")
        self.assertNotContains(self.client.get("/personal/"), "floating-add-button")
        self.assertNotContains(self.client.get("/personal/"), 'aria-label="添加啤酒"')
        template_root = Path(__file__).parent.parent / "templates"
        for name in ("beer_detail.html", "beer_edit.html", "tasting_detail.html", "tasting_edit.html"):
            self.assertNotIn("floating-add-button", (template_root / name).read_text(encoding="utf-8"))

    def test_collection_filter_sheet_and_fab_have_mobile_interaction_hooks(self):
        response = self.client.get("/beers/")
        self.assertContains(response, "data-filter-open")
        self.assertContains(response, "data-filter-sheet")
        self.assertContains(response, "data-filter-overlay")
        self.assertNotContains(response, '<details class="filter-sheet"')
        stylesheet = (Path(__file__).parent / "static" / "css" / "app.css").read_text(encoding="utf-8")
        script = (Path(__file__).parent / "static" / "js" / "app.js").read_text(encoding="utf-8")
        self.assertIn("position: fixed", stylesheet)
        self.assertIn("body.filter-sheet-open .bottom-tab-bar", stylesheet)
        self.assertIn("collection-placeholder { min-height: 132px", stylesheet)
        self.assertIn("data-filter-sheet", script)

    def test_health_endpoint(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content, {"status": "ok", "service": "beer-journal"})


class CoreModelTests(TestCase):
    def setUp(self):
        self.category, _ = BeerCategory.objects.get_or_create(code="ale", defaults={"name": "艾尔", "normalized_name": "艾尔"})
        self.style = BeerStyle.objects.create(name="IPA", normalized_name="test-ipa", category=self.category)
        self.beer = Beer.objects.create(
            name="测试 IPA",
            style=self.style,
            abv=Decimal("6.50"),
            ibu=Decimal("45.00"),
            color_ebc=Decimal("12.00"),
            plato=Decimal("15.00"),
            mouthfeel_profile="balanced",
        )

    def test_create_beer(self):
        self.assertEqual(Beer.objects.count(), 1)
        self.assertEqual(self.beer.style, self.style)
        self.assertEqual(self.beer.abv, Decimal("6.50"))
        self.assertEqual(self.beer.plato, Decimal("15.00"))
        self.assertEqual(self.beer.mouthfeel_profile, "balanced")

    def test_v2_categories_and_tasting_fields(self):
        tasting = Tasting.objects.create(
            beer=self.beer,
            tasted_at=timezone.make_aware(datetime(2026, 7, 12, 20, 30)),
            capacity=500,
            bottle_count=Decimal("1.00"),
            purchase_channel="online",
        )
        self.assertEqual(self.beer.style.category.code, "ale")
        self.assertEqual(tasting.capacity, 500)
        self.assertEqual(tasting.bottle_count, Decimal("1.00"))
        self.assertEqual(tasting.purchase_channel, "online")
        self.assertEqual(BeerCategory.objects.get(code="lager").name, "拉格")
        self.assertEqual(BeerCategory.objects.get(code="ale").name, "艾尔")
        self.assertTrue(BeerStyle.objects.filter(normalized_name__in=["pilsner", "pale_lager", "dark_lager", "ipa", "wheat", "stout"]).count() >= 6)
        self.assertEqual(BeerStyle.objects.get(normalized_name="ipa").category.code, "ale")
        self.assertFalse(BeerStyle.objects.filter(name__iexact="Lager").exists())

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

    def test_flavor_tag_normalization_and_unique_constraint(self):
        self.assertEqual(FlavorTag.normalize_name("  Citrus  "), "citrus")
        FlavorTag.objects.create(name="Citrus", normalized_name="citrus", category="水果")
        with self.assertRaises(IntegrityError):
            FlavorTag.objects.create(name="cItRuS", normalized_name="citrus", category="水果")

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
        self.category = BeerCategory.objects.create(name="拉格测试", normalized_name="admin-lager", code="admin-lager")
        self.style = BeerStyle.objects.create(name="淡色拉格", normalized_name="admin-pale-lager", category=self.category)

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
                "category": str(self.category.pk),
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
                "capacity": "500",
                "price_amount": "20.00",
                "currency_code": "CNY",
                "purchase_channel": "offline",
                "purchase_location": "测试超市",
                "notes": "第一次 Admin 流程录入。",
                "overall_score": "8.0",
                "deleted_at": "",
                "photos-TOTAL_FORMS": "0",
                "photos-INITIAL_FORMS": "0",
                "photos-MIN_NUM_FORMS": "0",
                "photos-MAX_NUM_FORMS": "1000",
                "_save": "保存",
            },
        )
        if tasting_response.status_code != 302:
            errors = [tasting_response.context["adminform"].errors.as_text()]
            errors.extend(str(formset.formset.errors) for formset in tasting_response.context["inline_admin_formsets"])
            self.fail("Admin tasting form did not save: " + " | ".join(errors))
        tasting = Tasting.objects.get(beer=beer)
        self.assertEqual(Tasting.objects.filter(beer=beer).count(), 1)
        self.assertFalse(tasting.rating_values.exists())


class PublicWorkflowTests(TransactionTestCase):
    def setUp(self):
        self.category = BeerCategory.objects.create(name="艾尔", normalized_name="public-ale", code="public-ale")
        self.style = BeerStyle.objects.create(name="IPA", normalized_name="public-ipa", category=self.category)
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
            "category": str(self.category.id),
            "style": str(self.style.id),
            "abv": "6.50",
            "ibu": "45.00",
            "plato": "14.50",
            "mouthfeel_profile": "balanced",
            "flavor_tag_input": "柑橘、松脂",
            "tasted_at": "2026-07-15T20:30",
            "drinking_location": "家中",
            "price_amount": "22.00",
            "overall_score": "8.5",
            "notes": "第一次真实流程测试。",
        }

    def test_create_page_creates_beer_and_first_tasting_together(self):
        response = self.client.post("/beers/add/", self._valid_payload())
        self.assertEqual(response.status_code, 302)
        beer = Beer.objects.get(name="用户流程 IPA")
        tasting = beer.tastings.get()
        self.assertEqual(beer.origin_country_code, "DE")
        self.assertEqual(beer.plato, Decimal("14.50"))
        self.assertEqual(beer.mouthfeel_profile, "balanced")
        self.assertEqual(beer.flavor_tag_links.count(), 2)
        self.assertFalse(tasting.rating_values.exists())
        self.assertFalse(tasting.tag_links.exists())

    def test_beer_form_uses_chinese_countries_and_category_matched_styles(self):
        response = self.client.get("/beers/add/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "德国")
        self.assertContains(response, 'data-category-select')
        self.assertContains(response, 'data-style-select')
        self.assertNotContains(response, "多维评分")
        self.assertNotContains(response, "食物搭配")
        self.assertNotContains(response, "饮用场景")

        lager_category = BeerCategory.objects.create(name="拉格", normalized_name="public-lager", code="public-lager")
        lager_style = BeerStyle.objects.create(name="皮尔森", normalized_name="public-pilsner", category=lager_category)
        payload = self._valid_payload()
        payload["style"] = str(lager_style.id)
        response = self.client.post("/beers/add/", payload)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "请选择属于当前啤酒大类的类型。")
        self.assertFalse(Beer.objects.filter(name="用户流程 IPA").exists())

    def test_custom_flavor_tags_are_normalized_and_reused(self):
        payload = self._valid_payload()
        payload["flavor_tag_input"] = "  Citrus、柑橘，cItRuS "
        response = self.client.post("/beers/add/", payload)
        self.assertEqual(response.status_code, 302)
        beer = Beer.objects.get(name="用户流程 IPA")
        self.assertEqual(
            set(beer.flavor_tag_links.values_list("tag__normalized_name", flat=True)),
            {"citrus", "柑橘"},
        )
        self.assertEqual(FlavorTag.objects.filter(normalized_name="citrus").count(), 1)

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
        self.assertContains(list_response, "🇨🇳")
        self.assertContains(list_response, "中国")
        beer_response = self.client.get(f"/beers/{beer.id}/")
        self.assertEqual(beer_response.status_code, 200)
        self.assertContains(beer_response, "柑橘")
        tasting_response = self.client.get(f"/tastings/{tasting.id}/")
        self.assertEqual(tasting_response.status_code, 200)
        self.assertNotContains(tasting_response, "烧烤")
        self.assertNotContains(tasting_response, "多维评分")
        self.assertNotContains(tasting_response, "搭配与场景")

    def test_collection_search_filters_and_sorting_use_active_tastings(self):
        lager_category = BeerCategory.objects.create(name="拉格", normalized_name="collection-lager", code="collection-lager")
        lager_style = BeerStyle.objects.create(name="皮尔森", normalized_name="collection-pilsner", category=lager_category)
        brand = Brand.objects.create(name="收藏品牌", normalized_name="collection-brand", country_code="DE", region="")
        brewery = Brewery.objects.create(name="收藏酒厂", normalized_name="collection-brewery", country_code="DE", region="")
        citrus = FlavorTag.objects.create(name="柑橘收藏", normalized_name="collection-citrus", category="自定义")
        pine = FlavorTag.objects.create(name="松脂收藏", normalized_name="collection-pine", category="自定义")
        newest = Beer.objects.create(name="最新 IPA", brand=brand, brewery=brewery, style=self.style, origin_country_code="DE", mouthfeel_profile="crisp")
        highest = Beer.objects.create(name="最高 皮尔森", style=lager_style, origin_country_code="CN", mouthfeel_profile="full")
        no_tasting = Beer.objects.create(name="未品饮 小麦", style=self.style, origin_country_code="BE", mouthfeel_profile="balanced")
        BeerFlavorTag.objects.create(beer=newest, tag=citrus)
        BeerFlavorTag.objects.create(beer=highest, tag=pine)
        Tasting.objects.create(beer=newest, tasted_at=timezone.make_aware(datetime(2026, 7, 18, 20, 30)), overall_score=Decimal("7.5"))
        Tasting.objects.create(beer=newest, tasted_at=timezone.make_aware(datetime(2026, 7, 14, 20, 30)), overall_score=Decimal("8.5"))
        Tasting.objects.create(beer=highest, tasted_at=timezone.make_aware(datetime(2026, 7, 16, 20, 30)), overall_score=Decimal("9.5"))
        deleted = Tasting.objects.create(beer=highest, tasted_at=timezone.make_aware(datetime(2026, 7, 19, 20, 30)), overall_score=Decimal("10.0"))
        deleted.deleted_at = timezone.now()
        deleted.save(update_fields=["deleted_at", "updated_at"])

        response = self.client.get("/beers/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, newest.name)
        self.assertContains(response, no_tasting.name)
        content = response.content.decode()
        self.assertLess(content.index(newest.name), content.index(highest.name))
        self.assertLess(content.index(highest.name), content.index(no_tasting.name))
        self.assertIn('<div class="collection-rating"><span class="rating-star" aria-hidden="true">★</span><strong>8.0</strong>', content)
        self.assertIn("2 次品饮", content)

        for query, expected, excluded in (
            ({"q": "收藏酒厂"}, newest.name, highest.name),
            ({"q": "德国"}, newest.name, highest.name),
            ({"category": str(lager_category.id)}, highest.name, newest.name),
            ({"style": str(self.style.id)}, newest.name, highest.name),
            ({"country": "BE"}, no_tasting.name, newest.name),
            ({"mouthfeel": "full"}, highest.name, newest.name),
            ({"tag": str(citrus.id)}, newest.name, highest.name),
            ({"min_score": "9.0"}, highest.name, newest.name),
        ):
            filtered = self.client.get("/beers/", query)
            self.assertContains(filtered, expected)
            self.assertNotContains(filtered, excluded)

        by_score = self.client.get("/beers/", {"sort": "score"}).content.decode()
        self.assertLess(by_score.index(highest.name), by_score.index(newest.name))
        by_count = self.client.get("/beers/", {"sort": "count"}).content.decode()
        self.assertLess(by_count.index(newest.name), by_count.index(highest.name))

    def test_collection_home_shows_global_overview_and_read_only_visual_states(self):
        now = timezone.now()
        recent_high = Beer.objects.create(name="近期高分收藏", style=self.style, origin_country_code="DE")
        older = Beer.objects.create(name="较早收藏", style=self.style, origin_country_code="CN")
        Beer.objects.filter(id=older.id).update(created_at=now - timedelta(days=31))
        Tasting.objects.create(beer=recent_high, tasted_at=now - timedelta(days=1), overall_score=Decimal("9.0"))
        Tasting.objects.create(beer=older, tasted_at=now - timedelta(days=40), overall_score=Decimal("7.0"))

        response = self.client.get("/beers/", {"q": "近期"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["collection_stats"]["beer_count"], 2)
        self.assertEqual(response.context["collection_stats"]["tasting_count"], 2)
        self.assertEqual(response.context["collection_stats"]["average_score"], Decimal("8.0"))
        self.assertContains(response, "款收藏")
        self.assertContains(response, "次品饮")
        self.assertContains(response, "最近品饮")
        self.assertContains(response, "高评分")
        self.assertContains(response, "新收藏")
        self.assertNotContains(response, older.name)

    def test_collection_card_prioritizes_rating_and_limits_flavor_tags(self):
        beer = Beer.objects.create(name="精修卡片啤酒", style=self.style, origin_country_code="DE")
        Tasting.objects.create(beer=beer, tasted_at=timezone.now(), overall_score=Decimal("8.5"))
        tags = [
            FlavorTag.objects.create(name=f"标签{i}", normalized_name=f"card-tag-{i}", category=category)
            for i, category in enumerate(("水果", "麦芽", "酒花", "烘烤"), start=1)
        ]
        for tag in tags:
            BeerFlavorTag.objects.create(beer=beer, tag=tag)

        response = self.client.get("/beers/")
        content = response.content.decode()
        collection_html = content.split('<section class="collection-grid">', 1)[1].split('</section>', 1)[0]
        self.assertContains(response, 'class="collection-rating"')
        self.assertContains(response, 'class="collection-tasting-count"')
        self.assertEqual(collection_html.count("tag-pill"), 3)
        self.assertIn("标签1", collection_html)
        self.assertIn("标签3", collection_html)
        self.assertNotIn("标签4", collection_html)

    def test_personal_data_statistics_exclude_deleted_records_and_sort_recent_tastings(self):
        citrus = FlavorTag.objects.create(name="数据柑橘", normalized_name="insight-citrus", category="自定义")
        first_beer = Beer.objects.create(name="数据啤酒一", style=self.style, origin_country_code="DE", abv=Decimal("6.0"), plato=Decimal("12.0"))
        second_beer = Beer.objects.create(name="数据啤酒二", style=self.style, origin_country_code="DE", abv=Decimal("8.0"), plato=Decimal("14.0"))
        deleted_beer = Beer.objects.create(name="已删除数据啤酒", style=self.style, origin_country_code="DE", abv=Decimal("20.0"), plato=Decimal("30.0"))
        BeerFlavorTag.objects.create(beer=first_beer, tag=citrus)
        BeerFlavorTag.objects.create(beer=second_beer, tag=citrus)
        now = timezone.now()
        older = Tasting.objects.create(beer=first_beer, tasted_at=now - timedelta(days=3), overall_score=Decimal("8.0"), price_amount=Decimal("20.0"))
        newer = Tasting.objects.create(beer=second_beer, tasted_at=now - timedelta(days=1), overall_score=Decimal("6.0"), price_amount=Decimal("40.0"))
        deleted_tasting = Tasting.objects.create(beer=second_beer, tasted_at=now, overall_score=Decimal("10.0"), price_amount=Decimal("100.0"))
        deleted_tasting.deleted_at = now
        deleted_tasting.save(update_fields=["deleted_at", "updated_at"])
        Tasting.objects.create(beer=deleted_beer, tasted_at=now, overall_score=Decimal("10.0"), price_amount=Decimal("100.0"))
        deleted_beer.deleted_at = now
        deleted_beer.save(update_fields=["deleted_at", "updated_at"])

        response = self.client.get("/personal/")
        self.assertEqual(response.status_code, 200)
        stats = response.context["core_stats"]
        self.assertEqual(stats["beer_count"], 2)
        self.assertEqual(stats["tasting_count"], 2)
        self.assertEqual(stats["average_score"], Decimal("7.0"))
        self.assertEqual(stats["average_abv"], Decimal("7.0"))
        self.assertEqual(stats["average_plato"], Decimal("13.0"))
        self.assertEqual(stats["average_price"], Decimal("30.0"))
        self.assertEqual(response.context["preferences"]["flavor_tag"]["name"], "数据柑橘")
        self.assertEqual([item["tasting_count"] for item in response.context["monthly_trends"]][-1], 2)
        content = response.content.decode()
        self.assertContains(response, "数据柑橘")
        self.assertNotContains(response, deleted_beer.name)
        self.assertLess(content.index(newer.beer.name), content.index(older.beer.name))
        self.assertEqual(content.count('class="trend-row"'), 12)

    def test_tasting_timeline_and_beer_selection_search_are_available(self):
        beer = Beer.objects.create(name="搜索用 IPA", style=self.style, origin_country_code="DE")
        tasting = Tasting.objects.create(
            beer=beer,
            tasted_at=timezone.make_aware(datetime(2026, 7, 15, 20, 30)),
            capacity=500,
            bottle_count=Decimal("1.00"),
            overall_score=Decimal("8.0"),
            notes="柑橘与松脂的余味很干净。",
        )
        list_response = self.client.get("/tastings/")
        self.assertContains(list_response, "搜索用 IPA")
        self.assertContains(list_response, "500 ml")
        self.assertContains(list_response, "1.00 瓶")
        self.assertContains(list_response, 'href="/tastings/add/"')

        selection_response = self.client.get("/tastings/add/")
        self.assertEqual(selection_response.status_code, 200)
        self.assertContains(selection_response, "data-beer-search")
        self.assertContains(selection_response, beer.name)
        response = self.client.post("/tastings/add/", {"beer": str(beer.id)})
        self.assertRedirects(response, f"/beers/{beer.id}/tastings/add/", fetch_redirect_response=False)
        self.assertEqual(Tasting.objects.filter(id=tasting.id).count(), 1)

    def test_daily_tasting_creates_for_existing_beer_with_photo(self):
        beer = Beer.objects.create(name="日常记录啤酒", style=self.style, origin_country_code="CN")
        form_response = self.client.get(f"/beers/{beer.id}/tastings/add/")
        self.assertEqual(form_response.status_code, 200)
        self.assertNotContains(form_response, 'name="food_tags"')
        self.assertNotContains(form_response, 'name="occasion_tags"')
        self.assertNotContains(form_response, 'name="rating_')
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            response = self.client.post(
                f"/beers/{beer.id}/tastings/add/",
                {
                    "tasted_at": "2026-07-16T20:30",
                    "drinking_location": "家中",
                    "overall_score": "8.5",
                    "notes": "晚餐后的轻松一杯。",
                    "capacity": "330",
                    "bottle_count": "1.00",
                    "purchase_channel": "online",
                    "photos": [self._image_upload("daily.png")],
                },
            )
            self.assertEqual(response.status_code, 302)
            tasting = beer.tastings.get()
            self.assertEqual(tasting.capacity, 330)
            self.assertEqual(tasting.bottle_count, Decimal("1.00"))
            self.assertEqual(tasting.purchase_channel, "online")
            self.assertEqual(tasting.overall_score, Decimal("8.5"))
            self.assertEqual(tasting.photos.count(), 1)
            self.assertTrue((Path(media_root) / tasting.photos.get().storage_key).is_file())

    def test_beer_edit_photo_upload_uses_latest_active_tasting(self):
        beer = Beer.objects.create(name="编辑照片啤酒", style=self.style, origin_country_code="CN")
        older = Tasting.objects.create(beer=beer, tasted_at=timezone.make_aware(datetime(2026, 7, 10, 20, 30)))
        latest = Tasting.objects.create(beer=beer, tasted_at=timezone.make_aware(datetime(2026, 7, 15, 20, 30)))
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            page = self.client.get(f"/beers/{beer.id}/edit/")
            self.assertEqual(page.status_code, 200)
            self.assertContains(page, "照片")
            self.assertContains(page, 'name="photos"')
            response = self.client.post(
                f"/beers/{beer.id}/edit/",
                {
                    "name": beer.name,
                    "brand_name": "",
                    "brewery_name": "",
                    "origin_country_code": "CN",
                    "category": str(self.category.id),
                    "style": str(self.style.id),
                    "abv": "",
                    "ibu": "",
                    "plato": "",
                    "mouthfeel_profile": "",
                    "flavor_tag_input": "",
                    "photos": [self._image_upload("beer-edit.png")],
                },
            )
            self.assertEqual(response.status_code, 302)
            self.assertEqual(older.photos.count(), 0)
            self.assertEqual(latest.photos.count(), 1)

    def test_new_beer_from_tasting_flow_creates_first_tasting(self):
        payload = self._valid_payload()
        payload["from_tasting"] = "1"
        response = self.client.post("/beers/add/?from=tasting", payload)
        self.assertEqual(response.status_code, 302)
        beer = Beer.objects.get(name="用户流程 IPA")
        tasting = beer.tastings.get()
        self.assertRedirects(response, f"/tastings/{tasting.id}/", fetch_redirect_response=False)

    def _image_upload(self, name="label.png"):
        image_bytes = BytesIO()
        Image.new("RGB", (1200, 800), color=(30, 120, 60)).save(image_bytes, format="PNG")
        return SimpleUploadedFile(name, image_bytes.getvalue(), content_type="image/png")

    def test_photo_upload_is_reencoded_and_served_through_application(self):
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            payload = self._valid_payload()
            payload["photos"] = [self._image_upload()]
            response = self.client.post("/beers/add/", payload)
            self.assertEqual(response.status_code, 302)
            tasting = Tasting.objects.get(beer__name="用户流程 IPA")
            photo = tasting.photos.get()
            self.assertTrue(photo.storage_key.endswith(".webp"))
            self.assertTrue((Path(media_root) / photo.storage_key).is_file())
            self.assertTrue((Path(media_root) / photo.thumbnail_key).is_file())
            self.assertLessEqual(photo.width, 2000)
            self.assertLessEqual(photo.height, 2000)
            image_response = self.client.get(f"/photos/{photo.id}/thumbnail/")
            self.assertEqual(image_response.status_code, 200)
            self.assertEqual(image_response["Content-Type"], "image/webp")
            self.client.post(f"/photos/{photo.id}/delete/")
            self.assertFalse((Path(media_root) / photo.storage_key).exists())
            self.assertFalse((Path(media_root) / photo.thumbnail_key).exists())

    def test_invalid_image_upload_does_not_create_partial_records(self):
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            payload = self._valid_payload()
            payload["photos"] = [SimpleUploadedFile("not-an-image.jpg", b"not an image", content_type="image/jpeg")]
            response = self.client.post("/beers/add/", payload)
            self.assertEqual(response.status_code, 200)
            self.assertContains(response, "文件不是可识别的图片")
            self.assertFalse(Beer.objects.filter(name="用户流程 IPA").exists())

    def test_edit_and_soft_delete_restore_records(self):
        beer = Beer.objects.create(name="待编辑啤酒", style=self.style, origin_country_code="CN")
        tasting = Tasting.objects.create(beer=beer, tasted_at=timezone.make_aware(datetime(2026, 7, 15, 20, 30)), overall_score=Decimal("7.0"))
        TastingRatingValue.objects.create(
            tasting=tasting,
            dimension=self.dimension,
            value=Decimal("7.5"),
            dimension_name_snapshot=self.dimension.name,
            scale_min_snapshot=Decimal("0"),
            scale_max_snapshot=Decimal("10"),
            step_snapshot=Decimal("0.5"),
        )
        beer_response = self.client.post(
            f"/beers/{beer.id}/edit/",
            {"name": "已编辑啤酒", "brand_name": "", "brewery_name": "", "origin_country_code": "CN", "category": str(self.category.id), "style": str(self.style.id), "abv": "5.00", "ibu": "20.00", "plato": "12.50", "mouthfeel_profile": "crisp", "flavor_tag_input": "柑橘、焦糖"},
        )
        self.assertEqual(beer_response.status_code, 302)
        beer.refresh_from_db()
        self.assertEqual(beer.name, "已编辑啤酒")
        self.assertEqual(beer.plato, Decimal("12.50"))
        self.assertEqual(beer.mouthfeel_profile, "crisp")
        self.assertEqual(set(beer.flavor_tag_links.values_list("tag__name", flat=True)), {"柑橘", "焦糖"})
        edit_page = self.client.get(f"/tastings/{tasting.id}/edit/")
        self.assertNotContains(edit_page, "多维评分")
        self.assertNotContains(edit_page, 'name="rating_')
        self.assertNotContains(edit_page, "食物搭配")
        self.assertNotContains(edit_page, "饮用场景")
        TastingTagLink.objects.create(tasting=tasting, tag=self.food)
        tasting_response = self.client.post(
            f"/tastings/{tasting.id}/edit/",
            {"tasted_at": "2026-07-16T20:30", "drinking_location": "酒吧", "price_amount": "30.00", "overall_score": "8.0", "notes": "已编辑"},
        )
        self.assertEqual(tasting_response.status_code, 302)
        tasting.refresh_from_db()
        self.assertEqual(tasting.overall_score, Decimal("8.0"))
        self.assertEqual(tasting.rating_values.get().value, Decimal("7.5"))
        self.assertEqual(tasting.tag_links.get().tag, self.food)
        self.client.post(f"/tastings/{tasting.id}/delete/")
        tasting.refresh_from_db()
        self.assertIsNotNone(tasting.deleted_at)
        self.client.post(f"/tastings/{tasting.id}/restore/")
        tasting.refresh_from_db()
        self.assertIsNone(tasting.deleted_at)
        self.client.post(f"/beers/{beer.id}/delete/")
        beer.refresh_from_db()
        self.assertIsNotNone(beer.deleted_at)
        self.client.post(f"/beers/{beer.id}/restore/")
        beer.refresh_from_db()
        self.assertIsNone(beer.deleted_at)

    def test_repeat_tasting_creates_independent_history_in_time_order(self):
        beer = Beer.objects.create(name="长期记录啤酒", style=self.style, origin_country_code="DE")
        oldest = Tasting.objects.create(beer=beer, tasted_at=timezone.make_aware(datetime(2026, 7, 10, 19, 0)), overall_score=Decimal("6.0"), notes="第一次")
        middle = Tasting.objects.create(beer=beer, tasted_at=timezone.make_aware(datetime(2026, 7, 12, 19, 0)), overall_score=Decimal("7.0"), notes="第二次")
        payload = {
            "tasted_at": "2026-07-15T20:30",
            "drinking_location": "家中",
            "price_amount": "25.00",
            "overall_score": "8.0",
            "notes": "第三次",
        }
        response = self.client.post(f"/beers/{beer.id}/tastings/add/", payload)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(beer.tastings.count(), 3)
        newest = beer.tastings.get(notes="第三次")
        detail = self.client.get(f"/beers/{beer.id}/")
        self.assertEqual(detail.status_code, 200)
        content = detail.content.decode()
        self.assertLess(content.index("2026年7月15日 20:30"), content.index("2026年7月12日 19:00"))
        self.assertLess(content.index("2026年7月12日 19:00"), content.index("2026年7月10日 19:00"))
        self.client.post(f"/tastings/{middle.id}/delete/")
        self.assertTrue(Tasting.objects.get(id=middle.id).deleted_at)
        self.assertIsNone(Tasting.objects.get(id=oldest.id).deleted_at)
        self.assertIsNone(Tasting.objects.get(id=newest.id).deleted_at)

    def test_mobile_filter_assets_keep_fixed_elements_viewport_bound(self):
        response = self.client.get("/beers/")
        self.assertContains(response, 'data-filter-open')
        self.assertContains(response, 'data-filter-sheet')
        self.assertContains(response, 'js/app.js?')
        self.assertContains(response, 'css/app.css?')

        static_root = Path(settings.BASE_DIR) / "core" / "static"
        stylesheet = (static_root / "css" / "app.css").read_text(encoding="utf-8")
        script = (static_root / "js" / "app.js").read_text(encoding="utf-8")
        self.assertIn(".floating-add-button { position: fixed;", stylesheet)
        self.assertIn(".filter-sheet { position: fixed;", stylesheet)
        self.assertIn("@keyframes page-enter { from { opacity: 0; } to { opacity: 1; } }", stylesheet)
        self.assertIn('document.querySelector("[data-filter-open]")', script)
        self.assertIn('document.readyState === "loading"', script)
