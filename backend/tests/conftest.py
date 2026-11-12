import io
import os
from pathlib import Path

# Force in-memory SQLite for test suite
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.database
from app.config import Settings, get_settings
from app.database import Base, get_db
from app.main import create_app


@pytest.fixture()
def temp_upload_dir(tmp_path: Path) -> Path:
    d = tmp_path / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


@pytest.fixture()
def client(temp_upload_dir: Path):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    test_settings = Settings(
        database_url="sqlite:///:memory:",
        upload_dir=str(temp_upload_dir),
        max_upload_size_mb=5,
        supabase_url="",
        supabase_key="",
        supabase_secret_key="",
    )

    orig_engine = app.database.engine
    orig_session_local = app.database.SessionLocal
    app.database.engine = engine
    app.database.SessionLocal = TestingSessionLocal

    fastapi_app = create_app()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db
    fastapi_app.dependency_overrides[get_settings] = lambda: test_settings

    try:
        with TestClient(fastapi_app) as test_client:
            test_client.session_factory = TestingSessionLocal  # type: ignore[attr-defined]
            yield test_client
    finally:
        app.database.engine = orig_engine
        app.database.SessionLocal = orig_session_local


def make_test_image_bytes(color: tuple[int, int, int] = (40, 140, 60), fmt: str = "PNG") -> bytes:
    img = Image.new("RGB", (64, 64), color=color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()
