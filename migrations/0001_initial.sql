PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  source_player_id TEXT UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  number INTEGER NOT NULL,
  pos TEXT NOT NULL CHECK (pos IN ('PG', 'SG', 'SF', 'PF', 'C')),
  img TEXT NOT NULL DEFAULT '/icon.png',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
  source_pos TEXT,
  profile_url TEXT,
  image_url TEXT,
  academic_year TEXT,
  season TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS game_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  game_clock_seconds INTEGER NOT NULL DEFAULT 1200,
  game_state TEXT NOT NULL DEFAULT 'SETUP',
  game_status_text TEXT,
  game_main_button_text TEXT,
  last_started_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_player_state (
  player_id INTEGER PRIMARY KEY,
  current_stint INTEGER NOT NULL DEFAULT 0,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  fouls INTEGER NOT NULL DEFAULT 0,
  is_on_court INTEGER NOT NULL DEFAULT 0 CHECK (is_on_court IN (0, 1)),
  last_sub_out_clock TEXT,
  sub_out_game_clock INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS roster_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  season TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  inactive_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

INSERT INTO game_session (
  id,
  game_clock_seconds,
  game_state,
  game_status_text,
  game_main_button_text,
  last_started_at
)
VALUES (1, 1200, 'SETUP', NULL, NULL, NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO players (id, normalized_name, name, number, pos, img, active, needs_review)
VALUES
  (0, 'charlie thornton', 'Charlie Thornton', 0, 'PF', '/Photos/Charlie.png', 1, 0),
  (1, 'jalen holmes', 'Jalen Holmes', 1, 'C', '/Photos/Jalen.png', 1, 0),
  (2, 'ben kipnis', 'Ben Kipnis', 2, 'SF', '/Photos/Kip.png', 1, 0),
  (3, 'devon musial', 'Devon Musial', 3, 'SF', '/Photos/Dev.png', 1, 0),
  (4, 'eli yusavage', 'Eli Yusavage', 4, 'SG', '/Photos/Eli.png', 1, 0),
  (5, 'rell johnson', 'Rell Johnson', 5, 'PG', '/Photos/Rell.png', 1, 0),
  (6, 'andre de los reyes', 'Andre De Los Reyes', 10, 'PG', '/Photos/Andre.png', 1, 0),
  (7, 'david musial', 'David Musial', 11, 'PF', '/Photos/David.png', 1, 0),
  (8, 'erik porch', 'Erik Porch', 12, 'PG', '/Photos/Erik.png', 1, 0),
  (9, 'reid chauhan', 'Reid Chauhan', 13, 'C', '/Photos/Reid.png', 1, 0),
  (10, 'taylor perlmutter', 'Taylor Perlmutter', 22, 'PG', '/Photos/Taylor.png', 1, 0),
  (11, 'kevin cronin', 'Kevin Cronin', 23, 'C', '/Photos/KevCro.png', 1, 0),
  (12, 'marc herasme', 'Marc Herasme', 24, 'PG', '/Photos/Marc.png', 1, 0),
  (13, 'jack garside', 'Jack Garside', 25, 'SF', '/Photos/Jack.png', 1, 0),
  (14, 'rocco checchetto', 'Rocco Checchetto', 30, 'SG', '/Photos/Rocco.png', 1, 0),
  (15, 'connor jepson', 'Connor Jepson', 31, 'SG', '/Photos/Jeppy.png', 1, 0),
  (16, 'ben manns', 'Ben Manns', 32, 'C', '/Photos/BManns.png', 1, 0),
  (17, 'kevin cotton', 'Kevin Cotton', 35, 'PF', '/Photos/KevCot.png', 1, 0),
  (18, 'charlie dunner', 'Charlie Dunner', 41, 'SG', '/Photos/Charlie2.png', 1, 0)
ON CONFLICT(id) DO UPDATE SET
  normalized_name = excluded.normalized_name,
  name = excluded.name,
  number = excluded.number,
  pos = excluded.pos,
  img = excluded.img,
  active = excluded.active,
  updated_at = CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO practice_stats (player_id)
SELECT id FROM players
;

INSERT OR IGNORE INTO game_player_state (player_id, is_on_court)
SELECT
  id,
  CASE
    WHEN name IN (
      'Eli Yusavage',
      'Andre De Los Reyes',
      'Devon Musial',
      'David Musial',
      'Kevin Cronin'
    ) THEN 1
    ELSE 0
  END
FROM players
;
