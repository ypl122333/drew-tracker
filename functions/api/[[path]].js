import { createApiHandler } from "../../src/cloudflare/api.js"
import { createD1Services } from "../../src/cloudflare/d1.js"

export async function onRequest(context) {
  if (!context.env.DB) {
    return Response.json(
      { detail: "Missing Cloudflare D1 binding: DB" },
      { status: 500 },
    )
  }

  const services = createD1Services(context.env.DB)
  const handler = createApiHandler(services, {
    adminToken: context.env.ADMIN_TOKEN,
    fetchImpl: context.fetch,
    llm: {
      apiKey: context.env.LLM_API_KEY,
      baseUrl: context.env.LLM_BASE_URL,
      model: context.env.LLM_MODEL,
    },
  })

  return handler(context.request)
}
