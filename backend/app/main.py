import os
from datetime import datetime, timezone

import httpx
import jwt
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Header, Depends
from supabase import create_client, Client, ClientOptions
from postgrest.exceptions import APIError
from fastapi.middleware.cors import CORSMiddleware

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

class ProgramCreate(BaseModel):
    name: str

class ScheduleCreate(BaseModel):
    program_id: str
    week: int
    exercise_name: str
    target_weight: float
    target_sets: int
    target_reps: int
    notes: str | None = None
    weight_increment: float = Field(default=0, ge=0)
    rep_increment: int = Field(default=0, ge=0)
    rest_seconds: int = Field(default=90, ge=0)

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

class ProfileUpdate(BaseModel):
    display_name: str | None = None
    phone: str | None = None
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    avatar_path: str | None = None

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

@app.post("/programs")
def create_program(program: ProgramCreate, db: Client = Depends(get_supabase), user_id: str = Depends(get_user_id)):
    try:
        response = db.table("programs").insert({"name": program.name, "user_id": user_id}).execute()

        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="failed to write to database.")
        
        return {
            "message":"Program successfully saved to database!",
            "data": response.data[0]
        
        }
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


@app.post("/schedules")
def create_schedule(schedule: ScheduleCreate, db: Client = Depends(get_supabase)):
    try:

        response = db.table("schedules").insert({
            "program_id": schedule.program_id,
            "week": schedule.week,
            "exercise_name": schedule.exercise_name,
            "target_weight": schedule.target_weight,
            "target_sets": schedule.target_sets,
            "target_reps": schedule.target_reps,
            "weight_increment": schedule.weight_increment,
            "rep_increment": schedule.rep_increment,
            "rest_seconds": schedule.rest_seconds
        }).execute()
        
        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="Failed to create schedule.")
        return {"message": "Schedule rule saved!", "data": response.data[0]}
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

        if (
            log.actual_weight >= target_weight
            and len(log.actual_reps) >= target_sets
            and all(rep >= target_reps for rep in log.actual_reps)
        ):
            status = "PASS"
        else:
            status = "FAIL"

        # Do not insert status and recommendation into Supabase because they are not in the schema.
        # They will be computed dynamically in the /analysis endpoint.
        response = db.table("workout_logs").insert({
            "schedule_id": log.schedule_id,
            "log_name": log.log_name,
            "actual_weight": log.actual_weight,
            "actual_reps": log.actual_reps
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

@app.get("/workout-logs")
def get_logs_by_schedule(schedule_id: str, db: Client = Depends(get_supabase)):
    try:
        response = db.table("workout_logs").select("*").eq("schedule_id", schedule_id).execute()
        return {"data": response.data}
    except HTTPException:
        raise
    except Exception as e:
        raise _map_supabase_error(e)
    
# ---- GET Routes (Retrieving Data) ----

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
        response = db.table("workout_logs").select("id", "log_name", "actual_weight", "actual_reps", "created_at").eq("schedule_id", schedule_id).execute()
        
        history = []
        for log in response.data:
            a_weight = log.get("actual_weight", 0)
            a_reps = log.get("actual_reps", [])
            
            if (
                a_weight >= t_weight
                and len(a_reps) >= t_sets
                and all(rep >= t_reps for rep in a_reps)
            ):
                status = "PASS"
                rec = "Move to next week's workout."
            else:
                status = "FAIL"
                rec = "Repeat the current week."
                
            history.append({
                "id": log["id"],
                "log_name": log.get("log_name"),
                "actual_weight": a_weight,
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
