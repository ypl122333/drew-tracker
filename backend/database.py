import sqlite3
from pathlib import Path

DB_NAME = Path(__file__).resolve().parent / "drew_tracker.db"

PRACTICE_STAT_KEYS = [
    "charges",
    "sprint",
    "bDrives",
    "pTouch",
    "ast",
    "stl",
    "defl",
    "dReb",
    "oReb",
]

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


def ensure_practice_schema(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS practice_stats (
            player_id INTEGER PRIMARY KEY,
            charges INTEGER NOT NULL DEFAULT 0,
            sprint INTEGER NOT NULL DEFAULT 0,
            bDrives INTEGER NOT NULL DEFAULT 0,
            pTouch INTEGER NOT NULL DEFAULT 0,
            ast INTEGER NOT NULL DEFAULT 0,
            stl INTEGER NOT NULL DEFAULT 0,
            defl INTEGER NOT NULL DEFAULT 0,
            dReb INTEGER NOT NULL DEFAULT 0,
            oReb INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(player_id) REFERENCES players(id)
        )
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


def seed_practice_rows(cursor):
    cursor.executemany(
        """
        INSERT INTO practice_stats (player_id)
        VALUES (?)
        ON CONFLICT(player_id) DO NOTHING
        """,
        [(player_id,) for player_id, *_ in PLAYER_SEED_DATA],
    )


def _build_practice_stats(row):
    return {key: row[key] or 0 for key in PRACTICE_STAT_KEYS}


def _practice_total(practice_stats):
    return sum(practice_stats.values())


def get_players_with_practice():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            p.id,
            p.name,
            p.number,
            p.pos,
            p.img,
            ps.charges,
            ps.sprint,
            ps.bDrives,
            ps.pTouch,
            ps.ast,
            ps.stl,
            ps.defl,
            ps.dReb,
            ps.oReb
        FROM players p
        LEFT JOIN practice_stats ps ON ps.player_id = p.id
        ORDER BY p.id
        """
    )
    rows = cursor.fetchall()
    conn.close()

    players = []
    for row in rows:
        practice_stats = _build_practice_stats(row)
        players.append(
            {
                "id": row["id"],
                "name": row["name"],
                "number": row["number"],
                "pos": row["pos"],
                "img": row["img"],
                "practiceStats": practice_stats,
                "practiceTotal": _practice_total(practice_stats),
            }
        )

    return players


def increment_practice_stat(player_id, stat_key, delta):
    if stat_key not in PRACTICE_STAT_KEYS:
        raise ValueError(f"Unsupported practice stat: {stat_key}")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"""
        UPDATE practice_stats
        SET {stat_key} = MAX(0, {stat_key} + ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE player_id = ?
        """,
        (delta, player_id),
    )

    if cursor.rowcount == 0:
        conn.close()
        raise LookupError(f"Player {player_id} not found")

    conn.commit()
    conn.close()


def reset_practice_stats():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE practice_stats
        SET
            charges = 0,
            sprint = 0,
            bDrives = 0,
            pTouch = 0,
            ast = 0,
            stl = 0,
            defl = 0,
            dReb = 0,
            oReb = 0,
            updated_at = CURRENT_TIMESTAMP
        """
    )
    conn.commit()
    conn.close()


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    ensure_players_schema(cursor)
    ensure_practice_schema(cursor)
    seed_players(cursor)
    seed_practice_rows(cursor)

    conn.commit()
    conn.close()
