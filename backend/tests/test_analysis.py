def test_analysis_returns_the_actual_reps(client, fake_db):
    """The Progress tab counts sets and totals reps from this field.

    Omitting it is why every session used to render as 0 sets / 0 reps even
    though the logs were saved correctly.
    """
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 1,
        "exercise_name": "bicep_curl", "target_weight": 0,
        "target_sets": 4, "target_reps": 12,
    }])
    fake_db.seed("workout_logs", [{
        "id": "log-1", "schedule_id": "sched-1", "log_name": "Session",
        "actual_weight": 0, "actual_reps": [12, 12, 12, 12],
        "created_at": "2026-09-19T17:35:53Z",
    }])

    response = client.get("/analysis/sched-1")

    assert response.status_code == 200
    entry = response.json()["history"][0]
    assert entry["actual_reps"] == [12, 12, 12, 12]
    assert entry["status"] == "PASS"
