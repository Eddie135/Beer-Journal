import os
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlparse

from django.core.exceptions import ImproperlyConfigured


def parse_comma_list(value):
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_allowed_hosts(value):
    return parse_comma_list(value)


def parse_bool(value, default=False):
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_nonnegative_int(value, default=0):
    if value is None or not value.strip():
        return default
    try:
        parsed = int(value)
    except ValueError as error:
        raise ImproperlyConfigured("环境变量必须是非负整数。") from error
    if parsed < 0:
        raise ImproperlyConfigured("环境变量必须是非负整数。")
    return parsed


def database_config_from_url(database_url):
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ImproperlyConfigured("DATABASE_URL 必须使用 postgresql:// 或 postgres:// 协议。")
    if not parsed.hostname:
        raise ImproperlyConfigured("DATABASE_URL 缺少数据库主机名。")

    database_name = unquote(parsed.path.lstrip("/"))
    if not database_name:
        raise ImproperlyConfigured("DATABASE_URL 缺少数据库名称。")

    try:
        port = parsed.port
    except ValueError as error:
        raise ImproperlyConfigured("DATABASE_URL 端口无效。") from error

    config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": database_name,
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname,
        "PORT": str(port or 5432),
    }
    options = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if options:
        config["OPTIONS"] = options
    return config


def legacy_database_config():
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "beer_journal"),
        "USER": os.getenv("POSTGRES_USER", "beer_journal"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "local-development-only"),
        "HOST": os.getenv("POSTGRES_HOST", "db"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }


BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "development-only-change-me")
DEBUG = parse_bool(os.getenv("DJANGO_DEBUG"), default=False)
ALLOWED_HOSTS = parse_allowed_hosts(os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1"))
CSRF_TRUSTED_ORIGINS = parse_comma_list(os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", ""))

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DATABASES = {"default": database_config_from_url(DATABASE_URL) if DATABASE_URL else legacy_database_config()}

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [BASE_DIR / "templates"], "APP_DIRS": True, "OPTIONS": {"context_processors": ["django.template.context_processors.request", "django.contrib.auth.context_processors.auth", "django.contrib.messages.context_processors.messages"]}}]
WSGI_APPLICATION = "config.wsgi.application"

LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = Path(os.getenv("DJANGO_STATIC_ROOT", BASE_DIR / "staticfiles"))
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.getenv("DJANGO_MEDIA_ROOT", BASE_DIR / "media"))

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if parse_bool(os.getenv("DJANGO_SECURE_PROXY_SSL_HEADER"), default=False) else None
SECURE_SSL_REDIRECT = parse_bool(os.getenv("DJANGO_SECURE_SSL_REDIRECT"), default=False)
SESSION_COOKIE_SECURE = parse_bool(os.getenv("DJANGO_SESSION_COOKIE_SECURE"), default=False)
CSRF_COOKIE_SECURE = parse_bool(os.getenv("DJANGO_CSRF_COOKIE_SECURE"), default=False)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

SECURE_HSTS_SECONDS = parse_nonnegative_int(os.getenv("DJANGO_HSTS_SECONDS"), default=0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0 and parse_bool(os.getenv("DJANGO_HSTS_INCLUDE_SUBDOMAINS"), default=False)
SECURE_HSTS_PRELOAD = SECURE_HSTS_SECONDS > 0 and parse_bool(os.getenv("DJANGO_HSTS_PRELOAD"), default=False)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
