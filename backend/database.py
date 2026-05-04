import sqlite3
from pathlib import Path

DB_NAME = Path(__file__).resolve().parent / "drew_tracker.db"

PLAYER_SEED_DATA = [
    (0, "Charlie Thornton", 0, "PF", "/Photos/Charlie.png"),
    (1, "Jalen Holmes", 1, "C", "/Photos/Jalen.png"),
    (2, "Ben Kipnis", 2, "SF", "/Photos/Kip.png"),
    (3, "Devon Musial", 3, "SF", "/Photos/Dev.png"),
    (4, "Eli Yusavage", 4, "SG", "/Photos/Eli.png"),
    (5, "Rell Johnson", 5, "PG", "/Photos/Rell.png"),
    (6, "Andre De Los Reyes", 10, "PG", "/Photos/Andre.png"),
    (7, "David Musial", 11, "PF", "/Photos/David.png"),
    (8, "Erik Porch", 12, "PG", "/Photos/Erik.png"),
    (9, "Reid Chauhan", 13, "C", "/Photos/Reid.png"),
    (10, "Taylor Perlmutter", 22, "PG", "/Photos/Taylor.png"),
    (11, "Kevin Cronin", 23, "C", "/Photos/KevCro.png"),
    (12, "Marc Herasme", 24, "PG", "/Photos/Marc.png"),
    (13, "Jack Garside", 25, "SF", "/Photos/Jack.png"),
    (14, "Rocco Checchetto", 30, "SG", "/Photos/Rocco.png"),
    (15, "Connor Jepson", 31, "SG", "/Photos/Jeppy.png"),
    (16, "Ben Manns", 32, "C", "/Photos/BManns.png"),
    (17, "Kevin Cotton", 35, "PF", "/Photos/KevCot.png"),
    (18, "Charlie Dunner", 41, "SG", "/Photos/Charlie2.png"),
]


def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_players_schema(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            number INTEGER NOT NULL,
            pos TEXT NOT NULL,
            img TEXT NOT NULL
        )
        """
    )

    columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(players)").fetchall()
    }

    if "pos" not in columns:
        cursor.execute("ALTER TABLE players ADD COLUMN pos TEXT")

    if "img" not in columns:
        cursor.execute("ALTER TABLE players ADD COLUMN img TEXT")

    if "position" in columns:
        cursor.execute(
            """
            UPDATE players
            SET pos = COALESCE(pos, position)
            WHERE pos IS NULL OR pos = ''
            """
        )


def seed_players(cursor):
    cursor.executemany(
        """
        INSERT INTO players (id, name, number, pos, img)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            number = excluded.number,
            pos = excluded.pos,
            img = excluded.img
        """,
        PLAYER_SEED_DATA,
    )


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    ensure_players_schema(cursor)
    seed_players(cursor)

    conn.commit()
    conn.close()
