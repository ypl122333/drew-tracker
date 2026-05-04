from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    PRACTICE_STAT_KEYS,
    get_players_with_practice,
    increment_practice_stat,
    init_db,
    reset_practice_stats,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


class PracticeStatUpdate(BaseModel):
    statKey: str
    delta: int = 1


@app.get("/")
def home():
    return {"message": "Backend is running"}

@app.get("/players")
def get_players():
    return get_players_with_practice()


@app.get("/practice")
def get_practice():
    return get_players_with_practice()


@app.post("/practice/{player_id}")
def update_practice(player_id: int, payload: PracticeStatUpdate):
    if payload.statKey not in PRACTICE_STAT_KEYS:
        raise HTTPException(status_code=400, detail="Invalid practice stat key")

    try:
        increment_practice_stat(player_id, payload.statKey, payload.delta)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return get_players_with_practice()


@app.post("/practice/reset")
def reset_practice():
    reset_practice_stats()
    return get_players_with_practice()
