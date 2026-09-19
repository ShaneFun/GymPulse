from conftest import TEST_USER_ID


def test_planning_a_day_stores_it_for_the_caller(client, fake_db):
    response = client.post("/planned-days", json={"day": "2026-09-22"})

    assert response.status_code == 200
    stored = fake_db.table("planned_days").rows[0]
    assert stored["day"] == "2026-09-22"
    assert stored["user_id"] == TEST_USER_ID


def test_planning_the_same_day_twice_does_not_duplicate(client, fake_db):
    client.post("/planned-days", json={"day": "2026-09-22"})
    response = client.post("/planned-days", json={"day": "2026-09-22"})

    assert response.status_code == 200
    assert len(fake_db.table("planned_days").rows) == 1


def test_listing_returns_only_the_callers_days(client, fake_db):
    fake_db.seed("planned_days", [
        {"id": "p1", "user_id": TEST_USER_ID, "day": "2026-09-22"},
        {"id": "p2", "user_id": "someone-else", "day": "2026-09-23"},
    ])

    days = client.get("/planned-days").json()["data"]

    assert [d["day"] for d in days] == ["2026-09-22"]


def test_unplanning_removes_the_day(client, fake_db):
    fake_db.seed("planned_days", [
        {"id": "p1", "user_id": TEST_USER_ID, "day": "2026-09-22"},
    ])

    response = client.delete("/planned-days/2026-09-22")

    assert response.status_code == 200
    assert fake_db.table("planned_days").rows == []


def test_unplanning_a_day_that_was_never_planned_is_not_an_error(client, fake_db):
    """The caller wanted it gone and it is gone — that is success."""
    response = client.delete("/planned-days/2026-09-22")

    assert response.status_code == 200


def test_unplanning_leaves_another_users_day_alone(client, fake_db):
    fake_db.seed("planned_days", [
        {"id": "p2", "user_id": "someone-else", "day": "2026-09-22"},
    ])

    client.delete("/planned-days/2026-09-22")

    assert len(fake_db.table("planned_days").rows) == 1
