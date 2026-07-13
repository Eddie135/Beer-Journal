from django.db import migrations, models


def migrate_legacy_mouthfeel_scores(apps, schema_editor):
    Beer = apps.get_model("core", "Beer")
    score_map = {
        "crisp": 1,
        "light": 2,
        "balanced": 3,
        "medium": 3,
        "full": 5,
    }
    for legacy_profile, score in score_map.items():
        Beer.objects.filter(mouthfeel_score__isnull=True, mouthfeel_profile=legacy_profile).update(mouthfeel_score=score)


class Migration(migrations.Migration):
    dependencies = [("core", "0004_localize_categories_and_remove_legacy_lager_style")]

    operations = [
        migrations.AddField(
            model_name="beer",
            name="mouthfeel_score",
            field=models.PositiveSmallIntegerField(blank=True, choices=[(1, "清爽"), (2, "偏清爽"), (3, "平衡"), (4, "偏醇厚"), (5, "醇厚")], null=True),
        ),
        migrations.AddField(
            model_name="beer",
            name="bitterness_score",
            field=models.PositiveSmallIntegerField(blank=True, choices=[(1, "淡"), (2, "微苦"), (3, "平衡"), (4, "偏苦"), (5, "苦")], null=True),
        ),
        migrations.AddField(
            model_name="beer",
            name="flavor_complexity_score",
            field=models.PositiveSmallIntegerField(blank=True, choices=[(1, "简单"), (2, "较简单"), (3, "平衡"), (4, "较复杂"), (5, "复杂")], null=True),
        ),
        migrations.RunPython(migrate_legacy_mouthfeel_scores, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="beer",
            constraint=models.CheckConstraint(condition=models.Q(mouthfeel_score__isnull=True) | models.Q(mouthfeel_score__gte=1, mouthfeel_score__lte=5), name="beer_mouthfeel_score_range"),
        ),
        migrations.AddConstraint(
            model_name="beer",
            constraint=models.CheckConstraint(condition=models.Q(bitterness_score__isnull=True) | models.Q(bitterness_score__gte=1, bitterness_score__lte=5), name="beer_bitterness_score_range"),
        ),
        migrations.AddConstraint(
            model_name="beer",
            constraint=models.CheckConstraint(condition=models.Q(flavor_complexity_score__isnull=True) | models.Q(flavor_complexity_score__gte=1, flavor_complexity_score__lte=5), name="beer_flavor_complexity_score_range"),
        ),
    ]
