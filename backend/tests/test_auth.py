def test_missing_authorization_header_is_401(anon_client):
    response = anon_client.get("/programs")

    assert response.status_code == 401


def test_malformed_authorization_header_is_401(anon_client):
    response = anon_client.get("/programs", headers={"Authorization": "nonsense"})

    assert response.status_code == 401


def test_health_endpoint_needs_no_auth(anon_client):
    response = anon_client.get("/")

    assert response.status_code == 200
