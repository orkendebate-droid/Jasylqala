"""Пилотный квартал Актау.

Кейс: «Пилот — 1 квартал, 300 деревьев». Для пилота выбран 4 микрорайон —
старый жилой квартал в центре, рядом с морем, с большим числом взрослых деревьев
и арыков, т.е. типичная для Актау застройка.

ГРАНИЦЫ ПРИБЛИЗИТЕЛЬНЫЕ. Перед выездом сверьте полигон с реальной
местностью (например, обведите квартал на geojson.io) и замените координаты.
Тот же полигон продублирован во frontend/src/pilot.ts — меняйте оба файла.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import CareTask, Tree

PILOT_ID = "aktau-mkr-4"
PILOT_NAME = "4 микрорайон"
PILOT_TARGET_TREES = 300

# [lon, lat], замкнутое кольцо (первая точка = последняя), WGS84
PILOT_POLYGON: list[list[float]] = [
    [51.1530, 43.6545],
    [51.1625, 43.6545],
    [51.1625, 43.6485],
    [51.1530, 43.6485],
    [51.1530, 43.6545],
]


def point_in_pilot(lat: float, lon: float) -> bool:
    """Ray casting: работает без PostGIS (SQLite, тесты, офлайн-логика)."""
    inside = False
    ring = PILOT_POLYGON
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        if (y1 > lat) != (y2 > lat):
            x_cross = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < x_cross:
                inside = not inside
    return inside


def _polygon_wkt() -> str:
    return "POLYGON((" + ", ".join(f"{lon} {lat}" for lon, lat in PILOT_POLYGON) + "))"


def pilot_tree_ids(db: Session) -> list[int]:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        rows = db.execute(
            text(
                "SELECT id FROM trees "
                "WHERE ST_Contains(ST_GeomFromText(:wkt, 4326), geom)"
            ),
            {"wkt": _polygon_wkt()},
        )
        return [r[0] for r in rows]
    return [
        tree_id
        for tree_id, lat, lon in db.query(Tree.id, Tree.latitude, Tree.longitude)
        if point_in_pilot(lat, lon)
    ]


def pilot_summary(db: Session) -> dict:
    ids = pilot_tree_ids(db)
    trees = db.query(Tree).filter(Tree.id.in_(ids)).all() if ids else []

    by_species: dict[str, int] = {}
    by_condition = {"good": 0, "fair": 0, "poor": 0}
    real = 0
    for t in trees:
        by_species[t.species] = by_species.get(t.species, 0) + 1
        by_condition[t.condition] = by_condition.get(t.condition, 0) + 1
        if not t.is_demo:
            real += 1

    open_tasks = (
        db.query(CareTask)
        .filter(CareTask.tree_id.in_(ids), CareTask.status != "done")
        .count()
        if ids
        else 0
    )

    return {
        "id": PILOT_ID,
        "name": PILOT_NAME,
        "target_trees": PILOT_TARGET_TREES,
        "trees_total": len(trees),
        "trees_real": real,
        "progress": round(min(real / PILOT_TARGET_TREES, 1.0), 4),
        "by_species": dict(sorted(by_species.items(), key=lambda kv: -kv[1])),
        "by_condition": by_condition,
        "open_tasks": open_tasks,
        "boundary": {
            "type": "Feature",
            "properties": {"id": PILOT_ID, "name": PILOT_NAME},
            "geometry": {"type": "Polygon", "coordinates": [PILOT_POLYGON]},
        },
    }
