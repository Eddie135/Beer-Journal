from django.contrib import admin
from django.urls import path
from core.views import (
    beer_detail, beer_list, create_beer_tasting, delete_beer, delete_photo, delete_tasting,
    edit_beer, edit_tasting, health, home, photo_file, restore_beer, restore_tasting, tasting_detail, trash,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", home, name="home"),
    path("beers/", beer_list, name="beer-list"),
    path("beers/add/", create_beer_tasting, name="beer-add"),
    path("beers/<uuid:beer_id>/", beer_detail, name="beer-detail"),
    path("beers/<uuid:beer_id>/edit/", edit_beer, name="beer-edit"),
    path("beers/<uuid:beer_id>/delete/", delete_beer, name="beer-delete"),
    path("beers/<uuid:beer_id>/restore/", restore_beer, name="beer-restore"),
    path("tastings/<uuid:tasting_id>/", tasting_detail, name="tasting-detail"),
    path("tastings/<uuid:tasting_id>/edit/", edit_tasting, name="tasting-edit"),
    path("tastings/<uuid:tasting_id>/delete/", delete_tasting, name="tasting-delete"),
    path("tastings/<uuid:tasting_id>/restore/", restore_tasting, name="tasting-restore"),
    path("photos/<uuid:photo_id>/delete/", delete_photo, name="photo-delete"),
    path("photos/<uuid:photo_id>/<str:variant>/", photo_file, name="photo-file"),
    path("trash/", trash, name="trash"),
    path("health/", health, name="health"),
]
