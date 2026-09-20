"""PUT /profile rejects nonsense rather than storing it.

The frontend validates the same rules so the user sees an inline message
instead of a 422, but the rules have to live here too: the API is reachable
with a token and curl, and a display name of 4000 characters is not
something the UI being polite should be the only thing preventing.
"""

from datetime import datetime, timezone

from conftest import TEST_USER_ID


def seed_profile(fake_db):
    fake_db.seed("profiles", [{"id": TEST_USER_ID}])


# ── Display name ─────────────────────────────────────────────────────────────

def test_name_is_trimmed_before_it_is_stored(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"display_name": "  Sian You  "})
    assert res.status_code == 200
    assert res.json()["data"]["display_name"] == "Sian You"


def test_one_character_name_is_rejected(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"display_name": "S"})
    assert res.status_code == 422


def test_overlong_name_is_rejected(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"display_name": "a" * 51})
    assert res.status_code == 422


def test_name_with_digits_or_symbols_is_rejected(client, fake_db):
    seed_profile(fake_db)
    for bad in ["Sian1", "Sian<script>", "Sian@You"]:
        res = client.put("/profile", json={"display_name": bad})
        assert res.status_code == 422, bad


def test_accented_and_punctuated_names_are_accepted(client, fake_db):
    seed_profile(fake_db)
    for good in ["Zoë Smith-Jones", "O'Brien", "J. Doe", "李明"]:
        res = client.put("/profile", json={"display_name": good})
        assert res.status_code == 200, good
        assert res.json()["data"]["display_name"] == good


def test_blank_name_clears_the_field(client, fake_db):
    """An empty input means "remove this", not "store an empty string"."""
    seed_profile(fake_db)
    res = client.put("/profile", json={"display_name": "   "})
    assert res.status_code == 200
    assert res.json()["data"]["display_name"] is None


# ── Phone ────────────────────────────────────────────────────────────────────

def test_phone_is_normalised_to_digits(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"phone": "+60 (12) 345-6789"})
    assert res.status_code == 200
    assert res.json()["data"]["phone"] == "+60123456789"


def test_too_short_phone_is_rejected(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"phone": "12345"})
    assert res.status_code == 422


def test_too_long_phone_is_rejected(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"phone": "1" * 16})
    assert res.status_code == 422


def test_phone_with_letters_is_rejected(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"phone": "0123-GYM-PULSE"})
    assert res.status_code == 422


def test_blank_phone_clears_the_field(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"phone": ""})
    assert res.status_code == 200
    assert res.json()["data"]["phone"] is None


# ── Year of birth ────────────────────────────────────────────────────────────

def test_birth_year_in_the_future_is_rejected(client, fake_db):
    seed_profile(fake_db)
    next_year = datetime.now(timezone.utc).year + 1
    res = client.put("/profile", json={"birth_year": next_year})
    assert res.status_code == 422


def test_birth_year_of_a_child_under_ten_is_rejected(client, fake_db):
    """Not an age gate -- a sanity check. Someone born this year is a typo."""
    seed_profile(fake_db)
    res = client.put("/profile", json={"birth_year": datetime.now(timezone.utc).year - 5})
    assert res.status_code == 422


def test_plausible_birth_year_is_accepted(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"birth_year": 1998})
    assert res.status_code == 200
    assert res.json()["data"]["birth_year"] == 1998


def test_null_birth_year_clears_the_field(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"birth_year": None})
    assert res.status_code == 200
    assert res.json()["data"]["birth_year"] is None


# ── The existing avatar rule still holds ─────────────────────────────────────

def test_avatar_path_outside_your_own_folder_is_still_rejected(client, fake_db):
    seed_profile(fake_db)
    res = client.put("/profile", json={"avatar_path": "someone-else/avatar.png"})
    assert res.status_code == 400
