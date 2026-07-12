from django.db.models import Avg, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render

from .forms import CreateBeerTastingForm
from .models import Beer, Tasting

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
    return render(request, "beer_list.html", {"beers": beers})


def create_beer_tasting(request):
    if request.method == "POST":
        form = CreateBeerTastingForm(request.POST)
        if form.is_valid():
            beer, _ = form.create_records()
            return redirect("beer-detail", beer_id=beer.id)
    else:
        form = CreateBeerTastingForm()
    return render(request, "beer_form.html", {"form": form})


def beer_detail(request, beer_id):
    beer = get_object_or_404(
        Beer.objects.select_related("style", "brand", "brewery").filter(deleted_at__isnull=True),
        id=beer_id,
    )
    tastings = (
        beer.tastings.filter(deleted_at__isnull=True)
        .prefetch_related("rating_values__dimension", "tag_links__tag")
        .order_by("-tasted_at", "-created_at")
    )
    return render(request, "beer_detail.html", {"beer": beer, "tastings": tastings})


def tasting_detail(request, tasting_id):
    tasting = get_object_or_404(
        Tasting.objects.select_related("beer", "beer__style", "beer__brand", "beer__brewery")
        .prefetch_related("rating_values__dimension", "tag_links__tag", "photos")
        .filter(deleted_at__isnull=True),
        id=tasting_id,
    )
    return render(request, "tasting_detail.html", {"tasting": tasting})
