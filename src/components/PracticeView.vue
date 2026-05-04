<script setup>
import { computed, ref } from "vue"
import { practiceCategories } from "../data/players"

const props = defineProps({
  players: {
    type: Array,
    required: true,
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
  "update-practice-stat",
  "sort-practice",
  "reset-practice",
])

const currentChartMetric = ref("total")

const chartMetricLabels = practiceCategories.reduce(
  (acc, category) => ({ ...acc, [category.key]: category.label }),
  { total: "TOTAL SCORE" },
)

const maxScore = computed(() => {
  if (!props.players.length) return 0
  return Math.max(...props.players.map((player) => player.practiceTotal || 0))
})

const sortedChartPlayers = computed(() => {
  const metric = currentChartMetric.value

  return [...props.players].sort((a, b) => {
    const aValue =
      metric === "total" ? a.practiceTotal || 0 : a.practiceStats?.[metric] || 0
    const bValue =
      metric === "total" ? b.practiceTotal || 0 : b.practiceStats?.[metric] || 0

    if (bValue !== aValue) return bValue - aValue
    return a.id - b.id
  })
})

const chartMaxValue = computed(() => {
  if (!sortedChartPlayers.value.length) return 0

  return Math.max(
    ...sortedChartPlayers.value.map((player) =>
      currentChartMetric.value === "total"
        ? player.practiceTotal || 0
        : player.practiceStats?.[currentChartMetric.value] || 0,
    ),
  )
})

function getMetricValue(player, metric = currentChartMetric.value) {
  return metric === "total"
    ? player.practiceTotal || 0
    : player.practiceStats?.[metric] || 0
}

function handleAdd(playerId, key) {
  emit("update-practice-stat", playerId, key, 1)
}

function handleSort() {
  emit("sort-practice")
}

function handleReset() {
  const confirmed = window.confirm("Reset all practice stats?")
  if (confirmed) {
    emit("reset-practice")
  }
}

function switchChartMetric(metric) {
  currentChartMetric.value = metric
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-100">
    <div class="shrink-0 shadow-md bg-[#144935] text-white h-14 flex justify-between items-center px-4 border-b border-[#0e3325] relative">
      <div class="flex items-center gap-4 z-10">
        <button
          @click="emit('switch-view', 'landing')"
          class="flex items-center text-green-300 hover:text-white transition-colors"
        >
          <span class="ml-1 text-xs font-bold uppercase">Menu</span>
        </button>

        <div class="hidden sm:block">
          <h1 class="text-lg font-extrabold tracking-tight leading-none">
            PRACTICE MODE
          </h1>
          <div class="text-[9px] uppercase tracking-[0.24em] text-green-200 mt-0.5">
            {{ syncError || (isSyncing ? "Syncing live data" : "Live sync connected") }}
          </div>
        </div>
      </div>

      <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <img
          src="/Background.jpg"
          alt="Logo"
          class="h-10 object-contain drop-shadow-md opacity-90 rounded"
        />
      </div>

      <div class="flex items-center gap-2 z-10">
        <button
          @click="handleSort"
          class="bg-yellow-500 hover:bg-yellow-400 text-black text-xs px-3 py-1.5 rounded shadow transition-colors font-bold uppercase tracking-wider"
        >
          Sort
        </button>

        <button
          @click="handleReset"
          class="bg-red-700/80 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded shadow transition-colors font-bold uppercase tracking-wider"
        >
          Reset
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-hidden flex flex-col p-2">
      <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 content-start pb-2">
        <div
          v-for="player in players"
          :key="player.id"
          :class="[
            'flex flex-col p-1.5 rounded-lg shadow-sm border transition-all',
            maxScore > 0 && (player.practiceTotal || 0) === maxScore
              ? 'ring-2 ring-yellow-400 bg-yellow-50 border-yellow-200'
              : 'border-gray-200 bg-white'
          ]"
        >
          <div class="flex items-center gap-2 mb-1.5 border-b border-gray-100 pb-1.5">
            <div class="relative w-8 h-10 shrink-0">
              <img
                :src="player.img"
                :alt="player.name"
                class="w-full h-full object-cover rounded bg-gray-200"
              />
              <div
                v-if="maxScore > 0 && (player.practiceTotal || 0) === maxScore"
                class="absolute -top-1.5 -left-1.5 text-[8px] font-black tracking-widest bg-yellow-400 text-black px-1 py-0.5 rounded shadow"
              >
                LEAD
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="text-[10px] font-bold text-gray-900 truncate">
                {{ player.name }}
              </div>
              <div class="text-[8px] text-gray-400">
                #{{ player.number }} · {{ player.pos }}
              </div>
            </div>

            <div
              :class="[
                'text-lg font-black leading-none',
                maxScore > 0 && (player.practiceTotal || 0) === maxScore
                  ? 'text-green-600'
                  : 'text-gray-800'
              ]"
            >
              {{ player.practiceTotal || 0 }}
            </div>
          </div>

          <div class="grid grid-cols-3 gap-1">
            <div
              v-for="category in practiceCategories"
              :key="category.key"
              class="flex flex-col items-center justify-center"
            >
              <span class="text-[7px] text-gray-400 font-bold uppercase leading-none mb-0.5">
                {{ category.label }}
              </span>

              <button
                @click="handleAdd(player.id, category.key)"
                class="w-full h-5 bg-white border border-gray-200 rounded text-[10px] font-bold text-gray-700 hover:bg-green-50 hover:border-green-300 hover:text-green-700 active:bg-green-600 active:text-white transition-colors shadow-sm leading-none"
                :title="category.title"
              >
                {{ player.practiceStats?.[category.key] || 0 }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="h-48 bg-white p-2 rounded-xl shadow-sm border border-gray-200 shrink-0 flex flex-col">
        <div class="flex justify-between items-center mb-1">
          <h3 class="font-bold text-gray-800 text-[10px] uppercase flex items-center gap-2">
            Stats Leaderboard
          </h3>
          <span class="text-[9px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded">
            {{ chartMetricLabels[currentChartMetric] }}
          </span>
        </div>

        <div class="flex gap-1 overflow-x-auto pb-1 mb-1 scrollbar-hide">
          <button
            @click="switchChartMetric('total')"
            :class="[
              'px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-colors shrink-0 border',
              currentChartMetric === 'total'
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            ]"
          >
            Total
          </button>

          <button
            v-for="category in practiceCategories"
            :key="category.key"
            @click="switchChartMetric(category.key)"
            :class="[
              'px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-colors shrink-0 border',
              currentChartMetric === category.key
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            ]"
          >
            {{ category.label }}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto pr-1">
          <div
            v-if="sortedChartPlayers.length"
            class="grid gap-1.5"
          >
            <div
              v-for="(player, index) in sortedChartPlayers"
              :key="`${currentChartMetric}-${player.id}`"
              class="grid grid-cols-[minmax(0,92px)_1fr_34px] items-center gap-2"
            >
              <div class="truncate text-[9px] font-bold text-gray-700">
                {{ player.name }}
              </div>

              <div class="h-5 rounded bg-gray-100 overflow-hidden border border-gray-200">
                <div
                  :class="[
                    'h-full flex items-center justify-end pr-1 text-[9px] font-black transition-all duration-300',
                    index === 0 && getMetricValue(player) > 0
                      ? 'bg-yellow-400 text-black'
                      : 'bg-[#144935] text-white'
                  ]"
                  :style="{
                    width: `${chartMaxValue > 0 ? Math.max((getMetricValue(player) / chartMaxValue) * 100, getMetricValue(player) > 0 ? 12 : 0) : 0}%`
                  }"
                >
                  <span v-if="getMetricValue(player) > 0">
                    {{ getMetricValue(player) }}
                  </span>
                </div>
              </div>

              <div class="text-right text-[9px] font-black text-gray-600">
                {{ getMetricValue(player) }}
              </div>
            </div>
          </div>

          <div
            v-else
            class="h-full flex items-center justify-center text-xs text-gray-400"
          >
            No practice data yet
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
