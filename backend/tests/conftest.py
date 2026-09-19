"""Pytest fixtures for backend/app/main.py, built on an in-memory fake of the
supabase-py client.

The fake is deliberately minimal and is more permissive than real supabase-py
in a few specific ways that later tasks should keep in mind when TDD-ing
against it:

- `FakeSupabase.table(name)` auto-creates any table name on demand, and
  inserts are never validated against a schema. A typo'd table name or a
  column that doesn't exist in the real database will pass tests here and
  fail only against production.
- `FakeQuery.eq` compares with `str(...) == str(...)`, which is more
  permissive than postgrest. In particular `None` stringifies to `"None"`
  and will never match a real SQL null, so null-handling semantics are not
  represented.
- `FakeQuery.select(*columns)` ignores the requested columns and always
  returns whole rows, so a bug where code reads a field it forgot to select
  will not be caught.
- `FakeTable.update` ignores Postgres triggers and defaults, so `updated_at`
  is not maintained by the fake.
- `FakeInsert` does not backfill unset columns: a row read back from the fake
  omits keys that a real query would return as NULL, because the fake has no
  schema to know those columns exist.
- `FakeUpsert` only inserts-if-absent or returns the existing row as-is; it
  does not merge new values into an existing row the way a real Postgres
  upsert would. This is enough for main.py's current id-only upsert.
- The fake has no foreign keys, so deleting a program does not cascade to
  its schedules the way Postgres would.
"""

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# main.py raises at import time if SUPABASE_URL/SUPABASE_KEY are unset, and
# .env (where real values live locally) is gitignored, so a clean clone or
# CI checkout has neither. These tests never make a real network call --
# every dependency that would use them (get_supabase, get_user_id) is
# overridden below with a fake -- so dummy values are correct here.
# setdefault() so a real .env, if present, still wins.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-dummy-key")

# backend/app/main.py is a standalone module (no package), so put its
# directory on sys.path and import it as `main`.
APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))

import main  # noqa: E402


class FakeResponse:
    """Stands in for supabase-py's APIResponse — only `.data` is used."""

    def __init__(self, data):
        self.data = data


class FakeQuery:
    """Mimics the chained query builder: .select(...).eq(...).eq(...).execute()"""

    def __init__(self, rows):
        self._rows = rows

    def eq(self, column, value):
        self._rows = [r for r in self._rows if str(r.get(column)) == str(value)]
        return self

    def execute(self):
        return FakeResponse(list(self._rows))


class FakeInsert:
    """Mimics the chained insert builder: .insert(row).execute()"""

    def __init__(self, table, row):
        self._table = table
        self._row = row

    def execute(self):
        row = dict(self._row)
        row.setdefault("id", f"{self._table.name}-{len(self._table.rows) + 1}")
        row.setdefault("created_at", "2026-09-18T10:00:00Z")
        self._table.rows.append(row)
        return FakeResponse([row])


class FakeUpdate:
    """Mimics .update(values).eq(col, val).execute()."""

    def __init__(self, table, values):
        self._table = table
        self._values = values
        self._filters = []

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def execute(self):
        updated = []
        for row in self._table.rows:
            if all(str(row.get(c)) == str(v) for c, v in self._filters):
                row.update(self._values)
                updated.append(row)
        return FakeResponse(updated)


class FakeUpsert:
    """Mimics .upsert(row, on_conflict=col).execute(): inserts when no row
    matches the conflict column, otherwise returns the existing row
    unchanged (a real upsert would merge in the new values; this fake only
    needs to support the id-only upsert main.py does today)."""

    def __init__(self, table, row, on_conflict):
        self._table = table
        self._row = row
        self._on_conflict = on_conflict

    def execute(self):
        conflict_value = self._row.get(self._on_conflict)
        for existing in self._table.rows:
            if str(existing.get(self._on_conflict)) == str(conflict_value):
                return FakeResponse([existing])

        row = dict(self._row)
        row.setdefault("id", f"{self._table.name}-{len(self._table.rows) + 1}")
        row.setdefault("created_at", "2026-09-18T10:00:00Z")
        self._table.rows.append(row)
        return FakeResponse([row])


class FakeDelete:
    """Mimics .delete().eq(col, val).execute()."""

    def __init__(self, table):
        self._table = table
        self._filters = []

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def execute(self):
        removed = [
            r for r in self._table.rows
            if all(str(r.get(c)) == str(v) for c, v in self._filters)
        ]
        self._table.rows = [r for r in self._table.rows if r not in removed]
        return FakeResponse(removed)


class FakeTable:
    """Stands in for a supabase-py table handle, i.e. the object returned by
    `supabase.table(name)`, holding its rows in memory."""

    def __init__(self, name):
        self.name = name
        self.rows = []

    def select(self, *columns):
        return FakeQuery(list(self.rows))

    def insert(self, row):
        return FakeInsert(self, row)

    def upsert(self, row, on_conflict="id"):
        return FakeUpsert(self, row, on_conflict)

    def update(self, values):
        return FakeUpdate(self, values)

    def delete(self):
        return FakeDelete(self)


class FakeSupabase:
    """In-memory stand-in for the supabase client used by backend/app/main.py."""

    def __init__(self):
        self.tables = {}

    def table(self, name):
        if name not in self.tables:
            self.tables[name] = FakeTable(name)
        return self.tables[name]

    def seed(self, name, rows):
        table = self.table(name)
        for row in rows:
            table.rows.append(dict(row))


TEST_USER_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def fake_db():
    """In-memory stand-in, injected via FastAPI's dependency overrides."""
    return FakeSupabase()


@pytest.fixture
def client(fake_db):
    main.app.dependency_overrides[main.get_supabase] = lambda: fake_db
    main.app.dependency_overrides[main.get_user_id] = lambda: TEST_USER_ID
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


@pytest.fixture
def anon_client():
    """No dependency overrides: exercises the real auth dependency."""
    with TestClient(main.app) as c:
        yield c
