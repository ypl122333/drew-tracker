function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

async function readJson(request) {
  try {
    return await request.json()
  } catch {
    const error = new Error("Invalid JSON payload")
    error.status = 400
    throw error
  }
}

function ensureAdmin(request, adminToken) {
  if (!adminToken) {
    const error = new Error("ADMIN_TOKEN is not configured")
    error.status = 503
    throw error
  }

  if (request.headers.get("x-admin-token") !== adminToken) {
    const error = new Error("Admin token required")
    error.status = 401
    throw error
  }
}

export function createApiHandler(services, options = {}) {
  const { adminToken } = options

  return async function handleApiRequest(request) {
    try {
      const url = new URL(request.url)
      const path = url.pathname.replace(/^\/api\/?/, "/")
      const method = request.method.toUpperCase()

      if (method === "GET" && path === "/") {
        return json({ message: "Cloudflare API is running" })
      }

      if (method === "GET" && path === "/players") {
        return json(await services.getPlayersWithPractice())
      }

      if (method === "GET" && path === "/practice") {
        return json(await services.getPlayersWithPractice())
      }

      const practiceMatch = /^\/practice\/(\d+)$/.exec(path)
      if (method === "POST" && practiceMatch) {
        const payload = await readJson(request)
        return json(
          await services.updatePracticeStat(
            Number(practiceMatch[1]),
            payload.statKey,
            payload.delta ?? 1,
          ),
        )
      }

      if (method === "POST" && path === "/practice/reset") {
        return json(await services.resetPracticeStats())
      }

      if (method === "GET" && path === "/game") {
        return json(await services.getGameSnapshot())
      }

      if (method === "POST" && path === "/game") {
        return json(await services.saveGameSnapshot(await readJson(request)))
      }

      if (method === "POST" && path === "/game/reset") {
        return json(await services.resetGameSnapshot())
      }

      if (method === "POST" && path === "/game/main-action") {
        const payload = await readJson(request)
        return json(await services.handleGameMainAction(payload.allowShortHanded ?? false))
      }

      const toggleMatch = /^\/game\/players\/(\d+)\/toggle$/.exec(path)
      if (method === "POST" && toggleMatch) {
        return json(await services.toggleGamePlayer(Number(toggleMatch[1])))
      }

      const foulMatch = /^\/game\/players\/(\d+)\/fouls$/.exec(path)
      if (method === "POST" && foulMatch) {
        const payload = await readJson(request)
        return json(await services.adjustGameFoul(Number(foulMatch[1]), payload.delta))
      }

      if (method === "POST" && path === "/game/clock/sync") {
        const payload = await readJson(request)
        return json(await services.syncGameClockSeconds(payload.seconds))
      }

      if (method === "POST" && path === "/game/clock/adjust") {
        const payload = await readJson(request)
        return json(await services.adjustGameClockSeconds(payload.delta))
      }

      if (method === "POST" && path === "/game/reset-half") {
        return json(await services.resetGameHalf())
      }

      if (method === "GET" && path === "/admin/roster-review") {
        ensureAdmin(request, adminToken)
        return json(await services.getRosterReview())
      }

      if (method === "POST" && path === "/admin/roster-sync") {
        ensureAdmin(request, adminToken)
        return json(await services.syncRosterFromSource())
      }

      const reviewMatch = /^\/admin\/players\/(\d+)\/review$/.exec(path)
      if (method === "POST" && reviewMatch) {
        ensureAdmin(request, adminToken)
        return json(
          await services.reviewRosterPlayer(Number(reviewMatch[1]), await readJson(request)),
        )
      }

      return json({ detail: "Not found" }, 404)
    } catch (error) {
      const status = error.status || (error.message?.includes("not found") ? 404 : 400)
      return json({ detail: error.message || "Request failed" }, status)
    }
  }
}
