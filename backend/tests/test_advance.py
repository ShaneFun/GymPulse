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

    source = [r for r in fake_db.table("schedules").rows if r["id"] == "sched-1"][0]
    assert source["week"] == 1
    assert source["target_weight"] == 20.0


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

    assert response.status_code == 200
    created = response.json()["data"]
    assert created["target_weight"] == 0
    assert created["target_reps"] == 17


def test_advance_treats_missing_increments_as_zero(client, fake_db):
    """Increments read as None when the migration hasn't been applied yet."""
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 3,
        "exercise_name": "situp", "target_weight": 0,
        "target_sets": 3, "target_reps": 20,
        "weight_increment": None, "rep_increment": None,
    }])

    response = client.post("/schedules/sched-1/advance")

    assert response.status_code == 200
    created = response.json()["data"]
    assert created["week"] == 4
    assert created["target_reps"] == 20
    assert created["weight_increment"] == 0
    assert created["rep_increment"] == 0


def test_advance_404_when_schedule_missing(client, fake_db):
    response = client.post("/schedules/does-not-exist/advance")

    assert response.status_code == 404
    # Distinguishes the endpoint's own 404 from Starlette's route-not-found,
    # whose detail is "Not Found".
    assert response.json()["detail"] == "Schedule not found."
    assert fake_db.table("schedules").rows == []


def test_advance_ignores_another_programs_next_week(client, fake_db):
    fake_db.seed("schedules", [
        {
            "id": "sched-1", "program_id": "prog-1", "week": 1,
            "exercise_name": "bicep_curl", "target_weight": 20.0,
            "target_sets": 3, "target_reps": 10,
            "weight_increment": 2.5, "rep_increment": 0,
        },
        {
            "id": "other-prog-week-2", "program_id": "prog-2", "week": 2,
            "exercise_name": "bicep_curl", "target_weight": 99.0,
            "target_sets": 9, "target_reps": 99,
            "weight_increment": 0, "rep_increment": 0,
        },
    ])

    response = client.post("/schedules/sched-1/advance")

    assert response.status_code == 200
    created = response.json()["data"]
    assert created["program_id"] == "prog-1"
    assert created["target_weight"] == 22.5
    assert created["id"] != "other-prog-week-2"
    assert len(fake_db.table("schedules").rows) == 3


def test_advance_can_be_chained_across_weeks(client, fake_db):
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 1,
        "exercise_name": "bicep_curl", "target_weight": 20.0,
        "target_sets": 3, "target_reps": 10,
        "weight_increment": 2.5, "rep_increment": 1,
    }])

    week_2 = client.post("/schedules/sched-1/advance").json()["data"]
    week_3 = client.post(f"/schedules/{week_2['id']}/advance").json()["data"]

    assert week_3["week"] == 3
    assert week_3["target_weight"] == 25.0
    assert week_3["target_reps"] == 12
    assert week_3["weight_increment"] == 2.5
    assert len(fake_db.table("schedules").rows) == 3


def test_advance_carries_rest_seconds_forward(client, fake_db):
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 1,
        "exercise_name": "squat", "target_weight": 0,
        "target_sets": 3, "target_reps": 12,
        "weight_increment": 0, "rep_increment": 1, "rest_seconds": 120,
    }])

    created = client.post("/schedules/sched-1/advance").json()["data"]

    assert created["rest_seconds"] == 120


def test_advance_two_exercises_in_same_program_and_week_produces_two_week_two_rows(client, fake_db):
    """The one behaviour the whole multi-exercise feature depends on from an
    endpoint nobody modified: advancing each exercise in a plan must produce
    its own week-2 row, not one shared row and not one overwriting the other.
    """
    fake_db.seed("schedules", [
        {
            "id": "sched-1", "program_id": "prog-1", "week": 1,
            "exercise_name": "bicep_curl", "target_weight": 20.0,
            "target_sets": 3, "target_reps": 10,
            "weight_increment": 2.5, "rep_increment": 0,
        },
        {
            "id": "sched-2", "program_id": "prog-1", "week": 1,
            "exercise_name": "overhead_press", "target_weight": 30.0,
            "target_sets": 4, "target_reps": 8,
            "weight_increment": 0, "rep_increment": 1,
        },
    ])

    first = client.post("/schedules/sched-1/advance")
    second = client.post("/schedules/sched-2/advance")

    assert first.status_code == 200
    assert second.status_code == 200
    first_created = first.json()["data"]
    second_created = second.json()["data"]

    assert first_created["id"] != second_created["id"]
    assert first_created["week"] == 2
    assert second_created["week"] == 2
    assert first_created["exercise_name"] == "bicep_curl"
    assert second_created["exercise_name"] == "overhead_press"

    week_2_rows = [
        r for r in fake_db.table("schedules").rows
        if r["program_id"] == "prog-1" and r["week"] == 2
    ]
    assert len(week_2_rows) == 2
    assert {r["exercise_name"] for r in week_2_rows} == {"bicep_curl", "overhead_press"}


def test_advance_defaults_rest_when_missing(client, fake_db):
    """Rows predating the rest_seconds column read back as None."""
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 1,
        "exercise_name": "squat", "target_weight": 0,
        "target_sets": 3, "target_reps": 12,
        "weight_increment": 0, "rep_increment": 1, "rest_seconds": None,
    }])

    created = client.post("/schedules/sched-1/advance").json()["data"]

    assert created["rest_seconds"] == 90
