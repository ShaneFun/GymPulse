def test_create_schedule_stores_increments(client, fake_db):
    response = client.post("/schedules", json={
        "program_id": "prog-1",
        "week": 1,
        "exercise_name": "bicep_curl",
        "target_weight": 20.0,
        "target_sets": 3,
        "target_reps": 10,
        "weight_increment": 2.5,
        "rep_increment": 1,
    })

    assert response.status_code == 200
    stored = fake_db.table("schedules").rows[0]
    assert stored["weight_increment"] == 2.5
    assert stored["rep_increment"] == 1


def test_create_schedule_defaults_increments_to_zero(client, fake_db):
    response = client.post("/schedules", json={
        "program_id": "prog-1",
        "week": 1,
        "exercise_name": "squat",
        "target_weight": 0,
        "target_sets": 3,
        "target_reps": 12,
    })

    assert response.status_code == 200
    stored = fake_db.table("schedules").rows[0]
    assert stored["weight_increment"] == 0
    assert stored["rep_increment"] == 0
