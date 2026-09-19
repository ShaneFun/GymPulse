from conftest import TEST_USER_ID


def test_get_profile_creates_an_empty_one_on_first_access(client, fake_db):
    response = client.get("/profile")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == TEST_USER_ID
    # .get, not subscript: the fake has no schema, so an unset column is an
    # absent key here, where real Postgres would return it as NULL.
    assert data.get("display_name") is None
    assert len(fake_db.table("profiles").rows) == 1


def test_get_profile_is_idempotent_on_repeated_first_access(client, fake_db):
    # Regression test for the check-then-insert race: two concurrent
    # first-access calls (e.g. React StrictMode double-invoking an effect)
    # used to both see no row and both try to insert, and the second would
    # hit the primary key and 500. GET /profile now upserts, so calling it
    # twice must not create a second row or error.
    first = client.get("/profile")
    second = client.get("/profile")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["data"]["id"] == TEST_USER_ID
    assert second.json()["data"]["id"] == TEST_USER_ID
    assert len(fake_db.table("profiles").rows) == 1


def test_get_profile_returns_the_existing_row(client, fake_db):
    fake_db.seed("profiles", [{
        "id": TEST_USER_ID, "display_name": "Siang", "phone": None,
        "birth_year": 1998, "avatar_path": None,
    }])

    response = client.get("/profile")

    assert response.json()["data"]["display_name"] == "Siang"
    assert len(fake_db.table("profiles").rows) == 1


def test_put_profile_updates_permitted_fields(client, fake_db):
    fake_db.seed("profiles", [{
        "id": TEST_USER_ID, "display_name": None, "phone": None,
        "birth_year": None, "avatar_path": None,
    }])

    response = client.put("/profile", json={
        "display_name": "Siang",
        "phone": "0123456789",
        "birth_year": 1998,
        "avatar_path": f"{TEST_USER_ID}/avatar.png",
    })

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["display_name"] == "Siang"
    assert data["birth_year"] == 1998


def test_put_profile_rejects_an_implausible_birth_year(client, fake_db):
    response = client.put("/profile", json={"birth_year": 1200})

    assert response.status_code == 422


def test_put_profile_rejects_an_avatar_path_outside_own_folder(client, fake_db):
    fake_db.seed("profiles", [{
        "id": TEST_USER_ID, "display_name": None, "phone": None,
        "birth_year": None, "avatar_path": None,
    }])

    response = client.put("/profile", json={
        "avatar_path": "someone-elses-id/avatar.png",
    })

    assert response.status_code == 400
    assert "own folder" in response.json()["detail"]
    # Rejected before it ever reached the table.
    assert fake_db.table("profiles").rows[0]["avatar_path"] is None


def test_put_profile_accepts_an_avatar_path_inside_own_folder(client, fake_db):
    fake_db.seed("profiles", [{
        "id": TEST_USER_ID, "display_name": None, "phone": None,
        "birth_year": None, "avatar_path": None,
    }])

    response = client.put("/profile", json={
        "avatar_path": f"{TEST_USER_ID}/avatar.png",
    })

    assert response.status_code == 200
    assert response.json()["data"]["avatar_path"] == f"{TEST_USER_ID}/avatar.png"
