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


@pytest.fixture
def fake_db(monkeypatch):
    """Replaces the module-level supabase client with an in-memory fake."""
    db = FakeSupabase()
    monkeypatch.setattr(main, "supabase", db)
    return db


@pytest.fixture
def client(fake_db):
    return TestClient(main.app)
