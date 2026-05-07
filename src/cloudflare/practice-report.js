import { practiceCategories } from "../data/players.js"

const defaultLlmConfig = {
  apiKey: "replace-me",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
}

function formatCategoryStats(practiceStats = {}) {
  return practiceCategories
    .map((category) => `${category.title}: ${practiceStats[category.key] || 0}`)
    .join(", ")
}

function buildPlayerSummary(player) {
  return [
    `- ${player.name} (#${player.number}, ${player.pos || "N/A"})`,
    `Total Score: ${player.practiceTotal || 0}`,
    `Metrics: ${formatCategoryStats(player.practiceStats)}`,
  ].join(" | ")
}

export function buildPracticeReportPrompt(players, supplementalNotes = "") {
  const sortedPlayers = [...players].sort((a, b) => {
    if ((b.practiceTotal || 0) !== (a.practiceTotal || 0)) {
      return (b.practiceTotal || 0) - (a.practiceTotal || 0)
    }

    return a.id - b.id
  })

  const playerLines = sortedPlayers.map(buildPlayerSummary).join("\n")
  const notes = supplementalNotes.trim() || "No additional coach notes were provided."

  return [
    "You are preparing a post-practice basketball report in English.",
    "Write a concise, natural-language summary for coaches and players.",
    "Keep the tone professional, encouraging, and specific to the data.",
    "Structure the report with these sections:",
    "1. Practice Overview",
    "2. Standout Performers",
    "3. Skill Trends",
    "4. Coaching Notes",
    "Use plain text only. Do not use markdown tables.",
    "",
    "Practice data:",
    playerLines,
    "",
    `Additional coach notes: ${notes}`,
  ].join("\n")
}

function extractChatCompletionText(payload) {
  return payload?.choices?.[0]?.message?.content?.trim() || ""
}

export async function generatePracticeReport(
  players,
  supplementalNotes,
  options = {},
) {
  const fetchImpl = options.fetchImpl || fetch
  const llm = {
    ...defaultLlmConfig,
    ...(options.llm || {}),
  }

  if (!players.length) {
    const error = new Error("Cannot generate a practice report without player data")
    error.status = 400
    throw error
  }

  if (!llm.apiKey || llm.apiKey === defaultLlmConfig.apiKey) {
    const error = new Error("LLM API key is not configured")
    error.status = 503
    throw error
  }

  const response = await fetchImpl(`${llm.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You generate short English practice reports for a college basketball staff.",
        },
        {
          role: "user",
          content: buildPracticeReportPrompt(players, supplementalNotes),
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    const error = new Error(`LLM request failed: ${response.status} ${errorText}`.trim())
    error.status = 502
    throw error
  }

  const payload = await response.json()
  const report = extractChatCompletionText(payload)

  if (!report) {
    const error = new Error("LLM response did not include report text")
    error.status = 502
    throw error
  }

  return report
}
