<script setup>
import { computed, onMounted, ref } from "vue"

const props = defineProps({
  apiBaseUrl: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(["switch-view"])

const adminToken = ref(window.localStorage.getItem("drewAdminToken") || "")
const isLoading = ref(true)
const isSyncing = ref(false)
const savingId = ref(null)
const error = ref("")
const syncResult = ref(null)
const players = ref([])
const latestSync = ref(null)

const reviewedCount = computed(() => players.value.length)

function authHeaders(extra = {}) {
  return {
    ...extra,
    ...(adminToken.value ? { "x-admin-token": adminToken.value } : {}),
  }
}

async function readJson(response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.detail || `Request failed: ${response.status}`)
  }

  return payload
}

function applyReviewPayload(payload) {
  players.value = (payload.players || []).map((player) => ({
    ...player,
    active: Boolean(player.active),
    needsReview: Boolean(player.needsReview),
    img: player.img || "/icon.png",
    pos: player.pos || "SG",
  }))
  latestSync.value = payload.latestSync || null
}

async function loadReviewQueue() {
  try {
    isLoading.value = true
    error.value = ""
    const response = await fetch(`${props.apiBaseUrl}/admin/roster-review`, {
      headers: authHeaders(),
    })
    applyReviewPayload(await readJson(response))
    if (adminToken.value) {
      window.localStorage.setItem("drewAdminToken", adminToken.value)
    }
  } catch (loadError) {
    error.value = loadError.message
  } finally {
    isLoading.value = false
  }
}

async function syncRoster() {
  try {
    isSyncing.value = true
    error.value = ""
    const response = await fetch(`${props.apiBaseUrl}/admin/roster-sync`, {
      method: "POST",
      headers: authHeaders(),
    })
    syncResult.value = await readJson(response)
    await loadReviewQueue()
  } catch (syncError) {
    error.value = syncError.message
  } finally {
    isSyncing.value = false
  }
}

async function approvePlayer(player) {
  try {
    savingId.value = player.id
    error.value = ""
    const response = await fetch(`${props.apiBaseUrl}/admin/players/${player.id}/review`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        pos: player.pos,
        active: player.active,
        img: player.img,
      }),
    })
    applyReviewPayload(await readJson(response))
  } catch (saveError) {
    error.value = saveError.message
  } finally {
    savingId.value = null
  }
}

function saveToken() {
  window.localStorage.setItem("drewAdminToken", adminToken.value)
  loadReviewQueue()
}

onMounted(() => {
  loadReviewQueue()
})
</script>

<template>
  <div class="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
    <header class="bg-[#144935] text-white px-4 py-3 shadow-md flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <button
          class="text-green-200 hover:text-white font-bold text-sm uppercase tracking-wider"
          @click="emit('switch-view', 'landing')"
        >
          Menu
        </button>
        <div>
          <h1 class="text-lg font-black uppercase tracking-tight leading-none">
            Roster Admin
          </h1>
          <div class="text-[10px] uppercase tracking-[0.2em] text-green-200 mt-1">
            {{ reviewedCount }} pending
          </div>
        </div>
      </div>

      <button
        class="bg-yellow-400 hover:bg-yellow-300 text-black px-3 py-2 rounded text-xs font-black uppercase tracking-wider disabled:opacity-60"
        :disabled="isSyncing"
        @click="syncRoster"
      >
        {{ isSyncing ? "Syncing" : "Sync Roster" }}
      </button>
    </header>

    <main class="flex-1 overflow-y-auto p-4 space-y-4">
      <section class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
        <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            v-model="adminToken"
            type="password"
            placeholder="Admin token"
            class="border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
          <button
            class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider"
            @click="saveToken"
          >
            Save Token
          </button>
        </div>
      </section>

      <section
        v-if="error"
        class="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm font-semibold"
      >
        {{ error }}
      </section>

      <section
        v-if="syncResult"
        class="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wide grid gap-1 sm:grid-cols-4"
      >
        <span>Season {{ syncResult.season || "--" }}</span>
        <span>Found {{ syncResult.discoveredCount }}</span>
        <span>New {{ syncResult.createdCount }}</span>
        <span>Inactive {{ syncResult.inactiveCount }}</span>
      </section>

      <section
        v-if="latestSync"
        class="text-[10px] text-slate-500 uppercase tracking-[0.2em]"
      >
        Last sync: {{ latestSync.completed_at || latestSync.started_at }} · {{ latestSync.status }}
      </section>

      <div
        v-if="isLoading"
        class="h-48 flex items-center justify-center text-slate-500 text-sm font-bold uppercase tracking-wider"
      >
        Loading
      </div>

      <div
        v-else-if="players.length === 0"
        class="h-48 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-500 text-sm font-bold uppercase tracking-wider"
      >
        No pending roster reviews
      </div>

      <div
        v-else
        class="grid gap-3"
      >
        <article
          v-for="player in players"
          :key="player.id"
          class="bg-white border border-slate-200 rounded-lg shadow-sm p-3 grid gap-3 lg:grid-cols-[120px_1fr_auto] lg:items-center"
        >
          <div class="flex gap-3 items-center">
            <img
              :src="player.img || '/icon.png'"
              :alt="player.name"
              class="w-16 h-20 object-cover object-top bg-slate-200 rounded border border-slate-200"
            />
            <div class="lg:hidden">
              <h2 class="font-black leading-tight">
                {{ player.name }}
              </h2>
              <p class="text-xs text-slate-500 font-bold">
                #{{ player.number }} · {{ player.sourcePos || "?" }}
              </p>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-[1.2fr_90px_90px_1fr] md:items-end">
            <label class="hidden lg:block">
              <span class="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Player</span>
              <span class="block font-black leading-tight">{{ player.name }}</span>
              <span class="block text-xs text-slate-500 font-bold">#{{ player.number }} · {{ player.sourcePos || "?" }}</span>
            </label>

            <label>
              <span class="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Position</span>
              <select
                v-model="player.pos"
                class="w-full border border-slate-300 rounded px-2 py-2 text-sm font-bold bg-white"
              >
                <option>PG</option>
                <option>SG</option>
                <option>SF</option>
                <option>PF</option>
                <option>C</option>
              </select>
            </label>

            <label>
              <span class="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Active</span>
              <input
                v-model="player.active"
                type="checkbox"
                class="w-6 h-6 accent-green-700"
              />
            </label>

            <label>
              <span class="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Local image</span>
              <input
                v-model="player.img"
                class="w-full border border-slate-300 rounded px-2 py-2 text-xs font-mono"
              />
            </label>
          </div>

          <div class="flex lg:flex-col gap-2 lg:items-stretch">
            <a
              v-if="player.profileUrl"
              :href="player.profileUrl"
              target="_blank"
              rel="noreferrer"
              class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded text-xs font-black uppercase tracking-wider text-center"
            >
              Bio
            </a>
            <a
              v-if="player.imageUrl"
              :href="player.imageUrl"
              target="_blank"
              rel="noreferrer"
              class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded text-xs font-black uppercase tracking-wider text-center"
            >
              Photo
            </a>
            <button
              class="bg-[#144935] hover:bg-[#0e3325] text-white px-3 py-2 rounded text-xs font-black uppercase tracking-wider disabled:opacity-60"
              :disabled="savingId === player.id"
              @click="approvePlayer(player)"
            >
              {{ savingId === player.id ? "Saving" : "Approve" }}
            </button>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>
