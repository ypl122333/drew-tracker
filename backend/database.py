import sqlite3
from pathlib import Path
from datetime import datetime, timezone

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

GAME_SESSION_DEFAULTS = {
    "gameClockSeconds": 1200,
    "gameState": "SETUP",
    "gameStatusText": None,
    "gameMainButtonText": None,
}

DEFAULT_STARTER_NAME_FRAGMENTS = [
    "Eli",
    "Andre",
    "Devon",
    "David",
    "Kevin Cronin",
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


def ensure_game_schema(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS game_session (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            game_clock_seconds INTEGER NOT NULL DEFAULT 1200,
            game_state TEXT NOT NULL DEFAULT 'SETUP',
            game_status_text TEXT,
            game_main_button_text TEXT,
            last_started_at TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS game_player_state (
            player_id INTEGER PRIMARY KEY,
            current_stint INTEGER NOT NULL DEFAULT 0,
            total_seconds INTEGER NOT NULL DEFAULT 0,
            fouls INTEGER NOT NULL DEFAULT 0,
            is_on_court INTEGER NOT NULL DEFAULT 0,
            last_sub_out_clock TEXT,
            sub_out_game_clock INTEGER,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(player_id) REFERENCES players(id)
        )
        """
    )

    session_columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(game_session)").fetchall()
    }
    if "last_started_at" not in session_columns:
        cursor.execute("ALTER TABLE game_session ADD COLUMN last_started_at TEXT")


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


def seed_game_rows(cursor):
    existing_session = cursor.execute(
        "SELECT 1 FROM game_session WHERE id = 1"
    ).fetchone()
    cursor.execute(
        """
        INSERT INTO game_session (
            id,
            game_clock_seconds,
            game_state,
            game_status_text,
            game_main_button_text,
            last_started_at
        )
        VALUES (1, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO NOTHING
        """,
        (
            GAME_SESSION_DEFAULTS["gameClockSeconds"],
            GAME_SESSION_DEFAULTS["gameState"],
            GAME_SESSION_DEFAULTS["gameStatusText"],
            GAME_SESSION_DEFAULTS["gameMainButtonText"],
        ),
    )

    existing_player_state_ids = {
        row["player_id"]
        for row in cursor.execute(
            "SELECT player_id FROM game_player_state"
        ).fetchall()
    }
    rows_to_insert = [
        (
            player_id,
            1 if any(fragment in name for fragment in DEFAULT_STARTER_NAME_FRAGMENTS) else 0,
        )
        for player_id, name, *_ in PLAYER_SEED_DATA
        if player_id not in existing_player_state_ids
    ]
    cursor.executemany(
        """
        INSERT INTO game_player_state (player_id, is_on_court)
        VALUES (?, ?)
        """,
        rows_to_insert,
    )

    if existing_session is None:
        _apply_default_starters(cursor)
    else:
        existing_on_court_count = cursor.execute(
            "SELECT COUNT(*) AS count FROM game_player_state WHERE is_on_court = 1"
        ).fetchone()["count"]
        if existing_on_court_count == 0:
            session = _load_game_session(cursor)
            has_activity = cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM game_player_state
                WHERE current_stint > 0 OR total_seconds > 0 OR fouls > 0
                """
            ).fetchone()["count"]
            if (
                session is not None
                and has_activity == 0
                and session["game_state"] == GAME_SESSION_DEFAULTS["gameState"]
                and session["game_clock_seconds"] == GAME_SESSION_DEFAULTS["gameClockSeconds"]
            ):
                _apply_default_starters(cursor)


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


def _player_base_with_practice_select():
    return """
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
    """


def _build_player_with_game_state(row):
    practice_stats = _build_practice_stats(row)
    return {
        "id": row["id"],
        "name": row["name"],
        "number": row["number"],
        "pos": row["pos"],
        "img": row["img"],
        "practiceStats": practice_stats,
        "practiceTotal": _practice_total(practice_stats),
        "currentStint": row["current_stint"] or 0,
        "totalSeconds": row["total_seconds"] or 0,
        "fouls": row["fouls"] or 0,
        "isOnCourt": bool(row["is_on_court"]),
        "lastSubOutClock": row["last_sub_out_clock"],
        "subOutGameClock": row["sub_out_game_clock"],
    }


def _now_utc():
    return datetime.now(timezone.utc)


def _iso_utc(dt):
    return dt.isoformat()


def _parse_utc(value):
    if not value:
        return None
    return datetime.fromisoformat(value)


def _format_clock(total_seconds):
    minutes = str(max(0, total_seconds) // 60).zfill(2)
    seconds = str(max(0, total_seconds) % 60).zfill(2)
    return f"{minutes}:{seconds}"


def _load_game_session(cursor):
    return cursor.execute(
        """
        SELECT
            id,
            game_clock_seconds,
            game_state,
            game_status_text,
            game_main_button_text,
            last_started_at
        FROM game_session
        WHERE id = 1
        """
    ).fetchone()


def _apply_default_starters(cursor):
    for _, name, *_ in PLAYER_SEED_DATA:
        cursor.execute(
            """
            UPDATE game_player_state
            SET is_on_court = ?, updated_at = CURRENT_TIMESTAMP
            WHERE player_id = (
                SELECT id FROM players WHERE name = ?
            )
            """,
            (
                1 if any(fragment in name for fragment in DEFAULT_STARTER_NAME_FRAGMENTS) else 0,
                name,
            ),
        )


def _advance_game_clock(cursor):
    session = _load_game_session(cursor)
    if session is None or session["game_state"] != "PLAYING" or not session["last_started_at"]:
        return _load_game_session(cursor)

    started_at = _parse_utc(session["last_started_at"])
    elapsed = int((_now_utc() - started_at).total_seconds())
    if elapsed <= 0:
        return session

    current_clock = max(0, session["game_clock_seconds"] - elapsed)
    actual_elapsed = session["game_clock_seconds"] - current_clock

    if actual_elapsed > 0:
        cursor.execute(
            """
            UPDATE game_player_state
            SET
                current_stint = MAX(0, current_stint + ?),
                total_seconds = MAX(0, total_seconds + ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE is_on_court = 1
            """,
            (actual_elapsed, actual_elapsed),
        )

    if current_clock <= 0:
        cursor.execute(
            """
            UPDATE game_session
            SET
                game_clock_seconds = 0,
                game_state = 'PAUSED',
                game_status_text = 'HALF ENDED',
                game_main_button_text = 'HALF ENDED',
                last_started_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """
        )
    else:
        cursor.execute(
            """
            UPDATE game_session
            SET
                game_clock_seconds = ?,
                last_started_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (current_clock, _iso_utc(_now_utc())),
        )

    return _load_game_session(cursor)


def get_game_snapshot():
    conn = get_connection()
    cursor = conn.cursor()
    session_row = _advance_game_clock(cursor)

    cursor.execute(
        f"""
        SELECT
            base.*,
            gps.current_stint,
            gps.total_seconds,
            gps.fouls,
            gps.is_on_court,
            gps.last_sub_out_clock,
            gps.sub_out_game_clock
        FROM ({_player_base_with_practice_select()}) base
        LEFT JOIN game_player_state gps ON gps.player_id = base.id
        ORDER BY base.id
        """
    )
    player_rows = cursor.fetchall()
    conn.commit()
    conn.close()

    if session_row is None:
        session = GAME_SESSION_DEFAULTS
    else:
        session = {
            "gameClockSeconds": session_row["game_clock_seconds"],
            "gameState": session_row["game_state"],
            "gameStatusText": session_row["game_status_text"],
            "gameMainButtonText": session_row["game_main_button_text"],
        }

    return {
        **session,
        "players": [_build_player_with_game_state(row) for row in player_rows],
    }


def save_game_snapshot(snapshot):
    conn = get_connection()
    cursor = conn.cursor()
    _advance_game_clock(cursor)
    cursor.execute(
        """
        UPDATE game_session
        SET
            game_clock_seconds = ?,
            game_state = ?,
            game_status_text = ?,
            game_main_button_text = ?,
            last_started_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
        """,
        (
            snapshot["gameClockSeconds"],
            snapshot["gameState"],
            snapshot.get("gameStatusText"),
            snapshot.get("gameMainButtonText"),
            _iso_utc(_now_utc()) if snapshot["gameState"] == "PLAYING" else None,
        ),
    )

    player_rows = [
        (
            player["id"],
            player.get("currentStint", 0),
            player.get("totalSeconds", 0),
            player.get("fouls", 0),
            1 if player.get("isOnCourt") else 0,
            player.get("lastSubOutClock"),
            player.get("subOutGameClock"),
        )
        for player in snapshot["players"]
    ]

    cursor.executemany(
        """
        UPDATE game_player_state
        SET
            current_stint = ?,
            total_seconds = ?,
            fouls = ?,
            is_on_court = ?,
            last_sub_out_clock = ?,
            sub_out_game_clock = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE player_id = ?
        """,
        [
            (
                current_stint,
                total_seconds,
                fouls,
                is_on_court,
                last_sub_out_clock,
                sub_out_game_clock,
                player_id,
            )
            for (
                player_id,
                current_stint,
                total_seconds,
                fouls,
                is_on_court,
                last_sub_out_clock,
                sub_out_game_clock,
            ) in player_rows
        ],
    )

    conn.commit()
    conn.close()


def reset_game_snapshot():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE game_session
        SET
            game_clock_seconds = ?,
            game_state = ?,
            game_status_text = ?,
            game_main_button_text = ?,
            last_started_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
        """,
        (
            GAME_SESSION_DEFAULTS["gameClockSeconds"],
            GAME_SESSION_DEFAULTS["gameState"],
            GAME_SESSION_DEFAULTS["gameStatusText"],
            GAME_SESSION_DEFAULTS["gameMainButtonText"],
        ),
    )
    cursor.execute(
        """
        UPDATE game_player_state
        SET
            current_stint = 0,
            total_seconds = 0,
            fouls = 0,
            is_on_court = 0,
            last_sub_out_clock = NULL,
            sub_out_game_clock = NULL,
            updated_at = CURRENT_TIMESTAMP
        """
    )
    _apply_default_starters(cursor)
    conn.commit()
    conn.close()


def _mutate_game(action):
    conn = get_connection()
    cursor = conn.cursor()
    _advance_game_clock(cursor)
    action(cursor)
    conn.commit()
    conn.close()
    return get_game_snapshot()


def toggle_game_player(player_id):
    def action(cursor):
        session = _load_game_session(cursor)
        player = cursor.execute(
            """
            SELECT
                player_id,
                current_stint,
                is_on_court
            FROM game_player_state
            WHERE player_id = ?
            """,
            (player_id,),
        ).fetchone()
        if player is None:
            raise LookupError(f"Player {player_id} not found")

        on_court_count = cursor.execute(
            "SELECT COUNT(*) AS count FROM game_player_state WHERE is_on_court = 1"
        ).fetchone()["count"]

        if session["game_state"] == "SETUP":
            cursor.execute(
                """
                UPDATE game_player_state
                SET is_on_court = ?, updated_at = CURRENT_TIMESTAMP
                WHERE player_id = ?
                """,
                (0 if player["is_on_court"] else 1, player_id),
            )
            return

        if player["is_on_court"]:
            cursor.execute(
                """
                UPDATE game_player_state
                SET
                    is_on_court = 0,
                    last_sub_out_clock = ?,
                    sub_out_game_clock = ?,
                    current_stint = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE player_id = ?
                """,
                (
                    _format_clock(session["game_clock_seconds"]),
                    session["game_clock_seconds"],
                    player_id,
                ),
            )
            return

        if on_court_count >= 5:
            raise ValueError("Max 5 players! Sub someone OUT first.")

        cursor.execute(
            """
            UPDATE game_player_state
            SET
                is_on_court = 1,
                current_stint = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE player_id = ?
            """,
            (player_id,),
        )

    return _mutate_game(action)


def adjust_game_foul(player_id, delta):
    def action(cursor):
        player = cursor.execute(
            "SELECT fouls FROM game_player_state WHERE player_id = ?",
            (player_id,),
        ).fetchone()
        if player is None:
            raise LookupError(f"Player {player_id} not found")

        new_fouls = player["fouls"] + delta
        if new_fouls < 0:
            return

        cursor.execute(
            """
            UPDATE game_player_state
            SET fouls = ?, updated_at = CURRENT_TIMESTAMP
            WHERE player_id = ?
            """,
            (new_fouls, player_id),
        )

    return _mutate_game(action)


def sync_game_clock_seconds(new_seconds):
    def action(cursor):
        session = _load_game_session(cursor)
        safe_seconds = max(0, new_seconds)
        diff_seconds = session["game_clock_seconds"] - safe_seconds

        cursor.execute(
            """
            UPDATE game_player_state
            SET
                current_stint = MAX(0, current_stint + ?),
                total_seconds = MAX(0, total_seconds + ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE is_on_court = 1
            """,
            (diff_seconds, diff_seconds),
        )

        cursor.execute(
            """
            UPDATE game_session
            SET
                game_clock_seconds = ?,
                last_started_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (
                safe_seconds,
                _iso_utc(_now_utc()) if session["game_state"] == "PLAYING" else None,
            ),
        )

    return _mutate_game(action)


def adjust_game_clock_seconds(delta):
    snapshot = get_game_snapshot()
    return sync_game_clock_seconds(snapshot["gameClockSeconds"] + delta)


def handle_game_main_action(allow_short_handed=False):
    def action(cursor):
        session = _load_game_session(cursor)
        on_court_count = cursor.execute(
            "SELECT COUNT(*) AS count FROM game_player_state WHERE is_on_court = 1"
        ).fetchone()["count"]

        if session["game_state"] == "SETUP":
            if on_court_count != 5 and not allow_short_handed:
                raise ValueError(f"Starts with {on_court_count} players. Continue?")

            cursor.execute(
                """
                UPDATE game_session
                SET
                    game_state = 'PAUSED',
                    game_status_text = 'READY',
                    game_main_button_text = NULL,
                    last_started_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                """
            )
            return

        if session["game_state"] == "PAUSED":
            if session["game_clock_seconds"] <= 0:
                raise ValueError("Period Ended. Reset Half before starting again.")

            cursor.execute(
                """
                UPDATE game_session
                SET
                    game_state = 'PLAYING',
                    game_status_text = NULL,
                    game_main_button_text = NULL,
                    last_started_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                """,
                (_iso_utc(_now_utc()),),
            )
            return

        if session["game_state"] == "PLAYING":
            cursor.execute(
                """
                UPDATE game_session
                SET
                    game_state = 'PAUSED',
                    game_status_text = 'PAUSED',
                    game_main_button_text = 'RESUME CLOCK',
                    last_started_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                """
            )

    return _mutate_game(action)


def reset_game_half():
    def action(cursor):
        cursor.execute(
            """
            UPDATE game_session
            SET
                game_clock_seconds = 1200,
                game_state = 'PAUSED',
                game_status_text = 'PAUSED',
                game_main_button_text = 'START 2ND HALF',
                last_started_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """
        )
        cursor.execute(
            """
            UPDATE game_player_state
            SET
                current_stint = 0,
                last_sub_out_clock = NULL,
                sub_out_game_clock = NULL,
                updated_at = CURRENT_TIMESTAMP
            """
        )

    return _mutate_game(action)


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
    ensure_game_schema(cursor)
    seed_players(cursor)
    seed_practice_rows(cursor)
    seed_game_rows(cursor)

    conn.commit()
    conn.close()
