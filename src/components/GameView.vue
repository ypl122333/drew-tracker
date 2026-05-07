<script setup>
import { computed, ref } from "vue"

const props = defineProps({
  players: {
    type: Array,
    required: true,
  },
  gameClockSeconds: {
    type: Number,
    required: true,
  },
  gameState: {
    type: String,
    required: true,
  },
  statusTextOverride: {
    type: String,
    default: null,
  },
  mainButtonTextOverride: {
    type: String,
    default: null,
  },
  isSyncing: {
    type: Boolean,
    default: false,
  },
  syncError: {
    type: String,
    default: "",
  },
})

const emit = defineEmits([
  "switch-view",
  "toggle-player",
  "main-action",
  "reset-game",
  "reset-half",
  "adjust-foul",
  "adjust-clock",
  "sync-clock",
  "export-game",
])

const isBenchOpen = ref(false)
const detailPlayerId = ref(null)

const detailPlayer = computed(() =>
  props.players.find((player) => player.id === detailPlayerId.value)
)

const onCourtPlayers = computed(() =>
  [...props.players]
    .filter((player) => player.isOnCourt)
    .sort((a, b) => b.currentStint - a.currentStint)
)

const benchPlayers = computed(() =>
  props.players.filter((player) => !player.isOnCourt)
)

const onCourtCount = computed(() => onCourtPlayers.value.length)

const posOrder = ["PG", "SG", "SF", "PF", "C"]

const posNames = {
  PG: "Point Guards",
  SG: "Shooting Guards",
  SF: "Small Forwards",
  PF: "Power Forwards",
  C: "Centers",
}

const benchPlayersByPosition = computed(() => {
  return posOrder
    .map((pos) => {
      const players = benchPlayers.value
        .filter((player) => player.pos === pos)
        .sort((a, b) => a.id - b.id)

      return {
        pos,
        title: posNames[pos],
        players,
      }
    })
    .filter((group) => group.players.length > 0)
})

const statusText = computed(() => {
  if (props.statusTextOverride) return props.statusTextOverride
  if (props.gameState === "SETUP") return "PRE-GAME SETUP"
  if (props.gameState === "PAUSED") return "PAUSED"
  if (props.gameState === "PLAYING") return "LIVE"
  return "UNKNOWN"
})

const statusClass = computed(() => {
  if (props.gameState === "PLAYING") {
    return "text-[10px] font-bold text-red-400 uppercase tracking-widest animate-pulse"
  }

  if (props.statusTextOverride === "HALF ENDED") {
    return "text-[10px] font-bold text-red-300 uppercase tracking-widest"
  }

  if (props.statusTextOverride === "READY") {
    return "text-[10px] font-bold text-green-300 uppercase tracking-widest"
  }

  if (props.gameState === "PAUSED") {
    return "text-[10px] font-bold text-yellow-300 uppercase tracking-widest"
  }

  return "text-[10px] font-bold text-green-300 uppercase tracking-widest"
})

const mainButtonText = computed(() => {
  if (props.gameState === "SETUP") return "CONFIRM STARTERS"
  if (props.mainButtonTextOverride) return props.mainButtonTextOverride
  if (props.gameState === "PAUSED") return "START CLOCK"
  if (props.gameState === "PLAYING") return "STOP CLOCK"
  return "ACTION"
})

const mainButtonClass = computed(() => {
  const base =
    "flex-1 text-white py-2 rounded font-bold text-base shadow-sm transition-colors border-b-4 active:border-b-0 active:translate-y-1"

  if (props.gameState === "SETUP") {
    return `${base} bg-[#002f6c] hover:bg-[#003d8c] border-[#001f4c]`
  }

  if (props.mainButtonTextOverride === "START 2ND HALF") {
    return `${base} bg-[#002f6c] hover:bg-[#003d8c] border-[#001f4c]`
  }

  if (props.mainButtonTextOverride === "HALF ENDED") {
    return `${base} bg-red-700 hover:bg-red-600 border-red-900`
  }

  if (props.gameState === "PAUSED") {
    return `${base} bg-green-600 hover:bg-green-700 border-green-800`
  }

  if (props.gameState === "PLAYING") {
    return `${base} bg-red-600 hover:bg-red-700 border-red-800 animate-pulse`
  }

  return `${base} bg-gray-600 hover:bg-gray-700 border-gray-800`
})

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0")
  const s = (totalSeconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

function handleBenchPlayerClick(playerId) {
  emit("toggle-player", playerId)

  if (window.innerWidth < 768) {
    isBenchOpen.value = false
  }
}

function openPlayerDetail(playerId) {
  detailPlayerId.value = playerId
}

function closePlayerDetail() {
  detailPlayerId.value = null
}

function getRestTime(player) {
  if (player.isOnCourt) return player.currentStint
  if (player.subOutGameClock !== null) {
    return Math.max(0, player.subOutGameClock - props.gameClockSeconds)
  }

  return 0
}

function getAlertClass(player) {
  if (player.currentStint >= 240) return "alert-level-3"
  if (player.currentStint >= 180) return "alert-level-2"
  if (player.currentStint >= 120) return "alert-level-1"
  return ""
}

function syncClockManual() {
  const input = window.prompt(
    "SYNC: Enter scoreboard time (mm:ss).",
    formatClock(props.gameClockSeconds)
  )

  if (!input) return

  const parts = input.split(":")
  if (parts.length !== 2) return

  const minutes = Number.parseInt(parts[0], 10)
  const seconds = Number.parseInt(parts[1], 10)

  if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds < 0 || seconds > 59) {
    window.alert("Please enter time as mm:ss.")
    return
  }

  emit("sync-clock", minutes * 60 + seconds)
}

function handleBackClick() {
  const confirmed = window.confirm("Return to Main Menu?")
  if (confirmed) {
    emit("switch-view", "landing")
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-100">
    <div class="shrink-0 shadow-xl bg-white">
      <div class="bg-[#144935] text-white px-4 h-16 flex justify-between items-center border-b border-[#0e3325] relative">
        <div class="flex items-center gap-3 z-10">
          <button
            @click="handleBackClick"
            class="flex items-center text-green-300 hover:text-white transition-colors"
            title="Back to Menu"
          >
            <span class="ml-1 text-xs font-bold uppercase">Menu</span>
          </button>

          <div>
            <h1 class="text-xl font-extrabold tracking-tight leading-none">
              DREW MBB
            </h1>
            <span :class="statusClass">
              {{ statusText }}
            </span>
            <div class="text-[9px] uppercase tracking-[0.24em] text-green-200 mt-0.5">
              {{ syncError || (isSyncing ? "Syncing live game" : "Live sync connected") }}
            </div>
          </div>
        </div>

        <div class="absolute left-1/2 -translate-x-1/2 hidden md:block pointer-events-none">
          <img
            src="/Background.jpg"
            alt="Logo"
            class="h-12 object-contain drop-shadow-md rounded"
          />
        </div>

        <div class="flex flex-col items-end z-10">
          <button
            class="text-3xl font-mono font-black tracking-tighter leading-none hover:text-green-300 transition-colors cursor-pointer"
            title="Click to Edit Time"
            @click="syncClockManual"
          >
            {{ formatClock(gameClockSeconds) }}
          </button>

          <div class="flex gap-2 items-center mt-1">
            <button
              class="text-[9px] text-green-200 cursor-pointer hover:text-white"
              @click="syncClockManual"
            >
              TAP TO SYNC
            </button>

            <div class="flex gap-0.5">
              <button
                class="text-[9px] bg-white/10 hover:bg-white/20 border border-white/10 text-white px-1.5 rounded transition-colors"
                @click="emit('adjust-clock', 1)"
              >
                +1s
              </button>
              <button
                class="text-[9px] bg-white/10 hover:bg-white/20 border border-white/10 text-white px-1.5 rounded transition-colors"
                @click="emit('adjust-clock', -1)"
              >
                -1s
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white p-2 flex gap-2 border-b border-gray-300">
        <button :class="mainButtonClass" @click="emit('main-action')">
          {{ mainButtonText }}
        </button>

        <div class="flex gap-2">
          <button
            class="bg-gray-600 text-white px-3 py-2 rounded font-semibold text-xs shadow-sm hover:bg-gray-500 transition-colors"
            @click="emit('export-game')"
          >
            Export
          </button>

          <button
            class="bg-orange-600 text-white px-3 py-2 rounded font-semibold text-xs shadow-sm hover:bg-orange-500 transition-colors"
            @click="emit('reset-half')"
          >
            Reset Half
          </button>

          <button
            class="bg-red-700 text-white px-3 py-2 rounded font-semibold text-xs shadow-sm hover:bg-red-600 transition-colors"
            @click="emit('reset-game')"
          >
            New Game
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden relative">
      <div
        v-if="isBenchOpen"
        class="fixed inset-0 bg-black/50 z-40 md:hidden"
        @click="isBenchOpen = false"
      ></div>

      <div class="w-full md:w-5/12 flex flex-col bg-gray-50 border-r border-gray-300 relative z-10">
        <div class="bg-[#002f6c] text-white px-4 py-2 font-extrabold text-sm tracking-wider flex justify-between items-center border-b-4 border-[#57a51d]">
          <span>ON COURT</span>
          <span class="bg-green-600 text-white px-2 py-0.5 rounded text-sm">
            {{ onCourtCount }}/5
          </span>
        </div>

        <div class="flex-1 p-2 overflow-y-auto flex flex-col gap-2">
          <div
            v-for="player in onCourtPlayers"
            :key="player.id"
            :class="[
              'bg-[#002f6c] text-white border-l-[6px] border-[#57a51d] rounded-md flex items-center gap-2 p-2 cursor-pointer shadow relative overflow-hidden',
              getAlertClass(player)
            ]"
            @click="emit('toggle-player', player.id)"
          >
            <button
              class="photo-frame w-12 h-16 sm:w-16 sm:h-20 rounded border-2 border-white shrink-0 relative bg-gray-200 overflow-hidden"
              @click.stop="openPlayerDetail(player.id)"
            >
              <img
                :src="player.img"
                class="w-full h-full object-cover object-top"
              />
              <span class="absolute bottom-0 left-0 w-full text-center bg-black/70 text-white text-[9px] font-bold py-0.5">
                #{{ player.number }}
              </span>
            </button>

            <div class="flex-1 flex flex-col justify-center h-full min-w-0">
              <div class="mb-1">
                <h3 class="font-bold text-sm leading-tight text-white truncate">
                  {{ player.name.split(" ")[0] }}
                </h3>
                <h3 class="font-bold text-xs leading-tight text-blue-200 opacity-90 truncate">
                  {{ player.name.split(" ").slice(1).join(" ") }}
                </h3>
              </div>

              <div class="flex items-baseline gap-1">
                <div class="text-[8px] text-green-400 font-bold uppercase">
                  Stint
                </div>
                <div class="text-xl sm:text-2xl font-mono font-black text-white leading-none">
                  {{ formatClock(player.currentStint) }}
                </div>
              </div>
            </div>

            <div class="flex flex-col items-end justify-between border-l border-blue-900/50 pl-1 h-full py-1 gap-2 shrink-0">
              <div class="flex items-center gap-1 bg-blue-900/40 rounded px-1 py-0.5">
                <span class="text-[8px] text-blue-300 font-bold uppercase">Fouls</span>

                <span
                  :class="[
                    'text-lg font-bold leading-none min-w-[18px] text-center',
                    player.fouls >= 5 ? 'text-red-400' : 'text-white'
                  ]"
                >
                  {{ player.fouls }}
                </span>

                <div class="flex flex-col gap-px ml-1">
                  <button
                    class="w-4 h-4 bg-red-600 hover:bg-red-500 text-white rounded flex items-center justify-center text-[10px]"
                    @click.stop="emit('adjust-foul', player.id, 1)"
                  >
                    +
                  </button>
                  <button
                    class="w-4 h-4 bg-red-900 hover:bg-red-800 text-white rounded flex items-center justify-center text-[10px]"
                    @click.stop="emit('adjust-foul', player.id, -1)"
                  >
                    -
                  </button>
                </div>
              </div>

              <div class="text-[9px] text-blue-200">
                Total:
                <span class="font-mono font-bold text-white text-sm">
                  {{ Math.floor(player.totalSeconds / 60) }}
                </span>m
              </div>
            </div>
          </div>

          <div
            v-if="onCourtPlayers.length === 0"
            class="text-gray-400 text-sm text-center mt-6"
          >
            No players on court
          </div>
        </div>
      </div>

      <div
        :class="[
          'fixed inset-y-0 right-0 w-3/4 max-w-sm bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out md:static md:w-7/12 md:max-w-none md:translate-x-0 md:shadow-none md:z-auto flex flex-col',
          isBenchOpen ? 'translate-x-0' : 'translate-x-full'
        ]"
      >
        <div class="bg-gray-100 text-gray-600 px-4 py-2 font-extrabold text-sm tracking-wider border-b border-gray-300 flex justify-between items-center h-10">
          <span>BENCH</span>

          <button
            class="md:hidden text-xs font-bold text-gray-500 flex items-center gap-1 px-2 py-1 bg-gray-200 rounded"
            @click="isBenchOpen = false"
          >
            CLOSE >
          </button>
        </div>

        <div class="flex-1 p-2 overflow-y-auto flex flex-col gap-3">
          <div
            v-for="group in benchPlayersByPosition"
            :key="group.pos"
          >
            <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 mb-1 px-1">
              {{ group.title }}
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-2">
              <div
                v-for="player in group.players"
                :key="player.id"
                class="bg-white text-gray-700 border border-gray-200 rounded p-1 cursor-pointer hover:border-green-500 shadow-sm flex flex-col items-center relative pb-2"
                @click="handleBenchPlayerClick(player.id)"
              >
                <button
                  class="photo-frame w-full rounded mb-1 relative border border-gray-100 overflow-hidden bg-gray-200 aspect-[3/4]"
                  @click.stop="openPlayerDetail(player.id)"
                >
                  <img
                    :src="player.img"
                    class="w-full h-full object-cover object-top grayscale-[20%]"
                  />
                  <span class="absolute bottom-0 right-0 bg-gray-700 text-white text-[9px] px-1 font-bold shadow">
                    #{{ player.number }}
                  </span>
                </button>

                <h3 class="text-[9px] font-bold text-center truncate w-full leading-tight px-0.5 mb-1">
                  {{ player.name }}
                </h3>

                <div class="flex justify-between w-full px-1 items-center bg-gray-50 rounded py-0.5">
                  <span class="text-[9px] font-mono text-gray-500">
                    {{ Math.floor(player.totalSeconds / 60) }}m
                  </span>
                  <div
                    :class="[
                      'flex items-center gap-0.5',
                      player.fouls >= 5 ? 'text-red-500 font-black' : 'text-gray-500'
                    ]"
                  >
                    <span class="text-[8px] font-bold opacity-70">F:</span>
                    <span class="text-[9px] font-bold">{{ player.fouls }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        class="md:hidden fixed bottom-6 right-4 z-30 bg-[#002f6c] text-white px-4 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 border-2 border-white hover:scale-105 active:scale-95 transition-transform"
        @click="isBenchOpen = true"
      >
        &lt; BENCH
      </button>
    </div>

    <div
      v-if="detailPlayer"
      class="fixed inset-0 z-[100] flex items-center justify-center px-4"
    >
      <div
        class="absolute inset-0 bg-black/70 backdrop-blur-sm"
        @click="closePlayerDetail"
      ></div>

      <div class="relative bg-white w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div class="bg-[#144935] p-5 text-white text-center relative border-b-4 border-[#57a51d]">
          <button
            class="absolute top-3 right-3 text-green-200 hover:text-white bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            @click="closePlayerDetail"
          >
            x
          </button>

          <div class="w-24 h-32 mx-auto border-4 border-white/30 rounded-lg shadow-xl overflow-hidden mb-3 bg-gray-300">
            <img
              :src="detailPlayer.img"
              class="w-full h-full object-cover object-top"
            />
          </div>

          <h2 class="text-xl font-black uppercase italic tracking-tighter leading-none mb-1">
            {{ detailPlayer.name }}
          </h2>

          <div class="inline-block bg-[#57a51d] text-[#002f6c] px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase">
            Number {{ detailPlayer.number }}
          </div>
        </div>

        <div class="p-6 space-y-5">
          <div class="flex justify-between items-end border-b border-gray-100 pb-3">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Current Status</span>
            <span
              :class="[
                'text-sm uppercase',
                detailPlayer.isOnCourt ? 'font-black text-[#57a51d]' : 'font-bold text-gray-500'
              ]"
            >
              {{ detailPlayer.isOnCourt ? "CURRENTLY PLAYING" : "ON BENCH" }}
            </span>
          </div>

          <div class="flex justify-between items-end border-b border-gray-100 pb-3">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Last Sub Out</span>
            <div class="text-right">
              <span class="block font-mono font-bold text-gray-800 text-lg leading-none">
                {{ detailPlayer.isOnCourt ? "ON COURT" : detailPlayer.lastSubOutClock || "--:--" }}
              </span>
              <span class="text-[9px] text-gray-400 font-bold uppercase">Game Clock</span>
            </div>
          </div>

          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100 shadow-inner">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
              {{ detailPlayer.isOnCourt ? "Active Stint" : "Rest Duration" }}
            </span>
            <span
              :class="[
                'font-mono font-black text-4xl tracking-tight',
                detailPlayer.isOnCourt ? 'text-[#57a51d]' : detailPlayer.subOutGameClock !== null ? 'text-[#002f6c]' : 'text-gray-400'
              ]"
            >
              {{ formatClock(getRestTime(detailPlayer)) }}
            </span>
            <div class="text-[9px] text-gray-400 mt-1">
              Based on Game Clock
            </div>
          </div>
        </div>

        <div class="bg-gray-100 p-3 text-center border-t border-gray-200">
          <button
            class="w-full text-xs font-bold text-gray-500 uppercase hover:text-[#144935] transition-colors py-2"
            @click="closePlayerDetail"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.photo-frame {
  touch-action: manipulation;
}

.photo-frame::after {
  content: "VIEW";
  position: absolute;
  top: 2px;
  right: 2px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.65);
  color: white;
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
  opacity: 0;
  padding: 2px 3px;
  transition: opacity 0.2s;
}

.photo-frame:hover::after {
  opacity: 1;
}

.photo-frame:hover {
  opacity: 0.9;
}

@keyframes pulse-yellow {
  0%,
  100% {
    box-shadow: inset 0 0 0 0 rgba(0, 0, 0, 0);
    border-color: #57a51d;
  }
  50% {
    box-shadow: inset 0 0 20px rgba(250, 204, 21, 0.8);
    border-color: #facc15;
  }
}

@keyframes pulse-orange {
  0%,
  100% {
    box-shadow: inset 0 0 0 0 rgba(0, 0, 0, 0);
    border-color: #57a51d;
  }
  50% {
    box-shadow: inset 0 0 30px rgba(249, 115, 22, 0.9);
    border-color: #f97316;
  }
}

@keyframes pulse-red {
  0%,
  100% {
    box-shadow: inset 0 0 0 0 rgba(0, 0, 0, 0);
    border-color: #57a51d;
  }
  50% {
    box-shadow: inset 0 0 40px rgba(239, 68, 68, 1);
    border-color: #ef4444;
  }
}

.alert-level-1 {
  animation: pulse-yellow 1s infinite;
}

.alert-level-2 {
  animation: pulse-orange 1s infinite;
}

.alert-level-3 {
  animation: pulse-red 0.5s infinite;
}
</style>
