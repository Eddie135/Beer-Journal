from django.db import migrations


def seed_v2_styles(apps, schema_editor):
    BeerCategory = apps.get_model("core", "BeerCategory")
    BeerStyle = apps.get_model("core", "BeerStyle")
    categories = {category.code: category for category in BeerCategory.objects.all()}
    styles = (
        ("pilsner", "皮尔森", "lager"),
        ("pale_lager", "淡色拉格", "lager"),
        ("dark_lager", "黑拉格", "lager"),
        ("ipa", "IPA", "ale"),
        ("wheat", "小麦啤酒", "ale"),
        ("stout", "世涛", "ale"),
    )
    for code, name, category_code in styles:
        BeerStyle.objects.get_or_create(
            normalized_name=code,
            defaults={"name": name, "category_id": categories[category_code].id, "is_active": True},
        )


class Migration(migrations.Migration):
    dependencies = [("core", "0002_beercategory_remove_tasting_tasting_volume_positive_and_more")]
    operations = [migrations.RunPython(seed_v2_styles, migrations.RunPython.noop)]
