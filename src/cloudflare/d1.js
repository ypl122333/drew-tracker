import {
  DEFAULT_PLAYER_IMAGE,
  DEFAULT_STARTER_NAME_FRAGMENTS,
  GAME_SESSION_DEFAULTS,
  PRACTICE_STAT_KEYS,
} from "./constants.js"
import {
  adjustClockSnapshot,
  buildPlayerPayload,
  createDefaultGameSession,
  resolveMainAction,
  togglePlayerSnapshot,
} from "./game-state.js"
import {
  buildRosterDiff,
  fetchRosterHtml,
  normalizeName,
  parseRosterHtml,
} from "./roster.js"

const APP_POSITIONS = new Set(["PG", "SG", "SF", "PF", "C"])

function bind(statement, params = []) {
  return params.length ? statement.bind(...params) : statement
}

async function all(db, sql, params = []) {
  const result = await bind(db.prepare(sql), params).all()
  return result.results || []
}

async function first(db, sql, params = []) {
  return bind(db.prepare(sql), params).first()
}

async function run(db, sql, params = []) {
  return bind(db.prepare(sql), params).run()
}

function nowIso() {
  return new Date().toISOString()
}

function rowToSession(row) {
  if (!row) {
    return {
      ...createDefaultGameSession(),
      lastStartedAt: null,
    }
  }

  return {
    gameClockSeconds: row.game_clock_seconds,
    gameState: row.game_state,
    gameStatusText: row.game_status_text,
    gameMainButtonText: row.game_main_button_text,
    lastStartedAt: row.last_started_at,
  }
}

async function loadGameSession(db) {
  const row = await first(
    db,
    `
      SELECT
        game_clock_seconds,
        game_state,
        game_status_text,
        game_main_button_text,
        last_started_at
      FROM game_session
      WHERE id = 1
    `,
  )

  return rowToSession(row)
}

async function saveSession(db, session) {
  await run(
    db,
    `
      UPDATE game_session
      SET
        game_clock_seconds = ?,
        game_state = ?,
        game_status_text = ?,
        game_main_button_text = ?,
        last_started_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `,
    [
      session.gameClockSeconds,
      session.gameState,
      session.gameStatusText,
      session.gameMainButtonText,
      session.lastStartedAt ?? null,
    ],
  )
}

async function advanceGameClock(db) {
  const session = await loadGameSession(db)

  if (session.gameState !== "PLAYING" || !session.lastStartedAt) {
    return session
  }

  const elapsed = Math.floor((Date.now() - Date.parse(session.lastStartedAt)) / 1000)
  if (elapsed <= 0) {
    return session
  }

  const currentClock = Math.max(0, session.gameClockSeconds - elapsed)
  const actualElapsed = session.gameClockSeconds - currentClock

  if (actualElapsed > 0) {
    await run(
      db,
      `
        UPDATE game_player_state
        SET
          current_stint = MAX(0, current_stint + ?),
          total_seconds = MAX(0, total_seconds + ?),
          updated_at = CURRENT_TIMESTAMP
        WHERE is_on_court = 1
      `,
      [actualElapsed, actualElapsed],
    )
  }

  if (currentClock <= 0) {
    await saveSession(db, {
      gameClockSeconds: 0,
      gameState: "PAUSED",
      gameStatusText: "HALF ENDED",
      gameMainButtonText: "HALF ENDED",
      lastStartedAt: null,
    })
  } else {
    await saveSession(db, {
      ...session,
      gameClockSeconds: currentClock,
      lastStartedAt: nowIso(),
    })
  }

  return loadGameSession(db)
}

function playerSelect() {
  return `
    SELECT
      p.id,
      p.source_player_id,
      p.name,
      p.normalized_name,
      p.number,
      p.pos,
      p.img,
      p.active,
      p.needs_review,
      p.source_pos,
      p.profile_url,
      p.image_url,
      p.academic_year,
      p.season,
      COALESCE(ps.charges, 0) AS charges,
      COALESCE(ps.sprint, 0) AS sprint,
      COALESCE(ps.bDrives, 0) AS bDrives,
      COALESCE(ps.pTouch, 0) AS pTouch,
      COALESCE(ps.ast, 0) AS ast,
      COALESCE(ps.stl, 0) AS stl,
      COALESCE(ps.defl, 0) AS defl,
      COALESCE(ps.dReb, 0) AS dReb,
      COALESCE(ps.oReb, 0) AS oReb,
      COALESCE(gps.current_stint, 0) AS current_stint,
      COALESCE(gps.total_seconds, 0) AS total_seconds,
      COALESCE(gps.fouls, 0) AS fouls,
      COALESCE(gps.is_on_court, 0) AS is_on_court,
      gps.last_sub_out_clock,
      gps.sub_out_game_clock
    FROM players p
    LEFT JOIN practice_stats ps ON ps.player_id = p.id
    LEFT JOIN game_player_state gps ON gps.player_id = p.id
  `
}

async function selectActivePlayers(db) {
  const rows = await all(
    db,
    `
      ${playerSelect()}
      WHERE p.active = 1
      ORDER BY p.id
    `,
  )

  return rows.map(buildPlayerPayload)
}

async function savePlayerGameStates(db, players) {
  for (const player of players) {
    await run(
      db,
      `
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
      `,
      [
        player.currentStint || 0,
        player.totalSeconds || 0,
        player.fouls || 0,
        player.isOnCourt ? 1 : 0,
        player.lastSubOutClock ?? null,
        player.subOutGameClock ?? null,
        player.id,
      ],
    )
  }
}

async function getExistingRosterPlayers(db) {
  return all(
    db,
    `
      SELECT
        id,
        source_player_id AS sourcePlayerId,
        normalized_name AS normalizedName,
        name,
        number,
        pos,
        img,
        active,
        needs_review AS needsReview,
        source_pos AS sourcePos,
        profile_url AS profileUrl,
        image_url AS imageUrl,
        academic_year AS academicYear,
        season
      FROM players
      ORDER BY id
    `,
  )
}

async function insertRosterPlayer(db, player, id) {
  await run(
    db,
    `
      INSERT INTO players (
        id,
        source_player_id,
        normalized_name,
        name,
        number,
        pos,
        img,
        active,
        needs_review,
        source_pos,
        profile_url,
        image_url,
        academic_year,
        season
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)
    `,
    [
      id,
      player.sourcePlayerId,
      player.normalizedName,
      player.name,
      player.number,
      player.suggestedPos,
      player.localImagePath || DEFAULT_PLAYER_IMAGE,
      player.sourcePos,
      player.profileUrl,
      player.imageUrl,
      player.academicYear,
      player.season,
    ],
  )

  await run(db, "INSERT INTO practice_stats (player_id) VALUES (?)", [id])
  await run(db, "INSERT INTO game_player_state (player_id) VALUES (?)", [id])
}

async function applyRosterSync(db, html) {
  const incomingPlayers = parseRosterHtml(html)
  if (incomingPlayers.length === 0) {
    throw new Error("Roster sync parsed 0 players; refusing to mutate roster")
  }

  const existingPlayers = await getExistingRosterPlayers(db)
  const diff = buildRosterDiff(existingPlayers, incomingPlayers)
  const maxIdRow = await first(db, "SELECT COALESCE(MAX(id), -1) AS max_id FROM players")
  let nextId = Number(maxIdRow.max_id) + 1

  for (const player of diff.create) {
    await insertRosterPlayer(db, player, nextId)
    nextId += 1
  }

  for (const player of diff.update) {
    await run(
      db,
      `
        UPDATE players
        SET
          source_player_id = ?,
          normalized_name = ?,
          name = ?,
          number = ?,
          active = 1,
          source_pos = ?,
          profile_url = ?,
          image_url = ?,
          academic_year = ?,
          season = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        player.sourcePlayerId,
        normalizeName(player.name),
        player.name,
        player.number,
        player.sourcePos,
        player.profileUrl,
        player.imageUrl,
        player.academicYear,
        player.season,
        player.id,
      ],
    )
  }

  for (const player of diff.markInactive) {
    await run(
      db,
      `
        UPDATE players
        SET active = 0,
            needs_review = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [player.id],
    )
  }

  await run(
    db,
    `
      INSERT INTO roster_sync_runs (
        started_at,
        completed_at,
        status,
        season,
        discovered_count,
        created_count,
        updated_count,
        inactive_count,
        error_message
      )
      VALUES (?, ?, 'success', ?, ?, ?, ?, ?, NULL)
    `,
    [
      nowIso(),
      nowIso(),
      incomingPlayers[0]?.season ?? null,
      incomingPlayers.length,
      diff.create.length,
      diff.update.length,
      diff.markInactive.length,
    ],
  )

  return {
    season: incomingPlayers[0]?.season ?? null,
    discoveredCount: incomingPlayers.length,
    createdCount: diff.create.length,
    updatedCount: diff.update.length,
    inactiveCount: diff.markInactive.length,
    diff,
  }
}

export function createD1Services(db, options = {}) {
  const fetchImpl = options.fetchImpl || fetch

  async function getGameSnapshot() {
    const session = await advanceGameClock(db)
    return {
      gameClockSeconds: session.gameClockSeconds,
      gameState: session.gameState,
      gameStatusText: session.gameStatusText,
      gameMainButtonText: session.gameMainButtonText,
      players: await selectActivePlayers(db),
    }
  }

  async function saveGameSnapshot(snapshot) {
    await advanceGameClock(db)
    await saveSession(db, {
      gameClockSeconds: snapshot.gameClockSeconds,
      gameState: snapshot.gameState,
      gameStatusText: snapshot.gameStatusText ?? null,
      gameMainButtonText: snapshot.gameMainButtonText ?? null,
      lastStartedAt: snapshot.gameState === "PLAYING" ? nowIso() : null,
    })
    await savePlayerGameStates(db, snapshot.players || [])
    return getGameSnapshot()
  }

  async function resetGameSnapshot() {
    await saveSession(db, {
      ...GAME_SESSION_DEFAULTS,
      lastStartedAt: null,
    })
    await run(
      db,
      `
        UPDATE game_player_state
        SET
          current_stint = 0,
          total_seconds = 0,
          fouls = 0,
          is_on_court = 0,
          last_sub_out_clock = NULL,
          sub_out_game_clock = NULL,
          updated_at = CURRENT_TIMESTAMP
      `,
    )

    const players = await all(db, "SELECT id, name FROM players WHERE active = 1")
    for (const player of players) {
      const isStarter = DEFAULT_STARTER_NAME_FRAGMENTS.some((fragment) =>
        player.name.includes(fragment),
      )
      await run(
        db,
        "UPDATE game_player_state SET is_on_court = ?, updated_at = CURRENT_TIMESTAMP WHERE player_id = ?",
        [isStarter ? 1 : 0, player.id],
      )
    }

    return getGameSnapshot()
  }

  async function getPlayersWithPractice() {
    return selectActivePlayers(db)
  }

  async function updatePracticeStat(playerId, statKey, delta = 1) {
    if (!PRACTICE_STAT_KEYS.includes(statKey)) {
      throw new Error("Invalid practice stat key")
    }

    const result = await run(
      db,
      `
        UPDATE practice_stats
        SET ${statKey} = MAX(0, ${statKey} + ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE player_id = ?
      `,
      [delta, playerId],
    )

    if (result.meta?.changes === 0) {
      throw new Error(`Player ${playerId} not found`)
    }

    return getPlayersWithPractice()
  }

  async function resetPracticeStats() {
    await run(
      db,
      `
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
      `,
    )
    return getPlayersWithPractice()
  }

  async function handleGameMainAction(allowShortHanded = false) {
    await advanceGameClock(db)
    const session = await loadGameSession(db)
    const onCourt = await first(
      db,
      `
        SELECT COUNT(*) AS count
        FROM game_player_state gps
        JOIN players p ON p.id = gps.player_id
        WHERE gps.is_on_court = 1
          AND p.active = 1
      `,
    )
    const nextSession = resolveMainAction({
      gameClockSeconds: session.gameClockSeconds,
      gameState: session.gameState,
      onCourtCount: onCourt.count,
      allowShortHanded,
      nowIso: nowIso(),
    })

    await saveSession(db, nextSession)
    return getGameSnapshot()
  }

  async function toggleGamePlayer(playerId) {
    const next = togglePlayerSnapshot(await getGameSnapshot(), playerId)
    return saveGameSnapshot(next)
  }

  async function adjustGameFoul(playerId, delta) {
    const player = await first(
      db,
      "SELECT fouls FROM game_player_state WHERE player_id = ?",
      [playerId],
    )
    if (!player) {
      throw new Error(`Player ${playerId} not found`)
    }

    await run(
      db,
      "UPDATE game_player_state SET fouls = MAX(0, fouls + ?), updated_at = CURRENT_TIMESTAMP WHERE player_id = ?",
      [delta, playerId],
    )
    return getGameSnapshot()
  }

  async function syncGameClockSeconds(seconds) {
    const next = adjustClockSnapshot(await getGameSnapshot(), seconds)
    return saveGameSnapshot(next)
  }

  async function adjustGameClockSeconds(delta) {
    const snapshot = await getGameSnapshot()
    return syncGameClockSeconds(snapshot.gameClockSeconds + delta)
  }

  async function resetGameHalf() {
    await saveSession(db, {
      gameClockSeconds: 1200,
      gameState: "PAUSED",
      gameStatusText: "PAUSED",
      gameMainButtonText: "START 2ND HALF",
      lastStartedAt: null,
    })
    await run(
      db,
      `
        UPDATE game_player_state
        SET
          current_stint = 0,
          last_sub_out_clock = NULL,
          sub_out_game_clock = NULL,
          updated_at = CURRENT_TIMESTAMP
      `,
    )
    return getGameSnapshot()
  }

  async function getRosterReview() {
    const players = await all(
      db,
      `
        SELECT
          id,
          source_player_id AS sourcePlayerId,
          name,
          number,
          pos,
          img,
          active,
          needs_review AS needsReview,
          source_pos AS sourcePos,
          profile_url AS profileUrl,
          image_url AS imageUrl,
          academic_year AS academicYear,
          season
        FROM players
        WHERE needs_review = 1
        ORDER BY active DESC, number, name
      `,
    )
    const latestSync = await first(
      db,
      `
        SELECT *
        FROM roster_sync_runs
        ORDER BY id DESC
        LIMIT 1
      `,
    )

    return { players, latestSync }
  }

  async function reviewRosterPlayer(playerId, payload) {
    const pos = String(payload.pos || "").trim().toUpperCase()
    if (!APP_POSITIONS.has(pos)) {
      throw new Error("Invalid player position")
    }

    await run(
      db,
      `
        UPDATE players
        SET
          pos = ?,
          active = ?,
          img = COALESCE(?, img),
          needs_review = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        pos,
        payload.active === false ? 0 : 1,
        payload.img ? String(payload.img) : null,
        playerId,
      ],
    )

    return getRosterReview()
  }

  async function syncRosterFromSource() {
    try {
      const html = await fetchRosterHtml(fetchImpl)
      return await applyRosterSync(db, html)
    } catch (error) {
      await run(
        db,
        `
          INSERT INTO roster_sync_runs (
            started_at,
            completed_at,
            status,
            error_message
          )
          VALUES (?, ?, 'failed', ?)
        `,
        [nowIso(), nowIso(), error.message],
      )
      throw error
    }
  }

  return {
    getPlayersWithPractice,
    updatePracticeStat,
    resetPracticeStats,
    getGameSnapshot,
    saveGameSnapshot,
    resetGameSnapshot,
    handleGameMainAction,
    toggleGamePlayer,
    adjustGameFoul,
    syncGameClockSeconds,
    adjustGameClockSeconds,
    resetGameHalf,
    getRosterReview,
    reviewRosterPlayer,
    syncRosterFromSource,
  }
}
