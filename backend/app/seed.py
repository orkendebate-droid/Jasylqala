from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.database import sync_postgis_point
from app.models import CareTask, Tree

DEMO_TREES = [
    {
        "client_id": "demo-aktau-001",
        "species": "Карагач (Вяз приземистый)",
        "height_m": 6.5,
        "condition": "good",
        "latitude": 43.6512,
        "longitude": 51.1578,
        "notes": "Демо: 10 мкр, аллея вдоль дороги",
        "is_demo": True,
    },
    {
        "client_id": "demo-aktau-002",
        "species": "Лох узколистный (Джида)",
        "height_m": 4.2,
        "condition": "good",
        "latitude": 43.6485,
        "longitude": 51.1631,
        "notes": "Демо: Набережная, устойчивое дерево",
        "is_demo": True,
    },
    {
        "client_id": "demo-aktau-003",
        "species": "Тамариск (Гребенщик)",
        "height_m": 2.8,
        "condition": "fair",
        "latitude": 43.6540,
        "longitude": 51.1495,
        "notes": "Демо: 1 мкр, требуется санитарная обрезка",
        "is_demo": True,
    },
    {
        "client_id": "demo-aktau-004",
        "species": "Тополь серебристый",
        "height_m": 11.0,
        "condition": "good",
        "latitude": 43.6578,
        "longitude": 51.1662,
        "notes": "Демо: 7 мкр, двор",
        "is_demo": True,
    },
    {
        "client_id": "demo-aktau-005",
        "species": "Ясень пенсильванский",
        "height_m": 7.4,
        "condition": "poor",
        "latitude": 43.6601,
        "longitude": 51.1590,
        "notes": "Демо: 11 мкр, признаки засухи — нужен полив",
        "is_demo": True,
    },
    {
        "client_id": "demo-aktau-006",
        "species": "Акация белая (Робиния)",
        "height_m": 5.6,
        "condition": "good",
        "latitude": 43.6458,
        "longitude": 51.1704,
        "notes": "Демо: 14 мкр, сквер",
        "is_demo": True,
    },
    {
        "client_id": "demo-aktau-007",
        "species": "Тутовник (Шелковица)",
        "height_m": 5.0,
        "condition": "fair",
        "latitude": 43.6531,
        "longitude": 51.1742,
        "notes": "Демо: 12 мкр, полив по графику",
        "is_demo": True,
    },
    {
        "client_id": "demo-aktau-008",
        "species": "Карагач (Вяз приземистый)",
        "height_m": 8.2,
        "condition": "good",
        "latitude": 43.6635,
        "longitude": 51.1532,
        "notes": "Демо: Парк Акбота",
        "is_demo": True,
    },
]


def seed_demo_data(db: Session) -> int:
    existing = db.query(Tree).count()
    if existing > 0:
        return 0

    created_trees: list[Tree] = []
    for item in DEMO_TREES:
        tree = Tree(**item)
        db.add(tree)
        created_trees.append(tree)
    db.flush()

    for tree in created_trees:
        sync_postgis_point(db, tree.id, tree.latitude, tree.longitude)

    # Add demo care tasks to a couple of trees
    if len(created_trees) >= 5:
        db.add(
            CareTask(
                tree_id=created_trees[2].id,
                task_type="pruning",
                status="pending",
                notes="Демо: убрать сухие ветви",
            )
        )
        db.add(
            CareTask(
                tree_id=created_trees[4].id,
                task_type="watering",
                status="pending",
                notes="Демо: срочный полив (состояние: слабое)",
            )
        )
        db.add(
            CareTask(
                tree_id=created_trees[0].id,
                task_type="watering",
                status="done",
                notes="Демо: плановый полив выполнен",
                completed_at=datetime.now(timezone.utc),
            )
        )

    db.commit()
    return len(created_trees)
