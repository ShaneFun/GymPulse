from conftest import TEST_USER_ID


def test_create_program_stamps_user_id_from_token(client, fake_db):
    response = client.post("/programs", json={"name": "Leg Day"})

    assert response.status_code == 200
    stored = fake_db.table("programs").rows[0]
    assert stored["user_id"] == TEST_USER_ID


def test_create_program_ignores_user_id_in_body(client, fake_db):
    """Ownership comes from the token, never from client input."""
    response = client.post("/programs", json={"name": "Leg Day", "user_id": "someone-else"})

    assert response.status_code == 200
    stored = fake_db.table("programs").rows[0]
    assert stored["user_id"] == TEST_USER_ID
