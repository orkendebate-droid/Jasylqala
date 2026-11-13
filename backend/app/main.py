from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import database
from app.config import Settings, get_settings
from app.database import get_db, sync_postgis_point
from app.models import CareTask, Tree
from app.schemas import (
    CareTaskCreate,
    CareTaskOut,
    CareTaskUpdate,
    GeoJSONFeature,
    GeoJSONGeometry,
    OfflineSyncRequest,
    OfflineSyncResponse,
    PredictResponse,
    SpeciesOut,
    TreeCreate,
    TreeDetailOut,
    TreeFeatureCollection,
    TreeOut,
    TreeUpdate,
)
from app.pilot import pilot_summary
from app.seed import seed_demo_data
from app.services.ml_predictor import MODEL_VERSION, predict_top3_species
from app.services.storage import save_upload, validate_and_read_image
from app.species_data import SPECIES_CATALOG


CONDITION_LABELS = {"good": "хорошее", "fair": "среднее", "poor": "слабое"}


def _get_live_tree(db: Session, tree_id: int) -> Tree:
    tree = db.query(Tree).filter(Tree.id == tree_id, Tree.deleted_at.is_(None)).first()
    if not tree:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Дерево не найдено")
    return tree


def _insert_tree(db: Session, payload: TreeCreate) -> tuple[Tree, bool]:
    if payload.client_id:
        existing = db.query(Tree).filter(Tree.client_id == payload.client_id).first()
        if existing:
            return existing, True

    tree = Tree(**payload.model_dump())
    db.add(tree)
    db.flush()
    sync_postgis_point(db, tree.id, tree.latitude, tree.longitude)
    return tree, False


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    database.init_db()
    with database.SessionLocal() as db:
        seed_demo_data(db)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_origin_regex=r"https://.*\.onrender\.com",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

    @app.get("/health")
    def healthcheck() -> dict[str, str]:
        return {"status": "ok", "service": "jasylqala-api"}

    @app.get("/api/species", response_model=list[SpeciesOut])
    def list_species() -> list[SpeciesOut]:
        return [
            SpeciesOut(
                id=s.id,
                name_ru=s.name_ru,
                name_kk=s.name_kk,
                latin_name=s.latin_name,
                description=s.description,
            )
            for s in SPECIES_CATALOG
        ]

    @app.get("/api/trees", response_model=TreeFeatureCollection)
    def list_trees(
        species: str | None = Query(default=None),
        condition: str | None = Query(default=None),
        is_demo: bool | None = Query(default=None),
        db: Session = Depends(get_db),
    ) -> TreeFeatureCollection:
        query = db.query(Tree).filter(Tree.deleted_at.is_(None))
        if species:
            query = query.filter(Tree.species == species)
        if condition:
            query = query.filter(Tree.condition == condition)
        if is_demo is not None:
            query = query.filter(Tree.is_demo == is_demo)

        trees = query.order_by(Tree.created_at.desc()).all()
        features = [
            GeoJSONFeature(
                id=t.id,
                geometry=GeoJSONGeometry(coordinates=[t.longitude, t.latitude]),
                properties=TreeOut.model_validate(t),
            )
            for t in trees
        ]
        return TreeFeatureCollection(features=features)

    @app.get("/api/trees/{tree_id}", response_model=TreeDetailOut)
    def get_tree(tree_id: int, db: Session = Depends(get_db)) -> TreeDetailOut:
        return TreeDetailOut.model_validate(_get_live_tree(db, tree_id))

    @app.patch("/api/trees/{tree_id}", response_model=TreeDetailOut)
    def update_tree(tree_id: int, payload: TreeUpdate, db: Session = Depends(get_db)) -> TreeDetailOut:
        tree = _get_live_tree(db, tree_id)
        changes = payload.model_dump(exclude_unset=True)
        # photo_url/notes можно очистить (null); остальные поля в паспорте обязательны
        for field in ("species", "height_m", "condition", "latitude", "longitude"):
            if field in changes and changes[field] is None:
                del changes[field]
        if "species" in changes:
            changes["species"] = changes["species"].strip()
            if len(changes["species"]) < 2:
                raise HTTPException(status_code=422, detail="Название вида слишком короткое")
        if changes.get("notes") is not None:
            changes["notes"] = changes["notes"].strip() or None

        for field, value in changes.items():
            setattr(tree, field, value)
        if "latitude" in changes or "longitude" in changes:
            sync_postgis_point(db, tree.id, tree.latitude, tree.longitude)
        db.commit()
        db.refresh(tree)
        return TreeDetailOut.model_validate(tree)

    @app.delete("/api/trees/{tree_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_tree(tree_id: int, db: Session = Depends(get_db)) -> None:
        """Мягкое удаление: дерево исчезает с карты и из счётчиков, но остаётся в базе."""
        tree = _get_live_tree(db, tree_id)
        tree.deleted_at = datetime.now(timezone.utc)
        db.commit()

    @app.post("/api/trees", response_model=TreeOut, status_code=status.HTTP_201_CREATED)
    def create_tree(payload: TreeCreate, db: Session = Depends(get_db)) -> TreeOut:
        tree, _ = _insert_tree(db, payload)
        db.commit()
        db.refresh(tree)
        return TreeOut.model_validate(tree)

    @app.post("/api/uploads")
    async def upload_photo(
        file: UploadFile = File(...),
        app_settings: Settings = Depends(get_settings),
    ) -> dict[str, str]:
        url = await save_upload(file, app_settings)
        return {"url": url}

    @app.post("/api/trees/{tree_id}/tasks", response_model=CareTaskOut, status_code=status.HTTP_201_CREATED)
    def create_care_task(
        tree_id: int, payload: CareTaskCreate, db: Session = Depends(get_db)
    ) -> CareTaskOut:
        _get_live_tree(db, tree_id)

        task = CareTask(
            tree_id=tree_id,
            task_type=payload.task_type,
            status="pending",
            notes=payload.notes,
            photo_before_url=payload.photo_before_url,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return CareTaskOut.model_validate(task)

    @app.patch("/api/tasks/{task_id}", response_model=CareTaskOut)
    def update_care_task(
        task_id: int, payload: CareTaskUpdate, db: Session = Depends(get_db)
    ) -> CareTaskOut:
        task = db.query(CareTask).filter(CareTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")

        if payload.status is not None:
            task.status = payload.status
            if payload.status == "done" and task.completed_at is None:
                task.completed_at = datetime.now(timezone.utc)
            elif payload.status != "done":
                task.completed_at = None

        if payload.notes is not None:
            task.notes = payload.notes
        if payload.photo_after_url is not None:
            task.photo_after_url = payload.photo_after_url

        # Результат ухода обновляет паспорт; изменение фиксируется в журнале задачи
        tree = task.tree
        log: list[str] = []
        if payload.tree_condition is not None and payload.tree_condition != tree.condition:
            log.append(
                f"Состояние: {CONDITION_LABELS.get(tree.condition, tree.condition)} → "
                f"{CONDITION_LABELS[payload.tree_condition]}"
            )
            tree.condition = payload.tree_condition
        if payload.tree_height_m is not None and payload.tree_height_m != tree.height_m:
            log.append(f"Высота: {tree.height_m:g} → {payload.tree_height_m:g} м")
            tree.height_m = payload.tree_height_m
        if log:
            task.notes = " · ".join(filter(None, [task.notes, *log]))[:1000]

        db.commit()
        db.refresh(task)
        return CareTaskOut.model_validate(task)

    @app.post("/api/predict-species", response_model=PredictResponse)
    async def predict_species(
        file: UploadFile = File(...),
        app_settings: Settings = Depends(get_settings),
    ) -> PredictResponse:
        file_bytes = await file.read()
        validate_and_read_image(file_bytes, file.filename, app_settings.max_upload_size_mb)
        predictions = predict_top3_species(file_bytes)
        return PredictResponse(predictions=predictions, model_version=MODEL_VERSION)

    @app.post("/api/offline-sync", response_model=OfflineSyncResponse)
    def offline_sync(payload: OfflineSyncRequest, db: Session = Depends(get_db)) -> OfflineSyncResponse:
        synced_trees: list[TreeOut] = []
        skipped = 0

        for item in payload.trees:
            tree, was_skipped = _insert_tree(db, item)
            if was_skipped:
                skipped += 1
            synced_trees.append(TreeOut.model_validate(tree))

        db.commit()
        return OfflineSyncResponse(
            synced=len(synced_trees) - skipped,
            skipped_duplicates=skipped,
            trees=synced_trees,
        )

    @app.get("/api/pilot")
    def pilot(db: Session = Depends(get_db)) -> dict:
        """Пилотный квартал: граница (GeoJSON) и прогресс к цели 300 деревьев."""
        return pilot_summary(db)

    @app.get("/api/offline-bundle")
    def offline_bundle(db: Session = Depends(get_db)) -> dict:
        trees = db.query(Tree).filter(Tree.deleted_at.is_(None)).order_by(Tree.created_at.desc()).all()
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "species": [
                {
                    "id": s.id,
                    "name_ru": s.name_ru,
                    "name_kk": s.name_kk,
                    "latin_name": s.latin_name,
                    "description": s.description,
                }
                for s in SPECIES_CATALOG
            ],
            "trees": [TreeOut.model_validate(t).model_dump(mode="json") for t in trees],
            "model_url": "/models/species_weights.json",
        }

    return app


app = create_app()
