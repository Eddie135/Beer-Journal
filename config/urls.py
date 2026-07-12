from django.contrib import admin
from django.urls import path
from core.views import beer_detail, beer_list, create_beer_tasting, health, home, tasting_detail

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", home, name="home"),
    path("beers/", beer_list, name="beer-list"),
    path("beers/add/", create_beer_tasting, name="beer-add"),
    path("beers/<uuid:beer_id>/", beer_detail, name="beer-detail"),
    path("tastings/<uuid:tasting_id>/", tasting_detail, name="tasting-detail"),
    path("health/", health, name="health"),
]
