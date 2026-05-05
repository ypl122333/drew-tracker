<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  createEmptyPracticeStats,
  createPlayerState,
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
const practiceSyncInterval = ref(null)
const gameSyncInterval = ref(null)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
const PRACTICE_SYNC_INTERVAL_MS = 2000
const GAME_SYNC_INTERVAL_MS = 500
const isInitializing = ref(true)
const initializationError = ref("")
const isPracticeSyncing = ref(false)
const practiceSyncError = ref("")
const isGameSyncing = ref(false)
const gameSyncError = ref("")
const latestGameRequestId = ref(0)

function calculatePracticeTotal(practiceStats) {
  return practiceCategories.reduce(
    (sum, category) => sum + (practiceStats?.[category.key] || 0),
    0,
  )
}

function createSyncedPlayerState(rawPlayer) {
  const basePlayer = createPlayerState(rawPlayer)
  const practiceStats = {
    ...createEmptyPracticeStats(),
    ...(rawPlayer.practiceStats || {}),
  }

  return {
    ...basePlayer,
    currentStint: rawPlayer.currentStint ?? 0,
    totalSeconds: rawPlayer.totalSeconds ?? 0,
    fouls: rawPlayer.fouls ?? 0,
    isOnCourt: rawPlayer.isOnCourt ?? false,
    lastSubOutClock: rawPlayer.lastSubOutClock ?? null,
    subOutGameClock: rawPlayer.subOutGameClock ?? null,
    practiceStats,
    practiceTotal: rawPlayer.practiceTotal ?? calculatePracticeTotal(practiceStats),
  }
}

function buildPlayersFromBackend(rawPlayers, { preserveCurrentOrder = true } = {}) {
  const currentOrderById = new Map(players.value.map((player, index) => [player.id, index]))
  const nextPlayers = rawPlayers.map((player) => createSyncedPlayerState(player))

  if (preserveCurrentOrder && currentOrderById.size > 0) {
    nextPlayers.sort(
      (a, b) => (currentOrderById.get(a.id) ?? a.id) - (currentOrderById.get(b.id) ?? b.id),
    )
  }

  return nextPlayers
}

function applyGameSnapshot(snapshot, options = {}) {
  players.value = buildPlayersFromBackend(snapshot.players || [], options)
  gameClockSeconds.value = snapshot.gameClockSeconds ?? 1200
  gameState.value = snapshot.gameState ?? "SETUP"
  gameStatusText.value = snapshot.gameStatusText ?? null
  gameMainButtonText.value = snapshot.gameMainButtonText ?? null
}

async function fetchBackendData(endpoint) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`)

  if (!response.ok) {
    throw new Error(`Failed to load ${endpoint}: ${response.status}`)
  }

  return response.json()
}

async function syncPracticeState({ silent = false } = {}) {
  if (isPracticeSyncing.value) {
    return
  }

  try {
    isPracticeSyncing.value = true
    const backendPlayers = await fetchBackendData("/practice")
    players.value = buildPlayersFromBackend(backendPlayers, {
      preserveCurrentOrder: currentView.value !== "practice",
    })
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

async function syncGameState({ silent = false } = {}) {
  if (isGameSyncing.value) {
    return
  }

  const requestId = ++latestGameRequestId.value

  try {
    isGameSyncing.value = true
    const snapshot = await fetchBackendData("/game")
    if (requestId !== latestGameRequestId.value) {
      return
    }

    applyGameSnapshot(snapshot)
    gameSyncError.value = ""
  } catch (error) {
    console.error("Game sync failed:", error)
    gameSyncError.value = "Game sync paused. Retrying..."

    if (!silent) {
      throw error
    }
  } finally {
    if (requestId === latestGameRequestId.value) {
      isGameSyncing.value = false
    }
  }
}

async function sendGameCommand(endpoint, payload = undefined) {
  const requestId = ++latestGameRequestId.value

  try {
    isGameSyncing.value = true
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      const detail = errorPayload?.detail || `Failed to save ${endpoint}: ${response.status}`
      throw new Error(detail)
    }

    const snapshot = await response.json()
    if (requestId !== latestGameRequestId.value) {
      return
    }

    applyGameSnapshot(snapshot)
    gameSyncError.value = ""
  } catch (error) {
    console.error("Game command failed:", error)
    gameSyncError.value = error.message || "Could not save game changes."
  } finally {
    if (requestId === latestGameRequestId.value) {
      isGameSyncing.value = false
    }
  }
}

async function initializeAppState() {
  try {
    initializationError.value = ""
    const snapshot = await fetchBackendData("/game")
    applyGameSnapshot(snapshot, { preserveCurrentOrder: false })
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

function startGameSync() {
  if (gameSyncInterval.value) {
    return
  }

  gameSyncInterval.value = setInterval(() => {
    syncGameState({ silent: true })
  }, GAME_SYNC_INTERVAL_MS)
}

function stopGameSync() {
  if (!gameSyncInterval.value) {
    return
  }

  clearInterval(gameSyncInterval.value)
  gameSyncInterval.value = null
}

function switchView(view) {
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
    players.value = buildPlayersFromBackend(backendPlayers, {
      preserveCurrentOrder: currentView.value !== "practice",
    })
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

watch(currentView, async (view) => {
  if (view === "practice" && !isInitializing.value && !initializationError.value) {
    await syncPracticeState({ silent: true })
    startPracticeSync()
  } else {
    stopPracticeSync()
  }

  if (view === "game" && !isInitializing.value && !initializationError.value) {
    await syncGameState({ silent: true })
    startGameSync()
  } else {
    stopGameSync()
  }
})

function togglePlayerOnCourt(playerId) {
  sendGameCommand(`/game/players/${playerId}/toggle`)
}

function handleMainAction() {
  const onCourtCount = players.value.filter((player) => player.isOnCourt).length

  if (gameState.value === "SETUP" && onCourtCount !== 5) {
    const confirmed = window.confirm(`Starts with ${onCourtCount} players. Continue?`)
    if (!confirmed) {
      return
    }

    sendGameCommand("/game/main-action", { allowShortHanded: true })
    return
  }

  sendGameCommand("/game/main-action", { allowShortHanded: false })
}

function adjustFoul(playerId, delta) {
  sendGameCommand(`/game/players/${playerId}/fouls`, { delta })
}

function syncGameClock(newSeconds) {
  sendGameCommand("/game/clock/sync", { seconds: newSeconds })
}

function adjustGameClock(delta) {
  sendGameCommand("/game/clock/adjust", { delta })
}

function resetHalf() {
  const confirmed = window.confirm("Start 2nd Half?")
  if (!confirmed) return

  sendGameCommand("/game/reset-half")
}

function resetGameSetup() {
  const confirmed = window.confirm("New Game? This will clear all shared game data.")
  if (!confirmed) return

  sendGameCommand("/game/reset")
}

onMounted(() => {
  initializeAppState()
})

onBeforeUnmount(() => {
  stopPracticeSync()
  stopGameSync()
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
    :is-syncing="isGameSyncing"
    :sync-error="gameSyncError"
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
