import assert from "node:assert/strict"
import test from "node:test"

import { createApiHandler } from "../../src/cloudflare/api.js"
import { createD1Services } from "../../src/cloudflare/d1.js"

test("createApiHandler serves existing game endpoints under /api", async () => {
  const calls = []
  const handler = createApiHandler({
    getGameSnapshot: async () => ({ gameClockSeconds: 1200, players: [] }),
    toggleGamePlayer: async (playerId) => {
      calls.push(["toggle", playerId])
      return { gameClockSeconds: 1190, players: [{ id: playerId, isOnCourt: true }] }
    },
  })

  const getResponse = await handler(
    new Request("https://tracker.example/api/game", { method: "GET" }),
  )
  assert.equal(getResponse.status, 200)
  assert.deepEqual(await getResponse.json(), { gameClockSeconds: 1200, players: [] })

  const toggleResponse = await handler(
    new Request("https://tracker.example/api/game/players/7/toggle", {
      method: "POST",
    }),
  )
  assert.equal(toggleResponse.status, 200)
  assert.deepEqual(await toggleResponse.json(), {
    gameClockSeconds: 1190,
    players: [{ id: 7, isOnCourt: true }],
  })
  assert.deepEqual(calls, [["toggle", 7]])
})

test("createApiHandler returns FastAPI-style errors for invalid routes and payloads", async () => {
  const handler = createApiHandler({
    updatePracticeStat: async () => {
      throw new Error("should not be called")
    },
  })

  const notFound = await handler(new Request("https://tracker.example/api/missing"))
  assert.equal(notFound.status, 404)
  assert.deepEqual(await notFound.json(), { detail: "Not found" })

  const badJson = await handler(
    new Request("https://tracker.example/api/practice/2", {
      method: "POST",
      body: "{",
    }),
  )
  assert.equal(badJson.status, 400)
  assert.deepEqual(await badJson.json(), { detail: "Invalid JSON payload" })
})

test("createApiHandler keeps admin endpoints closed when ADMIN_TOKEN is not configured", async () => {
  const handler = createApiHandler({
    getRosterReview: async () => ({ players: [] }),
  })

  const response = await handler(
    new Request("https://tracker.example/api/admin/roster-review"),
  )

  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { detail: "ADMIN_TOKEN is not configured" })
})

test("syncRosterFromSource refuses empty roster parses before mutating players", async () => {
  const writes = []
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            run: async () => {
              writes.push({ sql, params })
              return { meta: { changes: 1 } }
            },
          }
        },
      }
    },
  }
  const services = createD1Services(db, {
    fetchImpl: async () => new Response("<html></html>"),
  })

  await assert.rejects(
    () => services.syncRosterFromSource(),
    /Roster sync parsed 0 players/,
  )
  assert.equal(writes.length, 1)
  assert.match(writes[0].sql, /INSERT INTO roster_sync_runs/)
  assert.equal(
    writes[0].params[2],
    "Roster sync parsed 0 players; refusing to mutate roster",
  )
})
