from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import get_connection, init_db

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

@app.get("/")
def home():
    return {"message": "Backend is running"}

@app.get("/players")
def get_players():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT id, name, number, pos, img
        FROM players
        ORDER BY id
        """
    )
    rows = cursor.fetchall()

    conn.close()

    return [dict(row) for row in rows]
