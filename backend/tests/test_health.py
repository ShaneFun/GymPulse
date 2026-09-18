def test_home_returns_running_message(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "AI fitness Analyzer API Running"}
