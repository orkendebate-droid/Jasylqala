import io
import uuid
from pathlib import Path
import httpx
from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.config import Settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def validate_and_read_image(file_bytes: bytes, filename: str | None, max_size_mb: int) -> str:
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл пустой")

    max_bytes = max_size_mb * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Файл превышает лимит {max_size_mb} МБ",
        )

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img.verify()
            fmt = (img.format or "").upper()
            format_map = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
            if fmt in format_map:
                ext = format_map[fmt]
            else:
                ext = Path(filename or "photo.jpg").suffix.lower()
                if ext not in ALLOWED_EXTENSIONS:
                    ext = ".jpg"
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл не является корректным изображением",
        ) from exc

    return ext


async def save_upload(file: UploadFile, settings: Settings) -> str:
    file_bytes = await file.read()
    ext = validate_and_read_image(file_bytes, file.filename, settings.max_upload_size_mb)
    object_name = f"{uuid.uuid4().hex}{ext}"

    if settings.supabase_url and settings.supabase_key:
        upload_url = (
            f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
            f"{settings.supabase_bucket}/{object_name}"
        )
        headers = {
            "Authorization": f"Bearer {settings.supabase_key}",
            "apikey": settings.supabase_key,
            "Content-Type": file.content_type or "image/jpeg",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(upload_url, content=file_bytes, headers=headers)
            if resp.status_code not in (200, 201):
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Не удалось сохранить фото в облачное хранилище",
                )
        return (
            f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/"
            f"{settings.supabase_bucket}/{object_name}"
        )

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / object_name
    dest.write_bytes(file_bytes)
    return f"/uploads/{object_name}"
