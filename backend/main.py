from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    PRACTICE_STAT_KEYS,
    adjust_game_clock_seconds,
    adjust_game_foul,
    get_game_snapshot,
    get_players_with_practice,
    handle_game_main_action,
    increment_practice_stat,
    init_db,
    reset_game_snapshot,
    reset_game_half,
    reset_practice_stats,
    save_game_snapshot,
    sync_game_clock_seconds,
    toggle_game_player,
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


class GamePlayerState(BaseModel):
    id: int
    currentStint: int
    totalSeconds: int
    fouls: int
    isOnCourt: bool
    lastSubOutClock: str | None = None
    subOutGameClock: int | None = None


class GameSnapshot(BaseModel):
    gameClockSeconds: int
    gameState: str
    gameStatusText: str | None = None
    gameMainButtonText: str | None = None
    players: list[GamePlayerState]


class GameClockPayload(BaseModel):
    seconds: int


class GameClockDeltaPayload(BaseModel):
    delta: int


class GameFoulPayload(BaseModel):
    delta: int


class GameMainActionPayload(BaseModel):
    allowShortHanded: bool = False


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


@app.get("/game")
def get_game():
    return get_game_snapshot()


@app.post("/game")
def save_game(payload: GameSnapshot):
    save_game_snapshot(payload.model_dump())
    return get_game_snapshot()


@app.post("/game/reset")
def reset_game():
    reset_game_snapshot()
    return get_game_snapshot()


@app.post("/game/main-action")
def game_main_action(payload: GameMainActionPayload):
    try:
        return handle_game_main_action(payload.allowShortHanded)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/game/players/{player_id}/toggle")
def game_toggle_player(player_id: int):
    try:
        return toggle_game_player(player_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/game/players/{player_id}/fouls")
def game_adjust_foul(player_id: int, payload: GameFoulPayload):
    try:
        return adjust_game_foul(player_id, payload.delta)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/game/clock/sync")
def game_sync_clock(payload: GameClockPayload):
    return sync_game_clock_seconds(payload.seconds)


@app.post("/game/clock/adjust")
def game_adjust_clock(payload: GameClockDeltaPayload):
    return adjust_game_clock_seconds(payload.delta)


@app.post("/game/reset-half")
def game_reset_half():
    return reset_game_half()
