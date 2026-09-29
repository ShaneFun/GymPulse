import os
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from supabase import create_client, Client
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

SUPABASE_URL=os.getenv("SUPABASE_URL")
SUPABASE_KEY=os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY. Add them to a .env file (see README).")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
def create_program(program: ProgramCreate):
    try:
        response = supabase.table("programs").insert({"name":program.name}).execute()

        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="failed to write to database.")
        
        return {
            "message":"Program successfully saved to database!",
            "data": response.data[0]
        
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/schedules")
def create_schedule(schedule: ScheduleCreate):
    try:

        response = supabase.table("schedules").insert({
            "program_id": schedule.program_id,
            "week": schedule.week,
            "exercise_name": schedule.exercise_name,
            "target_weight": schedule.target_weight,
            "target_sets": schedule.target_sets,
            "target_reps": schedule.target_reps
        }).execute()
        
        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="Failed to create schedule.")
        return {"message": "Schedule rule saved!", "data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/workout-logs")
def create_workout_log(log: WorkoutLogCreate):
    try:
       
        schedule_response = supabase.table("schedules").select("*").eq("id", log.schedule_id).execute()
        
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
        response = supabase.table("workout_logs").insert({
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
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/programs")
def get_all_programs():
    try:
        response = supabase.table("programs").select("*").execute()
        return {"data": response.data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/schedules")
def get_schedules_by_program(program_id: str):
    try:
        response = supabase.table("schedules").select("*").eq("program_id", program_id).execute()
        return {"data": response.data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/workout-logs")
def get_logs_by_schedule(schedule_id: str):
    try:
        response = supabase.table("workout_logs").select("*").eq("schedule_id", schedule_id).execute()
        return {"data": response.data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
# ---- GET Routes (Retrieving Data) ----

@app.get("/analysis/{schedule_id}")
def get_workout_analysis(schedule_id: str):
    try:
        # Fetch the schedule to know the target requirements
        sched_res = supabase.table("schedules").select("*").eq("id", schedule_id).execute()
        if len(sched_res.data) == 0:
            return {"schedule_id": schedule_id, "history": []}
            
        target = sched_res.data[0]
        t_weight = target["target_weight"]
        t_sets = target["target_sets"]
        t_reps = target["target_reps"]

        # Fetch logs
        response = supabase.table("workout_logs").select("id", "log_name", "actual_weight", "actual_reps", "created_at").eq("schedule_id", schedule_id).execute()
        
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
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000)
