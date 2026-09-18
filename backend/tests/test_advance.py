def test_advance_creates_next_week_with_increments(client, fake_db):
    fake_db.seed("schedules", [{
        "id": "sched-1",
        "program_id": "prog-1",
        "week": 1,
        "exercise_name": "bicep_curl",
        "target_weight": 20.0,
        "target_sets": 3,
        "target_reps": 10,
        "weight_increment": 2.5,
        "rep_increment": 1,
    }])

    response = client.post("/schedules/sched-1/advance")

    assert response.status_code == 200
    created = response.json()["data"]
    assert created["week"] == 2
    assert created["target_weight"] == 22.5
    assert created["target_reps"] == 11
    assert created["target_sets"] == 3
    assert created["exercise_name"] == "bicep_curl"
    assert created["program_id"] == "prog-1"
    # Increments carry forward so the chain can keep progressing.
    assert created["weight_increment"] == 2.5
    assert created["rep_increment"] == 1
    assert len(fake_db.table("schedules").rows) == 2


def test_advance_returns_existing_next_week_without_duplicating(client, fake_db):
    fake_db.seed("schedules", [
        {
            "id": "sched-1", "program_id": "prog-1", "week": 1,
            "exercise_name": "squat", "target_weight": 0,
            "target_sets": 3, "target_reps": 12,
            "weight_increment": 0, "rep_increment": 2,
        },
        {
            "id": "sched-2", "program_id": "prog-1", "week": 2,
            "exercise_name": "squat", "target_weight": 0,
            "target_sets": 3, "target_reps": 14,
            "weight_increment": 0, "rep_increment": 2,
        },
    ])

    response = client.post("/schedules/sched-1/advance")

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "sched-2"
    assert len(fake_db.table("schedules").rows) == 2


def test_advance_applies_only_the_nonzero_increment(client, fake_db):
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 1,
        "exercise_name": "pushup", "target_weight": 0,
        "target_sets": 4, "target_reps": 15,
        "weight_increment": 0, "rep_increment": 2,
    }])

    response = client.post("/schedules/sched-1/advance")

    created = response.json()["data"]
    assert created["target_weight"] == 0
    assert created["target_reps"] == 17


def test_advance_treats_missing_increments_as_zero(client, fake_db):
    """Rows created before the increment columns existed read back as None."""
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 3,
        "exercise_name": "situp", "target_weight": 0,
        "target_sets": 3, "target_reps": 20,
        "weight_increment": None, "rep_increment": None,
    }])

    response = client.post("/schedules/sched-1/advance")

    created = response.json()["data"]
    assert created["week"] == 4
    assert created["target_reps"] == 20
    assert created["weight_increment"] == 0
    assert created["rep_increment"] == 0


def test_advance_404_when_schedule_missing(client, fake_db):
    response = client.post("/schedules/does-not-exist/advance")

    assert response.status_code == 404
