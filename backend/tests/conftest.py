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
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

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
