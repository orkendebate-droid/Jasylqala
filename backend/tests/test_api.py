from app.seed import seed_demo_data
from tests.conftest import make_test_image_bytes


def test_healthcheck(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_list_species_returns_7_species(client):
    resp = client.get("/api/species")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 7
    assert all("name_ru" in s and "latin_name" in s for s in data)


def test_create_and_get_tree_geojson(client):
    payload = {
        "species": "Карагач (Вяз приземистый)",
        "height_m": 5.4,
        "condition": "good",
        "latitude": 43.6515,
        "longitude": 51.1582,
        "notes": "Посажено у входа",
        "is_demo": False,
    }
    create_resp = client.post("/api/trees", json=payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["species"] == payload["species"]
    assert created["is_demo"] is False

    geo_resp = client.get("/api/trees", params={"is_demo": "false"})
    assert geo_resp.status_code == 200
    fc = geo_resp.json()
    assert fc["type"] == "FeatureCollection"
    assert any(f["id"] == created["id"] for f in fc["features"])
    feature = next(f for f in fc["features"] if f["id"] == created["id"])
    assert feature["geometry"]["type"] == "Point"
    assert feature["geometry"]["coordinates"] == [51.1582, 43.6515]

    detail_resp = client.get(f"/api/trees/{created['id']}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["notes"] == "Посажено у входа"
    assert detail_resp.json()["tasks"] == []


def test_tree_validation_rejects_bad_coords_and_height(client):
    bad_lat = client.post(
        "/api/trees",
        json={
            "species": "Карагач",
            "height_m": 4.0,
            "condition": "good",
            "latitude": 120.0,
            "longitude": 51.15,
        },
    )
    assert bad_lat.status_code == 422

    bad_height = client.post(
        "/api/trees",
        json={
            "species": "Карагач",
            "height_m": -2.0,
            "condition": "good",
            "latitude": 43.65,
            "longitude": 51.15,
        },
    )
    assert bad_height.status_code == 422

    bad_condition = client.post(
        "/api/trees",
        json={
            "species": "Карагач",
            "height_m": 4.0,
            "condition": "unknown",
            "latitude": 43.65,
            "longitude": 51.15,
        },
    )
    assert bad_condition.status_code == 422

    blank_species = client.post(
        "/api/trees",
        json={
            "species": "    ",
            "height_m": 4.0,
            "condition": "good",
            "latitude": 43.65,
            "longitude": 51.15,
        },
    )
    assert blank_species.status_code == 422


def test_get_missing_tree_returns_404(client):
    resp = client.get("/api/trees/999999")
    assert resp.status_code == 404


def test_upload_valid_and_invalid_images(client):
    img_bytes = make_test_image_bytes()
    resp = client.post(
        "/api/uploads",
        files={"file": ("tree.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 200
    assert resp.json()["url"].startswith("/uploads/")

    bad_resp = client.post(
        "/api/uploads",
        files={"file": ("malware.png", b"not-an-image", "image/png")},
    )
    assert bad_resp.status_code == 400

    empty_resp = client.post(
        "/api/uploads",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert empty_resp.status_code == 400


def test_care_task_lifecycle(client):
    tree = client.post(
        "/api/trees",
        json={
            "species": "Тамариск (Гребенщик)",
            "height_m": 3.0,
            "condition": "fair",
            "latitude": 43.65,
            "longitude": 51.16,
        },
    ).json()

    task_resp = client.post(
        f"/api/trees/{tree['id']}/tasks",
        json={
            "task_type": "watering",
            "notes": "Полив 20л",
            "photo_before_url": "/uploads/before.jpg",
        },
    )
    assert task_resp.status_code == 201
    task = task_resp.json()
    assert task["status"] == "pending"
    assert task["completed_at"] is None

    done_resp = client.patch(
        f"/api/tasks/{task['id']}",
        json={"status": "done", "photo_after_url": "/uploads/after.jpg"},
    )
    assert done_resp.status_code == 200
    done_task = done_resp.json()
    assert done_task["status"] == "done"
    assert done_task["photo_after_url"] == "/uploads/after.jpg"
    assert done_task["completed_at"] is not None

    detail = client.get(f"/api/trees/{tree['id']}").json()
    assert len(detail["tasks"]) == 1


def test_predict_species_returns_top3_probabilities(client):
    img_bytes = make_test_image_bytes(color=(35, 130, 50))
    resp = client.post(
        "/api/predict-species",
        files={"file": ("leaf.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    preds = data["predictions"]
    assert len(preds) == 3
    probs = [p["probability"] for p in preds]
    assert probs == sorted(probs, reverse=True)
    assert all(0.0 <= p <= 1.0 for p in probs)


def test_offline_sync_is_idempotent(client):
    batch = {
        "trees": [
            {
                "client_id": "offline-uuid-1",
                "species": "Лох узколистный (Джида)",
                "height_m": 4.1,
                "condition": "good",
                "latitude": 43.652,
                "longitude": 51.161,
            },
            {
                "client_id": "offline-uuid-2",
                "species": "Тутовник (Шелковица)",
                "height_m": 5.2,
                "condition": "fair",
                "latitude": 43.653,
                "longitude": 51.162,
            },
        ]
    }
    first = client.post("/api/offline-sync", json=batch)
    assert first.status_code == 200
    assert first.json()["synced"] == 2
    assert first.json()["skipped_duplicates"] == 0

    # Retry same batch (e.g. flaky mobile connection)
    second = client.post("/api/offline-sync", json=batch)
    assert second.status_code == 200
    assert second.json()["synced"] == 0
    assert second.json()["skipped_duplicates"] == 2


def test_offline_bundle_endpoint(client):
    resp = client.get("/api/offline-bundle")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["species"]) == 7
    assert "trees" in data
    assert data["model_url"] == "/models/species_weights.json"


def test_seeded_demo_trees_and_filters(client):
    with client.session_factory() as db:
        inserted = seed_demo_data(db)
        assert inserted == 8

    resp = client.get("/api/trees", params={"is_demo": "true"})
    assert resp.status_code == 200
    features = resp.json()["features"]
    assert len(features) == 8
    assert all(f["properties"]["is_demo"] is True for f in features)

    poor_resp = client.get("/api/trees", params={"condition": "poor"})
    assert poor_resp.status_code == 200
    poor_features = poor_resp.json()["features"]
    assert len(poor_features) >= 1
    assert all(f["properties"]["condition"] == "poor" for f in poor_features)

