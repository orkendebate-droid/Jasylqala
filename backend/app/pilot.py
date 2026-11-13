"""Пилотный квартал Актау.

Кейс: «Пилот — 1 квартал, 300 деревьев». Для пилота выбран 10 микрорайон —
жилой квартал в центре города с большой зелёной зоной.

Граница взята из OpenStreetMap (way 327567974, place=neighbourhood «10 шағын аудан»,
© участники OpenStreetMap, ODbL). Если пилот решено проводить в другом квартале —
замените полигон здесь и во frontend/src/pilot.ts (файлы должны совпадать).
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import CareTask, Tree

PILOT_ID = "aktau-mkr-10"
PILOT_NAME = "10 микрорайон"
PILOT_TARGET_TREES = 300

# [lon, lat], замкнутое кольцо (первая точка = последняя), WGS84
PILOT_POLYGON: list[list[float]] = [
    [51.1527922, 43.6522557],
    [51.152801, 43.6521838],
    [51.1528361, 43.6520896],
    [51.1532948, 43.6516217],
    [51.154879, 43.65006],
    [51.1558741, 43.6490341],
    [51.1560377, 43.6489361],
    [51.1567354, 43.6482205],
    [51.1567646, 43.6481481],
    [51.1569631, 43.647955],
    [51.1570637, 43.6479171],
    [51.1571374, 43.6479152],
    [51.1572112, 43.6479356],
    [51.1573091, 43.647986],
    [51.1577914, 43.6482338],
    [51.1581521, 43.6483773],
    [51.1584877, 43.6484453],
    [51.1588293, 43.6484618],
    [51.1605235, 43.6484414],
    [51.1618482, 43.6484608],
    [51.1622294, 43.6484665],
    [51.1624972, 43.6484705],
    [51.1631515, 43.6485059],
    [51.1635943, 43.6486025],
    [51.1640327, 43.6487281],
    [51.1658569, 43.6496775],
    [51.1663007, 43.6499348],
    [51.1664106, 43.6500523],
    [51.1664455, 43.6502289],
    [51.1664669, 43.6505976],
    [51.1638384, 43.6533107],
    [51.162862, 43.6527712],
    [51.1613211, 43.6542073],
    [51.159355, 43.6532214],
    [51.1583573, 43.6528993],
    [51.1573702, 43.6527518],
    [51.1556245, 43.6526376],
    [51.1531913, 43.6524625],
    [51.1530403, 43.6524488],
    [51.1529449, 43.6524112],
    [51.1528311, 43.6523246],
    [51.1527922, 43.6522557],
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
                "WHERE deleted_at IS NULL "
                "AND ST_Contains(ST_GeomFromText(:wkt, 4326), geom)"
            ),
            {"wkt": _polygon_wkt()},
        )
        return [r[0] for r in rows]
    return [
        tree_id
        for tree_id, lat, lon in db.query(Tree.id, Tree.latitude, Tree.longitude).filter(
            Tree.deleted_at.is_(None)
        )
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
