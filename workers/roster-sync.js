import { createD1Services } from "../src/cloudflare/d1.js"

function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN) {
    const error = new Error("ADMIN_TOKEN is not configured")
    error.status = 503
    throw error
  }

  if (request.headers.get("x-admin-token") !== env.ADMIN_TOKEN) {
    const error = new Error("Admin token required")
    error.status = 401
    throw error
  }
}

async function runRosterSync(env) {
  if (!env.DB) {
    throw new Error("Missing Cloudflare D1 binding: DB")
  }

  const services = createD1Services(env.DB)
  return services.syncRosterFromSource()
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runRosterSync(env).catch((error) => {
        console.error("Roster sync failed", error)
      }),
    )
  },

  async fetch(request, env) {
    try {
      const url = new URL(request.url)
      if (request.method !== "POST" || url.pathname !== "/sync") {
        return Response.json({ detail: "Not found" }, { status: 404 })
      }

      requireAdmin(request, env)
      return Response.json(await runRosterSync(env))
    } catch (error) {
      return Response.json(
        { detail: error.message || "Roster sync failed" },
        { status: error.status || 400 },
      )
    }
  },
}
