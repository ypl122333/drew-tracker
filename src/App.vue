
<script setup>
import { ref, onBeforeUnmount, onMounted, watch } from "vue"
import {
  createPlayerState,
  defaultStarterNames,
  createEmptyPracticeStats,
  practiceCategories,
} from "./data/players"

//导入子组件
//只有在这里导入，才能在后面的template中使用
import LandingView from "./components/LandingView.vue"
import PracticeView from "./components/PracticeView.vue"
import GameView from "./components/GameView.vue"

//响应式变量：当这些值改变时，依赖它们的 UI 会自动更新
// 括号里是初始值
const currentView = ref("landing")
const players = ref([])
const gameClockSeconds = ref(1200)
const gameState = ref("SETUP")
const gameStatusText = ref(null)
const gameMainButtonText = ref(null)
const tickerInterval = ref(null)
const STORAGE_KEY = "drewTrackerState_v23_vue"
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
const isInitializing = ref(true)
const initializationError = ref("")

//页面切换
function switchView(view) {
  //如果比赛正在计时，离开Game页面时先暂停计时器
  if (currentView.value === "game" && view !== "game" && gameState.value === "PLAYING") {
    gameState.value = "PAUSED"
    gameStatusText.value = "PAUSED"
    gameMainButtonText.value = "RESUME CLOCK"
    stopTicker()
  }

  currentView.value = view
}

// 为什么很多关于Practice/Game功能的函数要写在App这里？
// A:因为players等变量是根组件的变量，需要服从“谁拥有数据，谁管理逻辑”原则



//Practice功能逻辑区


function updatePracticeStat(playerId, key, delta) {
  const player = players.value.find((p) => p.id === playerId)
  if (!player) return

  if (!player.practiceStats) {
    player.practiceStats = createEmptyPracticeStats()
  }

  if (player.practiceStats[key] === undefined) {
    player.practiceStats[key] = 0
  }

  player.practiceStats[key] += delta

  player.practiceTotal = practiceCategories.reduce(
    (sum, category) => sum + (player.practiceStats[category.key] || 0),
    0,
  )
}

function sortPracticePlayers() {
  //留意sort语法，这里是降序
  players.value.sort((a, b) => (b.practiceTotal || 0) - (a.practiceTotal || 0))
}

function resetPractice() {
  players.value.forEach((player) => {
    if (!player.practiceStats) {
      player.practiceStats = createEmptyPracticeStats()
    }

    practiceCategories.forEach((category) => {
      player.practiceStats[category.key] = 0
    })

    player.practiceTotal = 0
  })

  players.value.sort((a, b) => a.id - b.id)
}

function mergePlayersWithSavedState(basePlayers, savedPlayers) {
  const mergedPlayers = basePlayers.map((basePlayer) => {
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
      practiceStats: {
        ...createEmptyPracticeStats(),
        ...(savedPlayer.practiceStats || {}),
      },
    }
  })

  mergedPlayers.forEach((player) => {
    player.practiceTotal = practiceCategories.reduce(
      (sum, category) => sum + (player.practiceStats?.[category.key] || 0),
      0,
    )
  })

  return mergedPlayers
}

function saveGameState() {
  const state = {
    players: players.value,
    gameClockSeconds: gameClockSeconds.value,
    gameState: gameState.value === "PLAYING" ? "PAUSED" : gameState.value,
    gameStatusText: gameState.value === "PLAYING" ? "PAUSED" : gameStatusText.value,
    gameMainButtonText: gameState.value === "PLAYING" ? "RESUME CLOCK" : gameMainButtonText.value,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}


//导出比赛数据
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
        .join(",")
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

async function loadPlayersFromBackend() {
  const response = await fetch(`${API_BASE_URL}/players`)

  if (!response.ok) {
    throw new Error(`Failed to load players: ${response.status}`)
  }

  const rawPlayers = await response.json()
  return rawPlayers.map((player) => createPlayerState(player))
}

async function initializeAppState() {
  try {
    initializationError.value = ""
    const backendPlayers = await loadPlayersFromBackend()
    const hasSavedGameState = loadGameState(backendPlayers)

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

watch(
  [players, gameClockSeconds, gameState, gameStatusText, gameMainButtonText],
  () => {
    if (isInitializing.value || initializationError.value) {
      return
    }

    saveGameState()
  },
  { deep: true }
)


//首发
function setDefaultStarters() {
  players.value.forEach((player) => {
    player.isOnCourt = defaultStarterNames.some((name) =>
      player.name.includes(name)
    )
  })
}


//换人
function togglePlayerOnCourt(playerId) {
//换人逻辑
// 找到球员
// ↓
// 如果 SETUP：随便切换上/下
// ↓
// 如果比赛中：
//   如果他在场 → 换下，并记录换下时间
//   如果他不在场：
//     如果场上已有5人 → 禁止
//     否则 → 换上
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

  //如果player.isOnCourt是true，代码不会走到这里，因此下面的case为：
  //比赛中，当球员不在场，且当前人数小于5时，选中的球员上场且时间当前清零
  //因为在比赛中发生，所以currentStint清空要写在这里
  player.isOnCourt = true
  player.currentStint = 0
}


//控制主按钮行为
function handleMainAction() {
  const onCourtCount = players.value.filter((p) => p.isOnCourt).length

  //选人阶段超过五人警告，若无视直接开始
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


//秒->显式时间
function formatClock(totalSeconds) {
  //计算分钟和秒分开计算，并补零：1:5 —> 01:05
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0")
  const s = (totalSeconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}


//计算犯规
function adjustFoul(playerId, delta) {
  const player = players.value.find((p) => p.id === playerId)
  if (!player) return

  //delta为+1/-1，使代码更优美
  const newFouls = player.fouls + delta
  if (newFouls < 0) return

  player.fouls = newFouls
}


//手动调表时，要同步修正场上球员的本段时间和总时间
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


//修改右上角时间
function adjustGameClock(delta) {
  syncGameClock(gameClockSeconds.value + delta)
}


//开启计时器
function startTicker() {
  //停止旧计时器
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

    //场上球员时间++
    players.value.forEach((player) => {
      if (player.isOnCourt) {
        player.currentStint += 1
        player.totalSeconds += 1
      }
    })
  }, 1000)
}


//停止计时器
function stopTicker() {
  if (!tickerInterval.value) return

  clearInterval(tickerInterval.value)
  tickerInterval.value = null
  //如果stopTicker是直接杀死这个计时器，那么为什么我在UI中点击start clock后，倒计时还是继续而不是被清零？
  //因为stopTicker杀死的是“每秒减 1 的循环”这个计时器，而不是数据本身，startTicker() 会创建一个新计时器，继续使用当前剩余时间
}


//重置半场（不会更改球员犯规次数和总上场时间）
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


//重开游戏
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

//组件被移除之前停止计时器，写在这里可能没有意义，考虑移除
onBeforeUnmount(() => {
  stopTicker()
})
</script>




<!-- 
使用条件渲染
底下这个就是页面的显示逻辑，currentView就相当于是一个旋钮，调到哪个值，就显示哪个页面
landing就是主页面，practice和game就是两个按钮下的两个不同的功能 
-->

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
