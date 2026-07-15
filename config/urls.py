from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.contrib.auth.decorators import login_required
from django.urls import path
from core.views import (
    beer_detail, beer_list, create_beer_tasting, delete_beer, delete_photo, delete_tasting,
    create_tasting, edit_beer, edit_tasting, health, home, manifest, personal_data, photo_file, register, restore_beer, restore_tasting, service_worker, start_tasting, tasting_detail, tasting_list, trash, beer_first_tasting,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/login/", auth_views.LoginView.as_view(template_name="registration/login.html", redirect_authenticated_user=True), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("accounts/register/", register, name="register"),
    path("", login_required(home), name="home"),
    path("manifest.json", manifest, name="manifest"),
    path("service-worker.js", service_worker, name="service-worker"),
    path("beers/", login_required(beer_list), name="beer-list"),
    path("tastings/", login_required(tasting_list), name="tasting-list"),
    path("tastings/add/", login_required(start_tasting), name="tasting-start"),
    path("personal/", login_required(personal_data), name="personal-data"),
    path("beers/add/", login_required(create_beer_tasting), name="beer-add"),
    path("beers/<uuid:beer_id>/first-tasting/", login_required(beer_first_tasting), name="beer-first-tasting"),
    path("beers/<uuid:beer_id>/", login_required(beer_detail), name="beer-detail"),
    path("beers/<uuid:beer_id>/tastings/add/", login_required(create_tasting), name="tasting-add"),
    path("beers/<uuid:beer_id>/edit/", login_required(edit_beer), name="beer-edit"),
    path("beers/<uuid:beer_id>/delete/", login_required(delete_beer), name="beer-delete"),
    path("beers/<uuid:beer_id>/restore/", login_required(restore_beer), name="beer-restore"),
    path("tastings/<uuid:tasting_id>/", login_required(tasting_detail), name="tasting-detail"),
    path("tastings/<uuid:tasting_id>/edit/", login_required(edit_tasting), name="tasting-edit"),
    path("tastings/<uuid:tasting_id>/delete/", login_required(delete_tasting), name="tasting-delete"),
    path("tastings/<uuid:tasting_id>/restore/", login_required(restore_tasting), name="tasting-restore"),
    path("photos/<uuid:photo_id>/delete/", login_required(delete_photo), name="photo-delete"),
    path("photos/<uuid:photo_id>/<str:variant>/", login_required(photo_file), name="photo-file"),
    path("trash/", login_required(trash), name="trash"),
    path("health/", health, name="health"),
]
