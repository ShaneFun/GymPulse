import os
import re
from datetime import datetime, timezone

import httpx
import jwt
from pydantic import BaseModel, Field, field_validator
from fastapi import FastAPI, HTTPException, Header, Depends
from supabase import create_client, Client, ClientOptions
from postgrest.exceptions import APIError
from fastapi.middleware.cors import CORSMiddleware

# main.py runs as a standalone module (tests and uvicorn put backend/app on the path)
from progression import evaluate_session, recommendation

app= FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_KEY must be set. Copy .env.example to .env."
    )


def _bearer_token(authorization: str | None) -> str:
    """Pulls the raw JWT out of an Authorization header, or 401s."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    return token


# Shared across requests so each one doesn't have to build its own TLS
# context / connection pool from scratch (create_client() otherwise does
# this every time, measured at ~357ms per request). Only the httpx
# transport is shared here -- the supabase Client wrapper itself is still
# built fresh per request in get_supabase() below, and .postgrest.auth() is
# called on that fresh instance. postgrest.headers is mutable state on the
# Client, so re-using one Client (and re-auth'ing it) across requests would
# risk one user's token bleeding into a concurrent request.
_shared_httpx_client = httpx.Client()


def get_supabase(authorization: str | None = Header(default=None)) -> Client:
    """A Supabase client carrying the caller's JWT, so RLS sees auth.uid()."""
    token = _bearer_token(authorization)
    client = create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
        options=ClientOptions(httpx_client=_shared_httpx_client),
    )
    client.postgrest.auth(token)
    return client


def get_user_id(authorization: str | None = Header(default=None)) -> str:
    """The caller's user id, read from the JWT's `sub` claim.

    NOTE: the token's signature is intentionally NOT verified here. Doing
    that would require the Supabase project's JWT secret, which isn't
    available as an env var yet (a manual step still pending with the
    project owner). This is safe because every table access made with this
    token goes through get_supabase() -> PostgREST, and PostgREST verifies
    the signature itself before any RLS policy runs -- an unsigned/forged
    token is rejected there, before it can read or write anything. That
    reasoning depends on SUPABASE_KEY being the anon/public key and never a
    service-role key, which would bypass RLS (and PostgREST's check)
    entirely. We do still check `exp` explicitly below, since it's cheap
    and lets an expired token be rejected with a clear 401 here rather than
    surfacing as a PostgREST error on the first real query.
    """
    token = _bearer_token(authorization)
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed token.")

    exp = payload.get("exp")
    if exp is not None and datetime.now(timezone.utc).timestamp() > exp:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token has no subject.")
    return user_id


def _map_supabase_error(e: Exception) -> HTTPException:
    """Maps a caught exception from a Supabase call to the right HTTPException.

    supabase-py raises postgrest.exceptions.APIError whenever PostgREST
    rejects a request -- this covers both an invalid/expired JWT (PostgREST
    verifies the signature itself) and a Postgres-level permission denial
    (RLS, once the pending RLS policies are turned on). Error shape varies
    across supabase-py versions, so both `.code` and the message text are
    inspected defensively rather than relying on exact matching.
    """
    code = str(getattr(e, "code", None) or "")
    message = str(getattr(e, "message", None) or e)
    lower_message = message.lower()

    if code == "42501" or "permission denied" in lower_message:
        return HTTPException(status_code=403, detail="Not permitted.")

    if (
        code in ("PGRST301", "PGRST302", "401")
        or "jwt" in lower_message
        or "unauthorized" in lower_message
    ):
        return HTTPException(status_code=401, detail="Session expired or invalid.")

    # Anything else is unexpected -- log it server-side rather than just
    # swallowing it, but never hand the raw exception text to the browser.
    # (APIError is noted explicitly since it's the expected shape for a
    # PostgREST failure that didn't match either case above -- e.g. a
    # Postgres error code this mapping doesn't recognize yet.)
    print(f"Unhandled Supabase error (APIError={isinstance(e, APIError)}): {e!r}")
    return HTTPException(status_code=500, detail="Internal server error.")

class PlannedDayCreate(BaseModel):
    # ISO date, e.g. "2026-09-22". Stored as a real date column, so
    # Postgres rejects anything malformed rather than storing junk.
    day: str


class PlanExerciseCreate(BaseModel):
    exercise_name: str
    target_weight: float
    target_sets: int
    target_reps: int
    rest_seconds: int = Field(default=90, ge=0)
    weight_increment: float = Field(default=0, ge=0)
    rep_increment: int = Field(default=0, ge=0)


class PlanCreate(BaseModel):
    name: str
    exercise_rest_seconds: int = Field(default=180, ge=0)
    # min_length=1: a plan with no exercises is not a plan, and rejecting it
    # here is what makes the 422 in the tests a validation error rather than
    # a half-built program.
    exercises: list[PlanExerciseCreate] = Field(min_length=1)

# Characters a name may contain besides letters. Deliberately narrow: this is
# a display name, not free text, and it is rendered straight into the page.
_NAME_PUNCTUATION = " -'."

# Separators people type into a phone number, all meaningless to the number
# itself.   is the non-breaking space iOS inserts when pasting.
_PHONE_SEPARATORS = " -(). "

# The frontend validates these same rules so the user gets an inline message
# rather than a 422. They live here as well because the API is reachable
# without the UI, and the UI being polite is not a constraint.
MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 50
MIN_PHONE_DIGITS = 7
MAX_PHONE_DIGITS = 15   # E.164's ceiling
EARLIEST_BIRTH_YEAR = 1900
MIN_AGE_YEARS = 10      # a sanity check on typos, not an age gate


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    phone: str | None = None
    birth_year: int | None = None
    avatar_path: str | None = None

    @field_validator("display_name")
    @classmethod
    def _check_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        name = value.strip()
        # An empty input means "remove my name", not "store an empty string".
        if not name:
            return None
        if not MIN_NAME_LENGTH <= len(name) <= MAX_NAME_LENGTH:
            raise ValueError(
                f"Name must be {MIN_NAME_LENGTH}-{MAX_NAME_LENGTH} characters."
            )
        # isalpha() is Unicode-aware, so accented and non-Latin names pass
        # while digits and symbols do not.
        if not all(ch.isalpha() or ch in _NAME_PUNCTUATION for ch in name):
            raise ValueError("Name can only contain letters, spaces, hyphens and apostrophes.")
        return name

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        compact = "".join(ch for ch in value if ch not in _PHONE_SEPARATORS)
        if not compact:
            return None
        # Store one canonical form, so the same number typed two ways is not
        # two different strings in the database.
        digits = compact[1:] if compact.startswith("+") else compact
        if not re.fullmatch(r"[0-9]+", digits):
            raise ValueError("Phone number can only contain digits, spaces and + - ( ).")
        if not MIN_PHONE_DIGITS <= len(digits) <= MAX_PHONE_DIGITS:
            raise ValueError(
                f"Phone number must have {MIN_PHONE_DIGITS}-{MAX_PHONE_DIGITS} digits."
            )
        return ("+" if compact.startswith("+") else "") + digits

    @field_validator("birth_year")
    @classmethod
    def _check_birth_year(cls, value: int | None) -> int | None:
        if value is None:
            return None
        # Computed per call rather than pinned as a constant, so this does not
        # quietly start rejecting the current year on New Year's Day.
        latest = datetime.now(timezone.utc).year - MIN_AGE_YEARS
        if not EARLIEST_BIRTH_YEAR <= value <= latest:
            raise ValueError(f"Year of birth must be between {EARLIEST_BIRTH_YEAR} and {latest}.")
        return value

class WorkoutLogCreate(BaseModel):
    schedule_id: str     
    log_name: str       
    actual_weight: float 
    actual_reps: list[int]

@app.get("/")
def home ():
    return {
        "message":"AI fitness Analyzer API Running"
    }

@app.put("/plans/{program_id}")
def update_plan(
    program_id: str,
    plan: PlanCreate,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    """Replace a plan's name, rest and full exercise list.

    Taking the whole list is what makes adding, removing and editing
    exercises one operation rather than three. Exercises left out have
    their schedule deleted; their logged workouts survive, detached,
    because workout_logs.schedule_id is ON DELETE SET NULL.
    """
    try:
        owned = db.table("programs").select("id").eq("id", program_id).eq("user_id", user_id).execute()
        if len(owned.data) == 0:
            # 404 rather than 403: do not confirm that someone else's plan exists.
            raise HTTPException(status_code=404, detail="Plan not found.")

        db.table("programs").update({
            "name": plan.name,
            "exercise_rest_seconds": plan.exercise_rest_seconds
        }).eq("id", program_id).execute()

        existing = db.table("schedules").select("*").eq("program_id", program_id).execute()
        by_name = {row["exercise_name"]: row for row in existing.data}
        wanted = {e.exercise_name for e in plan.exercises}

        for name, row in by_name.items():
            if name not in wanted:
                db.table("schedules").delete().eq("id", row["id"]).execute()

        schedules = []
        for exercise in plan.exercises:
            values = {
                "exercise_name": exercise.exercise_name,
                "target_weight": exercise.target_weight,
                "target_sets": exercise.target_sets,
                "target_reps": exercise.target_reps,
                "rest_seconds": exercise.rest_seconds,
                "weight_increment": exercise.weight_increment,
                "rep_increment": exercise.rep_increment,
            }
            if exercise.exercise_name in by_name:
                # Every week of this exercise, so a progressed plan does not
                # end up with week 1 edited and week 2 stale.
                updated = db.table("schedules").update(values).eq(
                    "program_id", program_id
                ).eq("exercise_name", exercise.exercise_name).execute()
                schedules.extend(updated.data or [])
            else:
                created = db.table("schedules").insert({
                    **values, "program_id": program_id, "week": 1
                }).execute()
                schedules.extend(created.data or [])

        return {"message": "Plan updated!", "data": {"schedules": schedules}}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)


@app.delete("/plans/{program_id}")
def delete_plan(
    program_id: str,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    """Delete a plan and every week of it. Logged workouts are kept.

    The schedules go, and workout_logs.schedule_id is ON DELETE SET NULL, so
    history detaches rather than disappearing -- it still shows on the
    calendar, graded against the snapshot each log carries.
    """
    try:
        owned = db.table("programs").select("id").eq("id", program_id).eq("user_id", user_id).execute()
        if len(owned.data) == 0:
            raise HTTPException(status_code=404, detail="Plan not found.")

        db.table("schedules").delete().eq("program_id", program_id).execute()
        db.table("programs").delete().eq("id", program_id).execute()
        return {"message": "Plan deleted. Your workout history was kept."}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)


@app.get("/planned-days")
def list_planned_days(
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    """Days the user intends to train. RLS also scopes these, but filtering
    here keeps the query honest about its intent."""
    try:
        response = db.table("planned_days").select("*").eq("user_id", user_id).execute()
        return {"data": response.data}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)


@app.post("/planned-days")
def create_planned_day(
    planned: PlannedDayCreate,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    try:
        # upsert on the (user_id, day) unique constraint: planning an
        # already-planned day is a no-op, not an error the UI has to handle.
        response = db.table("planned_days").upsert(
            {"user_id": user_id, "day": planned.day},
            on_conflict="user_id,day"
        ).execute()

        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="Failed to plan that day.")

        return {"message": "Day planned!", "data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)


@app.delete("/planned-days/{day}")
def delete_planned_day(
    day: str,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    try:
        db.table("planned_days").delete().eq("user_id", user_id).eq("day", day).execute()
        # Deleting a day that was never planned is success, not a 404: the
        # caller wanted it gone and it is gone.
        return {"message": "Day unplanned."}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)


@app.post("/plans")
def create_plan(
    plan: PlanCreate,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    """Create a program and all of its week-1 exercises as one unit."""
    program_id = None
    try:
        program_res = db.table("programs").insert({
            "name": plan.name,
            "user_id": user_id,
            "exercise_rest_seconds": plan.exercise_rest_seconds
        }).execute()

        if len(program_res.data) == 0:
            raise HTTPException(status_code=400, detail="Failed to create plan.")

        program = program_res.data[0]
        program_id = program["id"]

        schedules = []
        for exercise in plan.exercises:
            row = db.table("schedules").insert({
                "program_id": program_id,
                "week": 1,
                "exercise_name": exercise.exercise_name,
                "target_weight": exercise.target_weight,
                "target_sets": exercise.target_sets,
                "target_reps": exercise.target_reps,
                "rest_seconds": exercise.rest_seconds,
                "weight_increment": exercise.weight_increment,
                "rep_increment": exercise.rep_increment
            }).execute()

            if len(row.data) == 0:
                raise HTTPException(status_code=400, detail="Failed to add an exercise.")
            schedules.append(row.data[0])

        return {
            "message": "Plan created!",
            "data": {"program": program, "schedules": schedules}
        }
    except Exception as e:
        # Roll back by hand: a program with no exercises is invisible in the
        # UI but real in the database, which is how the existing orphan row
        # got there.
        if program_id is not None:
            try:
                # Delete the children first rather than relying on the foreign
                # key to cascade: the schema lives in the Supabase dashboard,
                # so that behaviour is not verifiable from this repo and could
                # change. Explicit deletion is correct either way.
                db.table("schedules").delete().eq("program_id", program_id).execute()
                db.table("programs").delete().eq("id", program_id).execute()
            except Exception as cleanup_error:
                # The create already failed; report that, not this. Log it so a
                # failed rollback is not completely invisible.
                print(f"Plan rollback failed for program {program_id}: {cleanup_error}")
        if isinstance(e, HTTPException):
            raise
        raise _map_supabase_error(e)

@app.get("/profile")
def get_profile(
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    try:
        # upsert instead of select-then-insert: two concurrent first-access
        # requests (e.g. React StrictMode double-invoking an effect) can
        # both see no existing row and both try to insert, and the second
        # would hit the primary key and 500. upsert makes this idempotent.
        response = db.table("profiles").upsert({"id": user_id}, on_conflict="id").execute()
        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="Could not load profile.")
        return {"data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)


@app.put("/profile")
def update_profile(
    profile: ProfileUpdate,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    try:
        # exclude_unset so omitting a field leaves it alone rather than nulling it.
        values = profile.model_dump(exclude_unset=True)
        if not values:
            raise HTTPException(status_code=400, detail="No fields to update.")

        avatar_path = values.get("avatar_path")
        if "avatar_path" in values and avatar_path is not None:
            if not avatar_path.startswith(f"{user_id}/"):
                raise HTTPException(
                    status_code=400,
                    detail="avatar_path must be inside your own folder.",
                )

        values["updated_at"] = datetime.now(timezone.utc).isoformat()

        response = db.table("profiles").update(values).eq("id", user_id).execute()
        if len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Profile not found.")
        return {"data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)


@app.post("/schedules/{schedule_id}/advance")
def advance_schedule(schedule_id: str, db: Client = Depends(get_supabase)):
    try:
        sched_res = db.table("schedules").select("*").eq("id", schedule_id).execute()

        if len(sched_res.data) == 0:
            raise HTTPException(status_code=404, detail="Schedule not found.")

        current = sched_res.data[0]
        next_week = current["week"] + 1

        # Idempotent: if next week already exists for this program, return it.
        # select("*") is required: the whole row is carried forward into the
        # insert below, and the test fake does not catch a missing column.
        existing = (
            db.table("schedules").select("*")
            .eq("program_id", current["program_id"])
            .eq("week", next_week)
            .eq("exercise_name", current["exercise_name"])
            .execute()
        )
        if len(existing.data) > 0:
            return {
                "message": "Next week's schedule already exists.",
                "data": existing.data[0]
            }

        # Defensive: the migration backfills existing rows to 0, so None only
        # shows up if this runs against a database where it hasn't been applied.
        weight_increment = current.get("weight_increment") or 0
        rep_increment = current.get("rep_increment") or 0
        # Rest is a property of the plan, so it carries forward unchanged.
        rest_seconds = current.get("rest_seconds")
        if rest_seconds is None:
            rest_seconds = 90

        response = db.table("schedules").insert({
            "program_id": current["program_id"],
            "week": next_week,
            "exercise_name": current["exercise_name"],
            "target_weight": current["target_weight"] + weight_increment,
            "target_sets": current["target_sets"],
            "target_reps": current["target_reps"] + rep_increment,
            "weight_increment": weight_increment,
            "rep_increment": rep_increment,
            "rest_seconds": rest_seconds
        }).execute()

        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="Failed to create next week's schedule.")

        return {
            "message": "Next week's schedule created!",
            "data": response.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)

@app.post("/workout-logs")
def create_workout_log(log: WorkoutLogCreate, db: Client = Depends(get_supabase)):
    try:

        schedule_response = db.table("schedules").select("*").eq("id", log.schedule_id).execute()
        
        if len(schedule_response.data) == 0:
            raise HTTPException(status_code=404, detail="Target schedule not found.")
            
        target = schedule_response.data[0]
        target_weight = target["target_weight"]
        target_sets = target["target_sets"]
        target_reps = target["target_reps"]

        status = evaluate_session(target_weight, target_sets, target_reps,
                                  log.actual_weight, log.actual_reps)

        # Do not insert status and recommendation into Supabase because they are not in the schema.
        # They will be computed dynamically in the /analysis endpoint.
        response = db.table("workout_logs").insert({
            "schedule_id": log.schedule_id,
            "log_name": log.log_name,
            "actual_weight": log.actual_weight,
            "actual_reps": log.actual_reps,
            # Snapshot what this was measured against. Two reasons: the log
            # survives its plan being deleted, and editing a plan's targets
            # later cannot retroactively change whether this passed.
            "exercise_name": target.get("exercise_name"),
            "target_sets": target_sets,
            "target_reps": target_reps,
            "target_weight": target_weight
        }).execute()
        
        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="Failed to log workout details.")
            
        return {
            "message": "Gym workout logged successfully!",
            "status_calculated": status,
            "data": response.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)
    
@app.get("/programs")
def get_all_programs(db: Client = Depends(get_supabase)):
    try:
        response = db.table("programs").select("*").execute()
        return {"data": response.data}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)

@app.get("/schedules")
def get_schedules_by_program(program_id: str, db: Client = Depends(get_supabase)):
    try:
        response = db.table("schedules").select("*").eq("program_id", program_id).execute()
        return {"data": response.data}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)

@app.get("/analysis/{schedule_id}")
def get_workout_analysis(schedule_id: str, db: Client = Depends(get_supabase)):
    try:
        # Fetch the schedule to know the target requirements
        sched_res = db.table("schedules").select("*").eq("id", schedule_id).execute()
        if len(sched_res.data) == 0:
            return {"schedule_id": schedule_id, "history": []}

        target = sched_res.data[0]
        t_weight = target["target_weight"]
        t_sets = target["target_sets"]
        t_reps = target["target_reps"]

        # Fetch logs
        response = db.table("workout_logs").select(
            "id", "log_name", "actual_weight", "actual_reps", "created_at",
            "exercise_name", "target_sets", "target_reps", "target_weight"
        ).eq("schedule_id", schedule_id).execute()
        
        history = []
        for log in response.data:
            a_weight = log.get("actual_weight", 0)
            a_reps = log.get("actual_reps", [])

            # Grade against what the log itself recorded, falling back
            # to the schedule only for rows written before snapshots
            # existed. Using the current targets would re-grade history
            # every time a plan is edited.
            l_w, l_s, l_r = log.get("target_weight"), log.get("target_sets"), log.get("target_reps")
            g_weight = t_weight if l_w is None else l_w
            g_sets = t_sets if l_s is None else l_s
            g_reps = t_reps if l_r is None else l_r

            status = evaluate_session(g_weight, g_sets, g_reps, a_weight, a_reps)
            rec = recommendation(status)
                
            history.append({
                "id": log["id"],
                "log_name": log.get("log_name"),
                "actual_weight": a_weight,
                # The UI counts sets and totals reps from this. Omitting it is
                # why every session used to render as 0 sets / 0 reps.
                "actual_reps": a_reps,
                "status": status,
                "recommendation": rec,
                "created_at": log.get("created_at")
            })

        return {
            "schedule_id": schedule_id,
            "history": history
        }
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000)
