from decimal import Decimal, InvalidOperation
from datetime import date
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Avg, Count, F, Max, Prefetch, Q
from django.db.models.functions import TruncMonth
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .forms import BeerEditForm, BeerSelectionForm, CreateBeerTastingForm, DailyTastingForm, TastingEditForm
from .countries import COUNTRIES, COUNTRY_NAMES
from .models import Beer, BeerCategory, BeerStyle, FlavorTag, Photo, Tasting
from .photo_service import PhotoProcessingError, create_photos, delete_photo_keys

def home(request):
    return redirect("beer-list")

def health(request):
    return JsonResponse({"status": "ok", "service": "beer-journal"})


def beer_list(request):
    filters = {
        "q": request.GET.get("q", "").strip(),
        "category": request.GET.get("category", ""),
        "style": request.GET.get("style", ""),
        "country": request.GET.get("country", ""),
        "mouthfeel": request.GET.get("mouthfeel", ""),
        "tag": request.GET.get("tag", ""),
        "min_score": request.GET.get("min_score", "").strip(),
        "max_score": request.GET.get("max_score", "").strip(),
        "sort": request.GET.get("sort", "latest"),
    }
    beers = (
        Beer.objects.filter(deleted_at__isnull=True)
        .select_related("style", "style__category", "brand", "brewery")
        .prefetch_related(
            "flavor_tag_links__tag",
            Prefetch(
                "tastings",
                queryset=Tasting.objects.filter(deleted_at__isnull=True).prefetch_related("photos").order_by("-tasted_at", "-created_at"),
                to_attr="active_tastings",
            ),
        )
        .annotate(
            average_score=Avg("tastings__overall_score", filter=Q(tastings__deleted_at__isnull=True)),
            tasting_count=Count("tastings", filter=Q(tastings__deleted_at__isnull=True), distinct=True),
            latest_tasted_at=Max("tastings__tasted_at", filter=Q(tastings__deleted_at__isnull=True)),
        )
    )
    if filters["q"]:
        country_codes = [code for code, name in COUNTRY_NAMES.items() if filters["q"] in name]
        beers = beers.filter(
            Q(name__icontains=filters["q"])
            | Q(brand__name__icontains=filters["q"])
            | Q(brewery__name__icontains=filters["q"])
            | Q(origin_country_code__icontains=filters["q"])
            | Q(origin_country_code__in=country_codes)
            | Q(flavor_tag_links__tag__name__icontains=filters["q"])
        )
    if filters["category"]:
        beers = beers.filter(style__category_id=filters["category"])
    if filters["style"]:
        beers = beers.filter(style_id=filters["style"])
    if filters["country"]:
        beers = beers.filter(origin_country_code=filters["country"])
    if filters["mouthfeel"]:
        beers = beers.filter(mouthfeel_profile=filters["mouthfeel"])
    if filters["tag"]:
        beers = beers.filter(flavor_tag_links__tag_id=filters["tag"])
    if filters["min_score"]:
        try:
            beers = beers.filter(average_score__gte=Decimal(filters["min_score"]))
        except (InvalidOperation, ValueError):
            filters["min_score"] = ""
    if filters["max_score"]:
        try:
            beers = beers.filter(average_score__lte=Decimal(filters["max_score"]))
        except (InvalidOperation, ValueError):
            filters["max_score"] = ""
    if filters["sort"] == "score":
        beers = beers.order_by(F("average_score").desc(nulls_last=True), "name", "id")
    elif filters["sort"] == "count":
        beers = beers.order_by(F("tasting_count").desc(), "name", "id")
    else:
        filters["sort"] = "latest"
        beers = beers.order_by(F("latest_tasted_at").desc(nulls_last=True), "name", "id")
    beers = beers.distinct()
    for beer in beers:
        latest_tasting = beer.active_tastings[0] if beer.active_tastings else None
        photos = list(latest_tasting.photos.all()) if latest_tasting else []
        beer.cover_photo = photos[0] if photos else None
    return render(request, "beer_list.html", {
        "beers": beers,
        "filters": filters,
        "categories": BeerCategory.objects.filter(is_active=True, deleted_at__isnull=True),
        "styles": BeerStyle.objects.filter(is_active=True, deleted_at__isnull=True).select_related("category"),
        "flavor_tags": FlavorTag.objects.all(),
        "countries": COUNTRIES,
        "mouthfeel_choices": Beer.MOUTHFEEL_CHOICES,
    })


def tasting_list(request):
    tastings = (
        Tasting.objects.filter(deleted_at__isnull=True, beer__deleted_at__isnull=True)
        .select_related("beer", "beer__style", "beer__style__category")
        .prefetch_related("photos")
        .order_by("-tasted_at", "-created_at")
    )
    return render(request, "tasting_list.html", {"tastings": tastings})


def start_tasting(request):
    form = BeerSelectionForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        return redirect("tasting-add", beer_id=form.cleaned_data["beer"].id)
    return render(request, "tasting_select.html", {"form": form, "beers": form.fields["beer"].queryset})


def personal_data(request):
    active_beers = Beer.objects.filter(deleted_at__isnull=True)
    active_tastings = Tasting.objects.filter(deleted_at__isnull=True, beer__deleted_at__isnull=True)
    core_stats = {
        "beer_count": active_beers.count(),
        "tasting_count": active_tastings.count(),
        "average_score": active_tastings.aggregate(value=Avg("overall_score"))["value"],
        "average_abv": active_beers.aggregate(value=Avg("abv"))["value"],
        "average_plato": active_beers.aggregate(value=Avg("plato"))["value"],
        "average_price": active_tastings.aggregate(value=Avg("price_amount"))["value"],
    }
    preferences = {
        "category": (
            active_tastings.exclude(beer__style__category__isnull=True)
            .values("beer__style__category__name")
            .annotate(count=Count("id"))
            .order_by("-count", "beer__style__category__name")
            .first()
        ),
        "style": (
            active_tastings.exclude(beer__style__isnull=True)
            .values("beer__style__name")
            .annotate(count=Count("id"))
            .order_by("-count", "beer__style__name")
            .first()
        ),
        "country": (
            active_tastings.exclude(beer__origin_country_code="")
            .values("beer__origin_country_code")
            .annotate(count=Count("id"))
            .order_by("-count", "beer__origin_country_code")
            .first()
        ),
        "flavor_tag": (
            FlavorTag.objects.filter(
                beer_links__beer__deleted_at__isnull=True,
                beer_links__beer__tastings__deleted_at__isnull=True,
            )
            .values("name")
            .annotate(count=Count("beer_links__beer__tastings", distinct=True))
            .order_by("-count", "name")
            .first()
        ),
    }

    today = timezone.localdate()
    month_starts = []
    year, month = today.year, today.month
    for _ in range(12):
        month_starts.append(date(year, month, 1))
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
    month_starts.reverse()
    first_month = month_starts[0]
    tasting_by_month = {
        item["month"].date(): item["count"]
        for item in active_tastings.filter(tasted_at__date__gte=first_month)
        .annotate(month=TruncMonth("tasted_at"))
        .values("month")
        .annotate(count=Count("id"))
    }
    beer_by_month = {
        item["month"].date(): item["count"]
        for item in active_beers.filter(created_at__date__gte=first_month)
        .annotate(month=TruncMonth("created_at"))
        .values("month")
        .annotate(count=Count("id"))
    }
    monthly_trends = [
        {
            "month": month_start,
            "tasting_count": tasting_by_month.get(month_start, 0),
            "beer_count": beer_by_month.get(month_start, 0),
        }
        for month_start in month_starts
    ]
    recent_tastings = (
        active_tastings.select_related("beer", "beer__style", "beer__style__category")
        .prefetch_related("photos")
        .order_by("-tasted_at", "-created_at")[:5]
    )
    return render(request, "personal_data.html", {
        "core_stats": core_stats,
        "preferences": preferences,
        "monthly_trends": monthly_trends,
        "recent_tastings": recent_tastings,
    })


def create_beer_tasting(request):
    if request.method == "POST":
        form = CreateBeerTastingForm(request.POST, request.FILES)
        if form.is_valid():
            try:
                with transaction.atomic():
                    beer, tasting = form.create_records()
                    create_photos(tasting, form.cleaned_data["photos"])
                if request.POST.get("from_tasting") == "1":
                    return redirect("tasting-detail", tasting_id=tasting.id)
                return redirect("beer-detail", beer_id=beer.id)
            except PhotoProcessingError as exc:
                form.add_error("photos", str(exc))
    else:
        form = CreateBeerTastingForm()
    return render(request, "beer_form.html", {"form": form, "from_tasting": request.GET.get("from") == "tasting" or request.POST.get("from_tasting") == "1"})


def beer_detail(request, beer_id):
    beer = get_object_or_404(
        Beer.objects.select_related("style", "brand", "brewery").filter(deleted_at__isnull=True),
        id=beer_id,
    )
    tastings = list(
        beer.tastings.filter(deleted_at__isnull=True)
        .prefetch_related("rating_values__dimension", "tag_links__tag", "photos")
        .order_by("-tasted_at", "-created_at")
    )
    beer.cover_photo = Photo.objects.filter(tasting__beer=beer, tasting__deleted_at__isnull=True).order_by("-tasting__tasted_at", "sort_order").first()
    stats = beer.tastings.filter(deleted_at__isnull=True).aggregate(average_score=Avg("overall_score"))
    return render(request, "beer_detail.html", {"beer": beer, "tastings": tastings, "average_score": stats["average_score"], "latest_tasting": tastings[0] if tastings else None})


def create_tasting(request, beer_id):
    beer = get_object_or_404(Beer.objects.filter(deleted_at__isnull=True), id=beer_id)
    form = DailyTastingForm(request.POST or None, request.FILES or None)
    if request.method == "POST" and form.is_valid():
        try:
            with transaction.atomic():
                tasting = form.save(beer=beer)
                create_photos(tasting, form.cleaned_data["photos"])
            return redirect("tasting-detail", tasting_id=tasting.id)
        except PhotoProcessingError as exc:
            form.add_error("photos", str(exc))
    return render(request, "tasting_create.html", {"form": form, "beer": beer})


def tasting_detail(request, tasting_id):
    tasting = get_object_or_404(
        Tasting.objects.select_related("beer", "beer__style", "beer__brand", "beer__brewery")
        .prefetch_related("rating_values__dimension", "tag_links__tag", "photos")
        .filter(deleted_at__isnull=True),
        id=tasting_id,
    )
    return render(request, "tasting_detail.html", {"tasting": tasting})


def edit_beer(request, beer_id):
    beer = get_object_or_404(Beer.objects.filter(deleted_at__isnull=True).prefetch_related("flavor_tag_links__tag"), id=beer_id)
    current_photos = Photo.objects.filter(tasting__beer=beer, tasting__deleted_at__isnull=True).order_by("-tasting__tasted_at", "sort_order", "created_at")
    photo_tasting = beer.tastings.filter(deleted_at__isnull=True).order_by("-tasted_at", "-created_at").first()
    form = BeerEditForm(request.POST or None, request.FILES or None, beer=beer)
    if request.method == "POST" and form.is_valid():
        if form.cleaned_data["photos"] and photo_tasting is None:
            form.add_error("photos", "请先创建至少一条品饮记录，才能保存照片。")
        else:
            try:
                with transaction.atomic():
                    form.save()
                    if photo_tasting:
                        create_photos(photo_tasting, form.cleaned_data["photos"])
                return redirect("beer-detail", beer_id=beer.id)
            except PhotoProcessingError as exc:
                form.add_error("photos", str(exc))
    return render(request, "beer_edit.html", {"form": form, "beer": beer, "current_photos": current_photos})


def edit_tasting(request, tasting_id):
    tasting = get_object_or_404(Tasting.objects.filter(deleted_at__isnull=True).prefetch_related("rating_values", "tag_links__tag", "photos"), id=tasting_id)
    form = TastingEditForm(request.POST or None, request.FILES or None, tasting=tasting, preserve_ratings=True)
    if request.method == "POST" and form.is_valid():
        try:
            with transaction.atomic():
                tasting = form.save()
                create_photos(tasting, form.cleaned_data["photos"])
            return redirect("tasting-detail", tasting_id=tasting.id)
        except PhotoProcessingError as exc:
            form.add_error("photos", str(exc))
    return render(request, "tasting_edit.html", {"form": form, "tasting": tasting})


@require_POST
def delete_beer(request, beer_id):
    beer = get_object_or_404(Beer.objects.filter(deleted_at__isnull=True), id=beer_id)
    beer.deleted_at = timezone.now()
    beer.save(update_fields=["deleted_at", "updated_at"])
    return redirect("trash")


@require_POST
def delete_tasting(request, tasting_id):
    tasting = get_object_or_404(Tasting.objects.filter(deleted_at__isnull=True), id=tasting_id)
    tasting.deleted_at = timezone.now()
    tasting.save(update_fields=["deleted_at", "updated_at"])
    return redirect("beer-detail", beer_id=tasting.beer_id)


@require_POST
def delete_photo(request, photo_id):
    photo = get_object_or_404(Photo.objects.select_related("tasting"), id=photo_id)
    tasting_id = photo.tasting_id
    storage_key, thumbnail_key = photo.storage_key, photo.thumbnail_key
    with transaction.atomic():
        transaction.on_commit(lambda: delete_photo_keys(storage_key, thumbnail_key))
        photo.delete()
    return redirect("tasting-edit", tasting_id=tasting_id)


def trash(request):
    return render(request, "trash.html", {"beers": Beer.objects.filter(deleted_at__isnull=False), "tastings": Tasting.objects.filter(deleted_at__isnull=False).select_related("beer")})


@require_POST
def restore_beer(request, beer_id):
    beer = get_object_or_404(Beer.objects.filter(deleted_at__isnull=False), id=beer_id)
    beer.deleted_at = None
    beer.save(update_fields=["deleted_at", "updated_at"])
    return redirect("beer-detail", beer_id=beer.id)


@require_POST
def restore_tasting(request, tasting_id):
    tasting = get_object_or_404(Tasting.objects.filter(deleted_at__isnull=False), id=tasting_id)
    tasting.deleted_at = None
    tasting.save(update_fields=["deleted_at", "updated_at"])
    return redirect("beer-detail", beer_id=tasting.beer_id)


def photo_file(request, photo_id, variant):
    if variant not in {"display", "thumbnail"}:
        raise Http404("图片规格不存在。")
    photo = get_object_or_404(Photo.objects.select_related("tasting__beer"), id=photo_id, tasting__deleted_at__isnull=True, tasting__beer__deleted_at__isnull=True)
    storage_key = photo.thumbnail_key if variant == "thumbnail" else photo.storage_key
    path = (Path(settings.MEDIA_ROOT) / storage_key).resolve()
    if not path.is_file() or Path(settings.MEDIA_ROOT).resolve() not in path.parents:
        raise Http404("图片文件不存在。")
    return FileResponse(path.open("rb"), content_type="image/webp")
