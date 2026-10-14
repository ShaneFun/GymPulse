"""Progressive-overload rule: decide whether a logged session met its target.

Kept free of database and web imports so it can be unit-tested on its own.
"""

PASS = "PASS"
FAIL = "FAIL"

RECOMMENDATIONS = {
    PASS: "Move to next week's workout.",
    FAIL: "Repeat the current week.",
}


def evaluate_session(target_weight: float, target_sets: int, target_reps: int,
                     actual_weight: float, actual_reps: list[int]) -> str:
    """Return PASS when the lifter used at least the target weight, completed at
    least the target number of sets, and hit the target reps in every set."""
    if actual_weight < target_weight:
        return FAIL
    if len(actual_reps) < target_sets:
        return FAIL
    if any(reps < target_reps for reps in actual_reps):
        return FAIL
    return PASS


def recommendation(status: str) -> str:
    """Next-step advice shown to the user for a PASS or FAIL result."""
    return RECOMMENDATIONS[status]
