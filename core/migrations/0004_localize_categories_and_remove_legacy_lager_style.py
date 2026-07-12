from django.db import migrations


def localize_categories_and_remove_legacy_lager_style(apps, schema_editor):
    Beer = apps.get_model("core", "Beer")
    BeerCategory = apps.get_model("core", "BeerCategory")
    BeerStyle = apps.get_model("core", "BeerStyle")

    category_specs = (("lager", "拉格"), ("ale", "艾尔"))
    categories = {}
    for code, display_name in category_specs:
        category = BeerCategory.objects.get(code=code)
        # Keep the unique normalized value available even if a manually created
        # category already used the Chinese display name.
        for conflicting in BeerCategory.objects.filter(normalized_name=display_name).exclude(pk=category.pk):
            conflicting.normalized_name = f"legacy-{conflicting.pk}"
            conflicting.save(update_fields=["normalized_name"])
        category.name = display_name
        category.normalized_name = display_name
        category.save(update_fields=["name", "normalized_name"])
        categories[code] = category

    pale_lager, _ = BeerStyle.objects.get_or_create(
        normalized_name="pale_lager",
        defaults={"name": "淡色拉格", "category_id": categories["lager"].pk, "is_active": True},
    )
    if pale_lager.category_id != categories["lager"].pk:
        pale_lager.category_id = categories["lager"].pk
        pale_lager.save(update_fields=["category"])

    legacy_style_ids = list(
        BeerStyle.objects.filter(name__iexact="Lager").exclude(pk=pale_lager.pk).values_list("pk", flat=True)
    )
    if legacy_style_ids:
        Beer.objects.filter(style_id__in=legacy_style_ids).update(style_id=pale_lager.pk)
        BeerStyle.objects.filter(pk__in=legacy_style_ids).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0003_seed_v2_styles")]

    operations = [
        migrations.RunPython(localize_categories_and_remove_legacy_lager_style, migrations.RunPython.noop),
    ]
