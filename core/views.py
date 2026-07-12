from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Avg, Q
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .forms import BeerEditForm, CreateBeerTastingForm, TastingEditForm
from .models import Beer, Photo, Tasting
from .photo_service import PhotoProcessingError, create_photos, delete_photo_keys

def home(request):
    return render(request, "home.html")

def health(request):
    return JsonResponse({"status": "ok", "service": "beer-journal"})


def beer_list(request):
    beers = (
        Beer.objects.filter(deleted_at__isnull=True)
        .select_related("style")
        .annotate(average_score=Avg("tastings__overall_score", filter=Q(tastings__deleted_at__isnull=True)))
    )
    for beer in beers:
        beer.cover_photo = Photo.objects.filter(tasting__beer=beer, tasting__deleted_at__isnull=True).order_by("-tasting__tasted_at", "sort_order").first()
    return render(request, "beer_list.html", {"beers": beers})


def create_beer_tasting(request):
    if request.method == "POST":
        form = CreateBeerTastingForm(request.POST, request.FILES)
        if form.is_valid():
            try:
                with transaction.atomic():
                    beer, tasting = form.create_records()
                    create_photos(tasting, form.cleaned_data["photos"])
                return redirect("beer-detail", beer_id=beer.id)
            except PhotoProcessingError as exc:
                form.add_error("photos", str(exc))
    else:
        form = CreateBeerTastingForm()
    return render(request, "beer_form.html", {"form": form})


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
    form = TastingEditForm(request.POST or None, request.FILES or None)
    if request.method == "POST" and form.is_valid():
        try:
            with transaction.atomic():
                tasting = form.save(beer=beer)
                create_photos(tasting, form.cleaned_data["photos"])
            return redirect("beer-detail", beer_id=beer.id)
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
    form = BeerEditForm(request.POST or None, beer=beer)
    if request.method == "POST" and form.is_valid():
        form.save()
        return redirect("beer-detail", beer_id=beer.id)
    return render(request, "beer_edit.html", {"form": form, "beer": beer})


def edit_tasting(request, tasting_id):
    tasting = get_object_or_404(Tasting.objects.filter(deleted_at__isnull=True).prefetch_related("rating_values", "tag_links__tag", "photos"), id=tasting_id)
    form = TastingEditForm(request.POST or None, request.FILES or None, tasting=tasting)
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
