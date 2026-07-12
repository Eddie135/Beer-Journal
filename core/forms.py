from django import forms

from .models import TastingRatingValue


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
