<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  createEmptyPracticeStats,
  createPlayerState,
  defaultStarterNames,
  practiceCategories,
} from "./data/players"
import LandingView from "./components/LandingView.vue"
import PracticeView from "./components/PracticeView.vue"
import GameView from "./components/GameView.vue"

const currentView = ref("landing")
const players = ref([])
const gameClockSeconds = ref(1200)
const gameState = ref("SETUP")
const gameStatusText = ref(null)
const gameMainButtonText = ref(null)
const tickerInterval = ref(null)
const practiceSyncInterval = ref(null)
const STORAGE_KEY = "drewTrackerState_v24_vue"
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
const PRACTICE_SYNC_INTERVAL_MS = 2000
const isInitializing = ref(true)
const initializationError = ref("")
const isPracticeSyncing = ref(false)
const practiceSyncError = ref("")

function calculatePracticeTotal(practiceStats) {
  return practiceCategories.reduce(
    (sum, category) => sum + (practiceStats?.[category.key] || 0),
    0,
  )
}

function createSyncedPlayerState(rawPlayer, existingPlayer = null) {
  const basePlayer = createPlayerState(rawPlayer)
  const practiceStats = {
    ...createEmptyPracticeStats(),
    ...(rawPlayer.practiceStats || {}),
  }

  return {
    ...basePlayer,
    ...(existingPlayer
      ? {
          currentStint: existingPlayer.currentStint ?? basePlayer.currentStint,
          totalSeconds: existingPlayer.totalSeconds ?? basePlayer.totalSeconds,
          fouls: existingPlayer.fouls ?? basePlayer.fouls,
          isOnCourt: existingPlayer.isOnCourt ?? basePlayer.isOnCourt,
          lastSubOutClock: existingPlayer.lastSubOutClock ?? basePlayer.lastSubOutClock,
          subOutGameClock: existingPlayer.subOutGameClock ?? basePlayer.subOutGameClock,
        }
      : {}),
    practiceStats,
    practiceTotal: rawPlayer.practiceTotal ?? calculatePracticeTotal(practiceStats),
  }
}

function buildPlayersFromBackend(
  rawPlayers,
  { preserveCurrentState = true, preserveCurrentOrder = true } = {},
) {
  const existingPlayersById = new Map(players.value.map((player) => [player.id, player]))
  const currentOrderById = new Map(players.value.map((player, index) => [player.id, index]))

  const nextPlayers = rawPlayers.map((player) =>
    createSyncedPlayerState(
      player,
      preserveCurrentState ? existingPlayersById.get(player.id) : null,
    ),
  )

  if (preserveCurrentOrder && currentOrderById.size > 0) {
    nextPlayers.sort(
      (a, b) => (currentOrderById.get(a.id) ?? a.id) - (currentOrderById.get(b.id) ?? b.id),
    )
  }

  return nextPlayers
}

function saveGameState() {
  const state = {
    players: players.value.map((player) => ({
      id: player.id,
      currentStint: player.currentStint,
      totalSeconds: player.totalSeconds,
      fouls: player.fouls,
      isOnCourt: player.isOnCourt,
      lastSubOutClock: player.lastSubOutClock,
      subOutGameClock: player.subOutGameClock,
    })),
    gameClockSeconds: gameClockSeconds.value,
    gameState: gameState.value === "PLAYING" ? "PAUSED" : gameState.value,
    gameStatusText: gameState.value === "PLAYING" ? "PAUSED" : gameStatusText.value,
    gameMainButtonText: gameState.value === "PLAYING" ? "RESUME CLOCK" : gameMainButtonText.value,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function mergePlayersWithSavedState(basePlayers, savedPlayers) {
  return basePlayers.map((basePlayer) => {
    const savedPlayer = savedPlayers.find((player) => player.id === basePlayer.id)

    if (!savedPlayer) {
      return basePlayer
    }

    return {
      ...basePlayer,
      currentStint: savedPlayer.currentStint ?? basePlayer.currentStint,
      totalSeconds: savedPlayer.totalSeconds ?? basePlayer.totalSeconds,
      fouls: savedPlayer.fouls ?? basePlayer.fouls,
      isOnCourt: savedPlayer.isOnCourt ?? basePlayer.isOnCourt,
      lastSubOutClock: savedPlayer.lastSubOutClock ?? basePlayer.lastSubOutClock,
      subOutGameClock: savedPlayer.subOutGameClock ?? basePlayer.subOutGameClock,
    }
  })
}

function loadGameState(basePlayers) {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) {
    players.value = basePlayers
    return false
  }

  try {
    const parsed = JSON.parse(saved)

    if (Array.isArray(parsed.players)) {
      players.value = mergePlayersWithSavedState(basePlayers, parsed.players)
    } else {
      players.value = basePlayers
    }

    if (typeof parsed.gameClockSeconds === "number") {
      gameClockSeconds.value = parsed.gameClockSeconds
    }

    gameState.value = parsed.gameState || "PAUSED"
    gameStatusText.value = parsed.gameStatusText || null
    gameMainButtonText.value = parsed.gameMainButtonText || null
    return true
  } catch (error) {
    console.error("Load game state failed:", error)
    players.value = basePlayers
    return false
  }
}

async function fetchBackendPlayers(endpoint = "/players") {
  const response = await fetch(`${API_BASE_URL}${endpoint}`)

  if (!response.ok) {
    throw new Error(`Failed to load players: ${response.status}`)
  }

  return response.json()
}

async function syncPracticeState({ silent = false } = {}) {
  if (isPracticeSyncing.value) {
    return
  }

  try {
    isPracticeSyncing.value = true
    const backendPlayers = await fetchBackendPlayers("/practice")
    players.value = buildPlayersFromBackend(backendPlayers)
    practiceSyncError.value = ""
  } catch (error) {
    console.error("Practice sync failed:", error)
    practiceSyncError.value = "Practice sync paused. Retrying..."

    if (!silent) {
      throw error
    }
  } finally {
    isPracticeSyncing.value = false
  }
}

async function initializeAppState() {
  try {
    initializationError.value = ""
    const backendPlayers = await fetchBackendPlayers("/players")
    const initialPlayers = buildPlayersFromBackend(backendPlayers, {
      preserveCurrentState: false,
      preserveCurrentOrder: false,
    })
    const hasSavedGameState = loadGameState(initialPlayers)

    if (!hasSavedGameState) {
      setDefaultStarters()
    }
  } catch (error) {
    console.error("Failed to initialize app state:", error)
    initializationError.value = "Could not load players from the backend. Make sure FastAPI is running on http://localhost:8000."
    players.value = []
  } finally {
    isInitializing.value = false
  }
}

function startPracticeSync() {
  if (practiceSyncInterval.value) {
    return
  }

  practiceSyncInterval.value = setInterval(() => {
    syncPracticeState({ silent: true })
  }, PRACTICE_SYNC_INTERVAL_MS)
}

function stopPracticeSync() {
  if (!practiceSyncInterval.value) {
    return
  }

  clearInterval(practiceSyncInterval.value)
  practiceSyncInterval.value = null
}

function switchView(view) {
  if (currentView.value === "game" && view !== "game" && gameState.value === "PLAYING") {
    gameState.value = "PAUSED"
    gameStatusText.value = "PAUSED"
    gameMainButtonText.value = "RESUME CLOCK"
    stopTicker()
  }

  currentView.value = view
}

async function updatePracticeStat(playerId, key, delta) {
  try {
    const response = await fetch(`${API_BASE_URL}/practice/${playerId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statKey: key,
        delta,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to update practice stat: ${response.status}`)
    }

    const backendPlayers = await response.json()
    players.value = buildPlayersFromBackend(backendPlayers)
    practiceSyncError.value = ""
  } catch (error) {
    console.error("Practice update failed:", error)
    practiceSyncError.value = "Could not save practice update."
  }
}

function sortPracticePlayers() {
  players.value.sort((a, b) => (b.practiceTotal || 0) - (a.practiceTotal || 0))
}

async function resetPractice() {
  try {
    const response = await fetch(`${API_BASE_URL}/practice/reset`, {
      method: "POST",
    })

    if (!response.ok) {
      throw new Error(`Failed to reset practice stats: ${response.status}`)
    }

    const backendPlayers = await response.json()
    players.value = buildPlayersFromBackend(backendPlayers, {
      preserveCurrentOrder: false,
    })
    practiceSyncError.value = ""
  } catch (error) {
    console.error("Practice reset failed:", error)
    practiceSyncError.value = "Could not reset practice stats."
  }
}

function exportGameData() {
  const rows = [
    ["Name", "Number", "Minutes", "Fouls"],
    ...players.value.map((player) => [
      player.name,
      player.number,
      (player.totalSeconds / 60).toFixed(1),
      player.fouls,
    ]),
  ]

  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n")

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = `Stats_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

watch(
  [players, gameClockSeconds, gameState, gameStatusText, gameMainButtonText],
  () => {
    if (isInitializing.value || initializationError.value) {
      return
    }

    saveGameState()
  },
  { deep: true },
)

watch(currentView, async (view) => {
  if (view === "practice" && !isInitializing.value && !initializationError.value) {
    await syncPracticeState({ silent: true })
    startPracticeSync()
    return
  }

  stopPracticeSync()
})

function setDefaultStarters() {
  players.value.forEach((player) => {
    player.isOnCourt = defaultStarterNames.some((name) => player.name.includes(name))
  })
}

function togglePlayerOnCourt(playerId) {
  const player = players.value.find((p) => p.id === playerId)
  if (!player) return

  const onCourtCount = players.value.filter((p) => p.isOnCourt).length

  if (gameState.value === "SETUP") {
    player.isOnCourt = !player.isOnCourt
    return
  }

  if (player.isOnCourt) {
    player.isOnCourt = false
    player.lastSubOutClock = formatClock(gameClockSeconds.value)
    player.subOutGameClock = gameClockSeconds.value
    player.currentStint = 0
    return
  }

  if (onCourtCount >= 5) {
    window.alert("Max 5 players! Sub someone OUT first.")
    return
  }

  player.isOnCourt = true
  player.currentStint = 0
}

function handleMainAction() {
  const onCourtCount = players.value.filter((p) => p.isOnCourt).length

  if (gameState.value === "SETUP") {
    if (onCourtCount !== 5) {
      const confirmed = window.confirm(`Starts with ${onCourtCount} players. Continue?`)
      if (!confirmed) return
    }

    gameState.value = "PAUSED"
    gameStatusText.value = "READY"
    gameMainButtonText.value = null
    return
  }

  if (gameState.value === "PAUSED") {
    if (gameClockSeconds.value <= 0) {
      window.alert("Period Ended. Reset Half before starting again.")
      return
    }

    gameState.value = "PLAYING"
    gameStatusText.value = null
    gameMainButtonText.value = null
    startTicker()
    return
  }

  if (gameState.value === "PLAYING") {
    gameState.value = "PAUSED"
    gameStatusText.value = "PAUSED"
    gameMainButtonText.value = "RESUME CLOCK"
    stopTicker()
  }
}

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0")
  const s = (totalSeconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

function adjustFoul(playerId, delta) {
  const player = players.value.find((p) => p.id === playerId)
  if (!player) return

  const newFouls = player.fouls + delta
  if (newFouls < 0) return

  player.fouls = newFouls
}

function syncGameClock(newSeconds) {
  const safeSeconds = Math.max(0, newSeconds)
  const diffSeconds = gameClockSeconds.value - safeSeconds

  players.value.forEach((player) => {
    if (player.isOnCourt) {
      player.currentStint = Math.max(0, player.currentStint + diffSeconds)
      player.totalSeconds = Math.max(0, player.totalSeconds + diffSeconds)
    }
  })

  gameClockSeconds.value = safeSeconds
}

function adjustGameClock(delta) {
  syncGameClock(gameClockSeconds.value + delta)
}

function startTicker() {
  stopTicker()

  tickerInterval.value = setInterval(() => {
    if (gameClockSeconds.value > 0) {
      gameClockSeconds.value -= 1
    } else {
      stopTicker()
      gameState.value = "PAUSED"
      gameStatusText.value = "HALF ENDED"
      gameMainButtonText.value = "HALF ENDED"
      window.alert("Period Ended")
      return
    }

    players.value.forEach((player) => {
      if (player.isOnCourt) {
        player.currentStint += 1
        player.totalSeconds += 1
      }
    })
  }, 1000)
}

function stopTicker() {
  if (!tickerInterval.value) return

  clearInterval(tickerInterval.value)
  tickerInterval.value = null
}

function resetHalf() {
  const confirmed = window.confirm("Start 2nd Half?")
  if (!confirmed) return

  stopTicker()
  gameClockSeconds.value = 1200
  gameState.value = "PAUSED"
  gameStatusText.value = "PAUSED"
  gameMainButtonText.value = "START 2ND HALF"

  players.value.forEach((player) => {
    player.currentStint = 0
    player.lastSubOutClock = null
    player.subOutGameClock = null
  })
}

function resetGameSetup() {
  const confirmed = window.confirm("New Game? This will clear all saved data.")
  if (!confirmed) return

  stopTicker()
  localStorage.removeItem(STORAGE_KEY)

  gameState.value = "SETUP"
  gameClockSeconds.value = 1200
  gameStatusText.value = null
  gameMainButtonText.value = null

  players.value.forEach((player) => {
    player.currentStint = 0
    player.totalSeconds = 0
    player.fouls = 0
    player.lastSubOutClock = null
    player.subOutGameClock = null
  })

  setDefaultStarters()
}

onMounted(() => {
  initializeAppState()
})

onBeforeUnmount(() => {
  stopTicker()
  stopPracticeSync()
})
</script>

<template>
  <div
    v-if="isInitializing"
    class="min-h-screen flex items-center justify-center bg-[#0f2218] text-white px-6 text-center"
  >
    <div>
      <div class="text-3xl font-black uppercase tracking-wider">
        Loading Roster
      </div>
      <p class="mt-3 text-sm text-green-200">
        Connecting to the FastAPI backend...
      </p>
    </div>
  </div>

  <div
    v-else-if="initializationError"
    class="min-h-screen flex items-center justify-center bg-[#2a1111] text-white px-6"
  >
    <div class="max-w-lg text-center">
      <div class="text-3xl font-black uppercase tracking-wider text-red-200">
        Backend Unavailable
      </div>
      <p class="mt-3 text-sm text-red-100">
        {{ initializationError }}
      </p>
      <button
        class="mt-6 bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-2 rounded font-bold uppercase tracking-wide transition-colors"
        @click="initializeAppState"
      >
        Retry
      </button>
    </div>
  </div>

  <LandingView
    v-else-if="currentView === 'landing'"
    @switch-view="switchView"
  />

  <PracticeView
    v-else-if="currentView === 'practice'"
    :players="players"
    :is-syncing="isPracticeSyncing"
    :sync-error="practiceSyncError"
    @switch-view="switchView"
    @update-practice-stat="updatePracticeStat"
    @sort-practice="sortPracticePlayers"
    @reset-practice="resetPractice"
  />

  <GameView
    v-else-if="currentView === 'game'"
    :players="players"
    :game-clock-seconds="gameClockSeconds"
    :game-state="gameState"
    :status-text-override="gameStatusText"
    :main-button-text-override="gameMainButtonText"
    @switch-view="switchView"
    @toggle-player="togglePlayerOnCourt"
    @main-action="handleMainAction"
    @reset-game="resetGameSetup"
    @reset-half="resetHalf"
    @adjust-foul="adjustFoul"
    @adjust-clock="adjustGameClock"
    @sync-clock="syncGameClock"
    @export-game="exportGameData"
  />
</template>
