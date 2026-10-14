"""Unit tests for the progressive-overload rule (backend/app/progression.py)."""
import pytest

# conftest.py puts backend/app on sys.path, so progression imports directly
from progression import FAIL, PASS, evaluate_session, recommendation

# Target used by most tests: 50 kg, 3 sets of 10 reps
TARGET = dict(target_weight=50, target_sets=3, target_reps=10)


def check(actual_weight, actual_reps):
    return evaluate_session(**TARGET, actual_weight=actual_weight, actual_reps=actual_reps)


def test_exactly_on_target_passes():
    assert check(50, [10, 10, 10]) == PASS


def test_beating_every_target_passes():
    assert check(55, [12, 11, 10, 10]) == PASS


def test_extra_set_below_target_reps_fails():
    # every logged set counts, including extra ones
    assert check(55, [12, 11, 10, 8]) == FAIL


def test_weight_below_target_fails():
    assert check(47.5, [10, 10, 10]) == FAIL


def test_one_set_short_fails():
    assert check(50, [10, 10]) == FAIL


def test_one_set_below_target_reps_fails():
    assert check(50, [10, 9, 10]) == FAIL


def test_no_sets_logged_fails():
    assert check(50, []) == FAIL


@pytest.mark.parametrize("status, advice", [
    (PASS, "Move to next week's workout."),
    (FAIL, "Repeat the current week."),
])
def test_recommendation_matches_status(status, advice):
    assert recommendation(status) == advice
