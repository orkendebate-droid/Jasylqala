from sqlalchemy import create_engine, inspect, text

from app.database import init_db

TREE = {
    "species": "Карагач (Вяз приземистый)",
    "height_m": 5,
    "condition": "poor",
    "latitude": 43.6515,
    "longitude": 51.1580,
    "is_demo": False,
}


def _create(client, **over) -> dict:
    resp = client.post("/api/trees", json={**TREE, **over})
    assert resp.status_code == 201
    return resp.json()


def test_patch_tree_fixes_only_sent_fields(client):
    tree = _create(client, notes="у подъезда")
    resp = client.patch(f"/api/trees/{tree['id']}", json={"species": "Тутовник (Шелковица)", "height_m": 6.5})
    assert resp.status_code == 200
    data = resp.json()
    assert data["species"] == "Тутовник (Шелковица)"
    assert data["height_m"] == 6.5
    assert data["condition"] == "poor"
    assert data["notes"] == "у подъезда"
    assert data["latitude"] == TREE["latitude"]


def test_patch_tree_moves_point_and_validates(client):
    tree = _create(client)
    moved = client.patch(f"/api/trees/{tree['id']}", json={"latitude": 43.6520, "longitude": 51.1590})
    assert moved.json()["latitude"] == 43.6520
    assert client.patch(f"/api/trees/{tree['id']}", json={"height_m": -1}).status_code == 422
    assert client.patch(f"/api/trees/{tree['id']}", json={"condition": "dead"}).status_code == 422
    assert client.patch("/api/trees/999999", json={"height_m": 3}).status_code == 404


def test_delete_is_soft_and_hides_tree_everywhere(client):
    tree = _create(client)
    before = client.get("/api/pilot").json()["trees_real"]

    assert client.delete(f"/api/trees/{tree['id']}").status_code == 204

    assert client.get(f"/api/trees/{tree['id']}").status_code == 404
    ids = [f["id"] for f in client.get("/api/trees").json()["features"]]
    assert tree["id"] not in ids
    assert tree["id"] not in [t["id"] for t in client.get("/api/offline-bundle").json()["trees"]]
    assert client.get("/api/pilot").json()["trees_real"] == before - 1
    assert client.delete(f"/api/trees/{tree['id']}").status_code == 404

    # Запись осталась в базе
    with client.session_factory() as db:
        row = db.execute(text("SELECT deleted_at FROM trees WHERE id = :id"), {"id": tree["id"]}).one()
        assert row[0] is not None


def test_closing_inspection_updates_passport_and_logs_change(client):
    tree = _create(client)
    task = client.post(f"/api/trees/{tree['id']}/tasks", json={"task_type": "inspection", "notes": "плановый"}).json()

    resp = client.patch(
        f"/api/tasks/{task['id']}",
        json={"status": "done", "tree_condition": "good", "tree_height_m": 5.5},
    )
    assert resp.status_code == 200
    notes = resp.json()["notes"]
    assert "плановый" in notes
    assert "слабое → хорошее" in notes
    assert "5 → 5.5 м" in notes

    updated = client.get(f"/api/trees/{tree['id']}").json()
    assert updated["condition"] == "good"
    assert updated["height_m"] == 5.5


def test_closing_task_without_result_keeps_passport(client):
    tree = _create(client)
    task = client.post(f"/api/trees/{tree['id']}/tasks", json={"task_type": "watering"}).json()
    resp = client.patch(f"/api/tasks/{task['id']}", json={"status": "done", "tree_condition": "poor"})
    assert resp.json()["notes"] is None  # состояние не изменилось — в журнал ничего не пишем
    assert client.get(f"/api/trees/{tree['id']}").json()["condition"] == "poor"


def test_init_db_adds_deleted_at_to_existing_table(tmp_path):
    """База на Render уже создана без deleted_at — init_db должен добавить колонку сам."""
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE trees (id INTEGER PRIMARY KEY, client_id VARCHAR(64), species VARCHAR(120) NOT NULL, "
                "height_m FLOAT NOT NULL, condition VARCHAR(20) NOT NULL, latitude FLOAT NOT NULL, "
                "longitude FLOAT NOT NULL, photo_url VARCHAR(500), notes TEXT, is_demo BOOLEAN NOT NULL, "
                "created_at DATETIME NOT NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO trees (species, height_m, condition, latitude, longitude, is_demo, created_at) "
                "VALUES ('Карагач', 5, 'good', 43.65, 51.15, 0, '2026-11-01 00:00:00')"
            )
        )

    init_db(engine)
    init_db(engine)  # повторный запуск безопасен

    assert "deleted_at" in {c["name"] for c in inspect(engine).get_columns("trees")}
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM trees WHERE deleted_at IS NULL")).scalar() == 1
    engine.dispose()
