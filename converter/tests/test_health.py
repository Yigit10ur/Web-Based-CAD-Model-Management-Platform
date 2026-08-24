from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_reports_occt_state():
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"ready", "occt", "detail"}
    assert isinstance(body["occt"], bool)
