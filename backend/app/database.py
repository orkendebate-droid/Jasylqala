from collections.abc import Generator
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


def normalize_database_url(url: str) -> str:
    # If placeholder password is still present, fallback to local sqlite safely
    if "[YOUR-" in url or "[ВАШ" in url or "[ПАРОЛЬ" in url:
        return "sqlite:///./jasylqala.db"
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str | None = None):
    url = normalize_database_url(database_url or get_settings().database_url)
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


engine = build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db(target_engine=None) -> None:
    eng = target_engine or engine
    is_pg = eng.dialect.name == "postgresql"
    if is_pg:
        with eng.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))

    Base.metadata.create_all(bind=eng)
    _add_missing_columns(eng)

    if is_pg:
        with eng.begin() as conn:
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name = 'trees' AND column_name = 'geom'
                        ) THEN
                            ALTER TABLE trees ADD COLUMN geom geometry(Point, 4326);
                            CREATE INDEX IF NOT EXISTS ix_trees_geom ON trees USING GIST (geom);
                        END IF;
                    END $$;
                    """
                )
            )


def _add_missing_columns(eng) -> None:
    """create_all не меняет уже существующие таблицы — новые колонки добавляем вручную."""
    existing = {c["name"] for c in inspect(eng).get_columns("trees")}
    if "deleted_at" not in existing:
        col_type = "TIMESTAMP WITH TIME ZONE" if eng.dialect.name == "postgresql" else "DATETIME"
        with eng.begin() as conn:
            conn.execute(text(f"ALTER TABLE trees ADD COLUMN deleted_at {col_type}"))


def sync_postgis_point(db: Session, tree_id: int, lat: float, lon: float) -> None:
    if db.bind and db.bind.dialect.name == "postgresql":
        db.execute(
            text("UPDATE trees SET geom = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) WHERE id = :id"),
            {"lon": lon, "lat": lat, "id": tree_id},
        )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
