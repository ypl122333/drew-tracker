import assert from "node:assert/strict"
import test from "node:test"

import {
  adjustClockSnapshot,
  buildPlayerPayload,
  createDefaultGameSession,
  resolveMainAction,
  togglePlayerSnapshot,
} from "../../src/cloudflare/game-state.js"

const basePlayers = [
  {
    id: 1,
    name: "Starter One",
    number: 1,
    pos: "PG",
    img: "/Photos/One.png",
    currentStint: 0,
    totalSeconds: 0,
    fouls: 0,
    isOnCourt: true,
    lastSubOutClock: null,
    subOutGameClock: null,
  },
  {
    id: 2,
    name: "Bench Two",
    number: 2,
    pos: "SG",
    img: "/Photos/Two.png",
    currentStint: 90,
    totalSeconds: 120,
    fouls: 1,
    isOnCourt: false,
    lastSubOutClock: "18:30",
    subOutGameClock: 1110,
  },
]

test("createDefaultGameSession mirrors the current FastAPI defaults", () => {
  assert.deepEqual(createDefaultGameSession(), {
    gameClockSeconds: 1200,
    gameState: "SETUP",
    gameStatusText: null,
    gameMainButtonText: null,
  })
})

test("togglePlayerSnapshot records sub-out clock and resets current stint", () => {
  const snapshot = {
    ...createDefaultGameSession(),
    gameState: "PAUSED",
    players: basePlayers,
  }

  const next = togglePlayerSnapshot(snapshot, 1)

  assert.equal(next.players[0].isOnCourt, false)
  assert.equal(next.players[0].lastSubOutClock, "20:00")
  assert.equal(next.players[0].subOutGameClock, 1200)
  assert.equal(next.players[0].currentStint, 0)
})

test("togglePlayerSnapshot prevents adding a sixth player after setup", () => {
  const snapshot = {
    ...createDefaultGameSession(),
    gameState: "PAUSED",
    players: [
      ...Array.from({ length: 5 }, (_, index) => ({
        ...basePlayers[0],
        id: index + 1,
        isOnCourt: true,
      })),
      { ...basePlayers[1], id: 99, isOnCourt: false },
    ],
  }

  assert.throws(() => togglePlayerSnapshot(snapshot, 99), /Max 5 players/)
})

test("resolveMainAction follows setup, pause, play, and half-ended transitions", () => {
  assert.deepEqual(
    resolveMainAction({
      gameClockSeconds: 1200,
      gameState: "SETUP",
      onCourtCount: 5,
      allowShortHanded: false,
      nowIso: "2026-05-05T10:00:00.000Z",
    }),
    {
      gameClockSeconds: 1200,
      gameState: "PAUSED",
      gameStatusText: "READY",
      gameMainButtonText: null,
      lastStartedAt: null,
    },
  )

  assert.deepEqual(
    resolveMainAction({
      gameClockSeconds: 1200,
      gameState: "PAUSED",
      onCourtCount: 5,
      allowShortHanded: false,
      nowIso: "2026-05-05T10:00:00.000Z",
    }),
    {
      gameClockSeconds: 1200,
      gameState: "PLAYING",
      gameStatusText: null,
      gameMainButtonText: null,
      lastStartedAt: "2026-05-05T10:00:00.000Z",
    },
  )

  assert.deepEqual(
    resolveMainAction({
      gameClockSeconds: 1200,
      gameState: "PLAYING",
      onCourtCount: 5,
      allowShortHanded: false,
      nowIso: "2026-05-05T10:00:00.000Z",
    }),
    {
      gameClockSeconds: 1200,
      gameState: "PAUSED",
      gameStatusText: "PAUSED",
      gameMainButtonText: "RESUME CLOCK",
      lastStartedAt: null,
    },
  )

  assert.throws(
    () =>
      resolveMainAction({
        gameClockSeconds: 0,
        gameState: "PAUSED",
        onCourtCount: 5,
        allowShortHanded: false,
        nowIso: "2026-05-05T10:00:00.000Z",
      }),
    /Period Ended/,
  )
})

test("adjustClockSnapshot moves active player time when the scoreboard is synced", () => {
  const snapshot = {
    ...createDefaultGameSession(),
    players: basePlayers,
  }

  const next = adjustClockSnapshot(snapshot, 1185)

  assert.equal(next.gameClockSeconds, 1185)
  assert.equal(next.players[0].currentStint, 15)
  assert.equal(next.players[0].totalSeconds, 15)
  assert.equal(next.players[1].currentStint, 90)
  assert.equal(next.players[1].totalSeconds, 120)
})

test("buildPlayerPayload preserves practice stats and game fields for API snapshots", () => {
  const row = {
    id: 1,
    name: "Starter One",
    number: 1,
    pos: "PG",
    img: "/Photos/One.png",
    charges: 1,
    sprint: 2,
    bDrives: 3,
    pTouch: 4,
    ast: 5,
    stl: 6,
    defl: 7,
    dReb: 8,
    oReb: 9,
    current_stint: 12,
    total_seconds: 34,
    fouls: 2,
    is_on_court: 1,
    last_sub_out_clock: "12:34",
    sub_out_game_clock: 754,
  }

  assert.deepEqual(buildPlayerPayload(row), {
    id: 1,
    name: "Starter One",
    number: 1,
    pos: "PG",
    img: "/Photos/One.png",
    active: true,
    needsReview: false,
    sourcePos: null,
    sourcePlayerId: null,
    profileUrl: null,
    imageUrl: null,
    practiceStats: {
      charges: 1,
      sprint: 2,
      bDrives: 3,
      pTouch: 4,
      ast: 5,
      stl: 6,
      defl: 7,
      dReb: 8,
      oReb: 9,
    },
    practiceTotal: 45,
    currentStint: 12,
    totalSeconds: 34,
    fouls: 2,
    isOnCourt: true,
    lastSubOutClock: "12:34",
    subOutGameClock: 754,
  })
})
