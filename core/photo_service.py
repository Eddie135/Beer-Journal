import hashlib
import io
import uuid
from datetime import datetime
from pathlib import Path

from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError

from .models import Photo

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
DISPLAY_MAX_EDGE = 2000
THUMBNAIL_MAX_EDGE = 480
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class PhotoProcessingError(ValueError):
    pass


def _encode_image(upload, max_edge, quality):
    if upload.size > MAX_UPLOAD_BYTES:
        raise PhotoProcessingError("单张图片不能超过 10 MB。")
    try:
        image = Image.open(upload)
        image.verify()
        upload.seek(0)
        image = Image.open(upload)
        if image.format not in ALLOWED_FORMATS:
            raise PhotoProcessingError("仅支持 JPEG、PNG 和 WebP 图片。")
        if image.width * image.height > MAX_PIXELS:
            raise PhotoProcessingError("图片像素数超过 2000 万，请先缩小图片。")
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        image.thumbnail((max_edge, max_edge))
        buffer = io.BytesIO()
        image.save(buffer, format="WEBP", quality=quality, method=6)
        return buffer.getvalue(), image.width, image.height
    except UnidentifiedImageError as exc:
        raise PhotoProcessingError("文件不是可识别的图片。") from exc
    except OSError as exc:
        raise PhotoProcessingError("图片处理失败，请更换图片后重试。") from exc


def _path_for_key(storage_key):
    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / storage_key).resolve()
    if root not in path.parents:
        raise PhotoProcessingError("图片路径无效。")
    return path


def _write_bytes(storage_key, content):
    path = _path_for_key(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def create_photos(tasting, uploads):
    created_keys = []
    photos = []
    try:
        start_order = tasting.photos.count()
        for index, upload in enumerate(uploads):
            display_bytes, width, height = _encode_image(upload, DISPLAY_MAX_EDGE, 82)
            upload.seek(0)
            thumbnail_bytes, _, _ = _encode_image(upload, THUMBNAIL_MAX_EDGE, 75)
            today = datetime.now().strftime("%Y/%m")
            image_id = uuid.uuid4()
            storage_key = f"photos/{today}/{image_id}.webp"
            thumbnail_key = f"photos/{today}/{image_id}_thumb.webp"
            _write_bytes(storage_key, display_bytes)
            created_keys.append(storage_key)
            _write_bytes(thumbnail_key, thumbnail_bytes)
            created_keys.append(thumbnail_key)
            photos.append(
                Photo.objects.create(
                    tasting=tasting,
                    storage_key=storage_key,
                    thumbnail_key=thumbnail_key,
                    original_filename=Path(upload.name).name,
                    mime_type="image/webp",
                    byte_size=len(display_bytes),
                    width=width,
                    height=height,
                    sort_order=start_order + index,
                    checksum_sha256=hashlib.sha256(display_bytes).hexdigest(),
                )
            )
        return photos
    except Exception:
        for key in created_keys:
            _path_for_key(key).unlink(missing_ok=True)
        raise


def delete_photo_files(photo):
    delete_photo_keys(photo.storage_key, photo.thumbnail_key)


def delete_photo_keys(storage_key, thumbnail_key):
    _path_for_key(storage_key).unlink(missing_ok=True)
    _path_for_key(thumbnail_key).unlink(missing_ok=True)
