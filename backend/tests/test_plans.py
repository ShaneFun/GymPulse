from conftest import TEST_USER_ID

PLAN = {
    "name": "Push Day",
    "exercise_rest_seconds": 150,
    "exercises": [
        {
            "exercise_name": "bicep_curl", "target_sets": 3, "target_reps": 10,
            "target_weight": 20.0, "rest_seconds": 90,
            "weight_increment": 2.5, "rep_increment": 0,
        },
        {
            "exercise_name": "overhead_press", "target_sets": 4, "target_reps": 8,
            "target_weight": 30.0, "rest_seconds": 120,
            "weight_increment": 0, "rep_increment": 1,
        },
    ],
}


def test_create_plan_makes_a_program_and_one_schedule_per_exercise(client, fake_db):
    response = client.post("/plans", json=PLAN)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["program"]["name"] == "Push Day"
    assert data["program"]["user_id"] == TEST_USER_ID
    assert data["program"]["exercise_rest_seconds"] == 150
    assert len(data["schedules"]) == 2
    assert len(fake_db.table("programs").rows) == 1
    assert len(fake_db.table("schedules").rows) == 2


def test_create_plan_ignores_user_id_in_body(client, fake_db):
    """Ownership comes from the token, never from client input."""
    response = client.post("/plans", json={**PLAN, "user_id": "someone-else"})

    assert response.status_code == 200
    assert fake_db.table("programs").rows[0]["user_id"] == TEST_USER_ID


def test_create_plan_puts_every_exercise_on_week_one(client, fake_db):
    client.post("/plans", json=PLAN)

    weeks = {s["week"] for s in fake_db.table("schedules").rows}
    assert weeks == {1}


def test_create_plan_keeps_each_exercises_own_settings(client, fake_db):
    client.post("/plans", json=PLAN)

    rows = {s["exercise_name"]: s for s in fake_db.table("schedules").rows}
    assert rows["bicep_curl"]["rest_seconds"] == 90
    assert rows["bicep_curl"]["weight_increment"] == 2.5
    assert rows["overhead_press"]["rest_seconds"] == 120
    assert rows["overhead_press"]["rep_increment"] == 1


def test_create_plan_links_every_schedule_to_the_new_program(client, fake_db):
    client.post("/plans", json=PLAN)

    program_id = fake_db.table("programs").rows[0]["id"]
    assert all(s["program_id"] == program_id for s in fake_db.table("schedules").rows)


def test_create_plan_rejects_an_empty_exercise_list(client, fake_db):
    response = client.post("/plans", json={"name": "Empty", "exercises": []})

    assert response.status_code == 422
    assert fake_db.table("programs").rows == []


def test_create_plan_defaults_exercise_rest_seconds_to_180(client, fake_db):
    plan = {
        "name": "No Rest Specified",
        "exercises": PLAN["exercises"],
    }

    response = client.post("/plans", json=plan)

    assert response.status_code == 200
    assert response.json()["data"]["program"]["exercise_rest_seconds"] == 180


def test_create_plan_rejects_a_negative_exercise_rest_seconds(client, fake_db):
    plan = {
        "name": "Negative Rest",
        "exercise_rest_seconds": -1,
        "exercises": PLAN["exercises"],
    }

    response = client.post("/plans", json=plan)

    assert response.status_code == 422
    assert fake_db.table("programs").rows == []


def test_create_plan_removes_the_program_if_an_exercise_fails(client, fake_db, monkeypatch):
    """A half-built plan is worse than none: neither table may retain a row.

    The second insert fails, not the first, so cleanup has to remove a
    schedule row that already references the program -- the case that
    actually happens in production.
    """
    original_table = fake_db.table
    calls = {"n": 0}

    def explode_on_second_schedule_insert(name):
        table = original_table(name)
        if name == "schedules":
            real_insert = table.insert

            def maybe_boom(row):
                calls["n"] += 1
                if calls["n"] >= 2:
                    raise RuntimeError("insert failed")
                return real_insert(row)

            table.insert = maybe_boom
        return table

    monkeypatch.setattr(fake_db, "table", explode_on_second_schedule_insert)

    response = client.post("/plans", json=PLAN)

    assert response.status_code >= 400
    assert calls["n"] == 2, "the first insert should have succeeded"
    assert original_table("programs").rows == []
    assert original_table("schedules").rows == []
