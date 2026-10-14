from conftest import TEST_USER_ID

PLAN = {
    "name": "Push Day",
    "exercise_rest_seconds": 150,
    "exercises": [
        {"exercise_name": "bicep_curl", "target_sets": 3, "target_reps": 10,
         "target_weight": 20.0, "rest_seconds": 90,
         "weight_increment": 2.5, "rep_increment": 0},
    ],
}


def seed_plan(fake_db):
    fake_db.seed("programs", [
        {"id": "prog-1", "name": "Old name", "user_id": TEST_USER_ID,
         "exercise_rest_seconds": 180},
    ])
    fake_db.seed("schedules", [
        {"id": "sched-1", "program_id": "prog-1", "week": 1,
         "exercise_name": "bicep_curl", "target_weight": 10.0,
         "target_sets": 3, "target_reps": 8, "rest_seconds": 60,
         "weight_increment": 0, "rep_increment": 0},
        {"id": "sched-2", "program_id": "prog-1", "week": 1,
         "exercise_name": "squat", "target_weight": 40.0,
         "target_sets": 4, "target_reps": 8, "rest_seconds": 120,
         "weight_increment": 0, "rep_increment": 0},
    ])


def test_editing_renames_the_plan_and_updates_rest(client, fake_db):
    seed_plan(fake_db)

    response = client.put("/plans/prog-1", json=PLAN)

    assert response.status_code == 200
    program = fake_db.table("programs").rows[0]
    assert program["name"] == "Push Day"
    assert program["exercise_rest_seconds"] == 150


def test_editing_updates_a_kept_exercises_targets(client, fake_db):
    seed_plan(fake_db)

    client.put("/plans/prog-1", json=PLAN)

    curl = [s for s in fake_db.table("schedules").rows if s["exercise_name"] == "bicep_curl"][0]
    assert curl["target_reps"] == 10
    assert curl["target_weight"] == 20.0
    assert curl["rest_seconds"] == 90


def test_editing_removes_an_exercise_left_out_of_the_list(client, fake_db):
    seed_plan(fake_db)

    client.put("/plans/prog-1", json=PLAN)

    names = {s["exercise_name"] for s in fake_db.table("schedules").rows}
    assert names == {"bicep_curl"}


def test_editing_adds_a_new_exercise(client, fake_db):
    seed_plan(fake_db)
    payload = {**PLAN, "exercises": PLAN["exercises"] + [
        {"exercise_name": "pushup", "target_sets": 3, "target_reps": 15,
         "target_weight": 0, "rest_seconds": 60,
         "weight_increment": 0, "rep_increment": 1},
    ]}

    client.put("/plans/prog-1", json=payload)

    names = {s["exercise_name"] for s in fake_db.table("schedules").rows}
    assert names == {"bicep_curl", "pushup"}


def test_editing_updates_every_week_of_a_progressed_plan(client, fake_db):
    """A plan on week 2 must not end up edited on week 1 and stale on week 2."""
    seed_plan(fake_db)
    fake_db.seed("schedules", [
        {"id": "sched-3", "program_id": "prog-1", "week": 2,
         "exercise_name": "bicep_curl", "target_weight": 12.5,
         "target_sets": 3, "target_reps": 8, "rest_seconds": 60,
         "weight_increment": 0, "rep_increment": 0},
    ])

    client.put("/plans/prog-1", json=PLAN)

    curls = [s for s in fake_db.table("schedules").rows if s["exercise_name"] == "bicep_curl"]
    assert len(curls) == 2
    assert all(c["target_reps"] == 10 for c in curls)


def test_editing_another_users_plan_is_404(client, fake_db):
    fake_db.seed("programs", [
        {"id": "prog-2", "name": "Theirs", "user_id": "someone-else"},
    ])

    response = client.put("/plans/prog-2", json=PLAN)

    assert response.status_code == 404
    assert fake_db.table("programs").rows[0]["name"] == "Theirs"


def test_deleting_removes_the_plan_and_all_its_schedules(client, fake_db):
    seed_plan(fake_db)

    response = client.delete("/plans/prog-1")

    assert response.status_code == 200
    assert fake_db.table("programs").rows == []
    assert fake_db.table("schedules").rows == []


def test_deleting_another_users_plan_is_404(client, fake_db):
    fake_db.seed("programs", [
        {"id": "prog-2", "name": "Theirs", "user_id": "someone-else"},
    ])

    response = client.delete("/plans/prog-2")

    assert response.status_code == 404
    assert len(fake_db.table("programs").rows) == 1
