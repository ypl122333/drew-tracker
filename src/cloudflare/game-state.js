import { GAME_SESSION_DEFAULTS, PRACTICE_STAT_KEYS } from "./constants.js"

export function createDefaultGameSession() {
  return { ...GAME_SESSION_DEFAULTS }
}

export function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds)
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0")
  const seconds = String(safeSeconds % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}

function cloneSnapshot(snapshot) {
  return {
    ...snapshot,
    players: (snapshot.players || []).map((player) => ({ ...player })),
  }
}

function countOnCourt(players) {
  return players.filter((player) => player.isOnCourt).length
}

export function togglePlayerSnapshot(snapshot, playerId) {
  const next = cloneSnapshot(snapshot)
  const player = next.players.find((candidate) => candidate.id === playerId)

  if (!player) {
    throw new Error(`Player ${playerId} not found`)
  }

  if (next.gameState === "SETUP") {
    player.isOnCourt = !player.isOnCourt
    return next
  }

  if (player.isOnCourt) {
    player.isOnCourt = false
    player.lastSubOutClock = formatClock(next.gameClockSeconds)
    player.subOutGameClock = next.gameClockSeconds
    player.currentStint = 0
    return next
  }

  if (countOnCourt(next.players) >= 5) {
    throw new Error("Max 5 players! Sub someone OUT first.")
  }

  player.isOnCourt = true
  player.currentStint = 0
  return next
}

export function resolveMainAction({
  gameClockSeconds,
  gameState,
  onCourtCount,
  allowShortHanded = false,
  nowIso,
}) {
  if (gameState === "SETUP") {
    if (onCourtCount !== 5 && !allowShortHanded) {
      throw new Error(`Starts with ${onCourtCount} players. Continue?`)
    }

    return {
      gameClockSeconds,
      gameState: "PAUSED",
      gameStatusText: "READY",
      gameMainButtonText: null,
      lastStartedAt: null,
    }
  }

  if (gameState === "PAUSED") {
    if (gameClockSeconds <= 0) {
      throw new Error("Period Ended. Reset Half before starting again.")
    }

    return {
      gameClockSeconds,
      gameState: "PLAYING",
      gameStatusText: null,
      gameMainButtonText: null,
      lastStartedAt: nowIso,
    }
  }

  if (gameState === "PLAYING") {
    return {
      gameClockSeconds,
      gameState: "PAUSED",
      gameStatusText: "PAUSED",
      gameMainButtonText: "RESUME CLOCK",
      lastStartedAt: null,
    }
  }

  return {
    gameClockSeconds,
    gameState,
    gameStatusText: null,
    gameMainButtonText: null,
    lastStartedAt: null,
  }
}

export function adjustClockSnapshot(snapshot, newSeconds) {
  const next = cloneSnapshot(snapshot)
  const safeSeconds = Math.max(0, newSeconds)
  const diffSeconds = next.gameClockSeconds - safeSeconds

  next.gameClockSeconds = safeSeconds
  next.players = next.players.map((player) => {
    if (!player.isOnCourt) {
      return player
    }

    return {
      ...player,
      currentStint: Math.max(0, player.currentStint + diffSeconds),
      totalSeconds: Math.max(0, player.totalSeconds + diffSeconds),
    }
  })

  return next
}

export function buildPracticeStats(row) {
  return Object.fromEntries(
    PRACTICE_STAT_KEYS.map((key) => [key, Number(row[key] || 0)]),
  )
}

export function buildPlayerPayload(row) {
  const practiceStats = buildPracticeStats(row)

  return {
    id: row.id,
    name: row.name,
    number: row.number,
    pos: row.pos,
    img: row.img,
    active: Boolean(row.active ?? 1),
    needsReview: Boolean(row.needs_review ?? 0),
    sourcePos: row.source_pos ?? null,
    sourcePlayerId: row.source_player_id ?? null,
    profileUrl: row.profile_url ?? null,
    imageUrl: row.image_url ?? null,
    practiceStats,
    practiceTotal: Object.values(practiceStats).reduce((sum, value) => sum + value, 0),
    currentStint: row.current_stint || 0,
    totalSeconds: row.total_seconds || 0,
    fouls: row.fouls || 0,
    isOnCourt: Boolean(row.is_on_court),
    lastSubOutClock: row.last_sub_out_clock ?? null,
    subOutGameClock: row.sub_out_game_clock ?? null,
  }
}
