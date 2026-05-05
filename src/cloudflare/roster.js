import { DEFAULT_PLAYER_IMAGE, ROSTER_URL } from "./constants.js"

const DREW_BASE_URL = "https://drewrangers.com"

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&rsquo;", "'")
    .replaceAll("&nbsp;", " ")
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
}

function getAttribute(html, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i")
  return pattern.exec(html)?.[1] ?? null
}

function getFirstTextByClass(html, className) {
  const pattern = new RegExp(
    `<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "i",
  )
  const match = pattern.exec(html)
  return match ? stripTags(match[1]) : ""
}

function getTextsByClass(html, className) {
  const pattern = new RegExp(
    `<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "gi",
  )
  return [...html.matchAll(pattern)].map((match) => stripTags(match[1]))
}

function absolutize(url, baseUrl = DREW_BASE_URL) {
  if (!url) return null
  return new URL(decodeHtml(url), baseUrl).toString()
}

export function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

export function mapSourcePosition(sourcePos) {
  const normalized = String(sourcePos || "").trim().toLowerCase()

  if (normalized === "c" || normalized === "center") return "C"
  if (normalized === "f" || normalized === "forward") return "PF"
  return "SG"
}

export function normalizeRosterPlayer(player) {
  const name = player.name.trim().replace(/\s+/g, " ")

  return {
    sourcePlayerId: String(player.sourcePlayerId),
    season: player.season,
    name,
    normalizedName: normalizeName(name),
    number: Number(player.number),
    sourcePos: player.sourcePos,
    suggestedPos: player.suggestedPos || mapSourcePosition(player.sourcePos),
    profileUrl: player.profileUrl,
    imageUrl: player.imageUrl,
    academicYear: player.academicYear,
    localImagePath: player.localImagePath || DEFAULT_PLAYER_IMAGE,
    active: 1,
    needsReview: 1,
  }
}

function extractSeason(html) {
  return /(\d{4}-\d{2})\s+Men'?s Basketball Roster/i.exec(html)?.[1] ?? null
}

function extractName(playerHtml) {
  const anchorPattern = /<a\b([^>]*)aria-label=["']([^"']*View Full Bio[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i
  const anchorMatch = anchorPattern.exec(playerHtml)
  if (anchorMatch) {
    const ariaName = anchorMatch[2].replace(/\s*-\s*View Full Bio.*$/i, "").trim()
    if (ariaName) {
      return decodeHtml(ariaName)
    }

    return stripTags(anchorMatch[3])
  }

  return getFirstTextByClass(playerHtml, "sidearm-roster-player-name")
    .replace(/^\d+\s+/, "")
    .trim()
}

function extractShortPosition(playerHtml) {
  const positions = getTextsByClass(playerHtml, "sidearm-roster-player-position-long-short")
    .filter(Boolean)
  const shortPosition = positions.find((position) => position.length <= 2)

  return shortPosition || positions[0] || ""
}

export function parseRosterHtml(html, { baseUrl = DREW_BASE_URL } = {}) {
  const season = extractSeason(html)
  const players = []
  const liPattern = /<li\b[^>]*class=["'][^"']*sidearm-roster-player[^"']*["'][^>]*>[\s\S]*?<\/li>/gi

  for (const match of html.matchAll(liPattern)) {
    const playerHtml = match[0]
    const sourcePlayerId = getAttribute(playerHtml, "data-player-id")
    const profilePath = getAttribute(playerHtml, "data-player-url")
    const numberText = getFirstTextByClass(playerHtml, "sidearm-roster-player-jersey-number")
    const sourcePos = extractShortPosition(playerHtml)
    const imageSrc =
      /<img\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i.exec(playerHtml)?.[1] ?? null
    const name = extractName(playerHtml)

    if (!sourcePlayerId || !name) {
      continue
    }

    players.push({
      sourcePlayerId,
      season,
      name,
      number: Number.parseInt(numberText, 10),
      sourcePos,
      suggestedPos: mapSourcePosition(sourcePos),
      profileUrl: absolutize(profilePath, baseUrl),
      imageUrl: absolutize(imageSrc, baseUrl),
      academicYear: getFirstTextByClass(playerHtml, "sidearm-roster-player-academic-year") || null,
    })
  }

  return players
}

function findExistingPlayer(existingPlayers, incoming) {
  return existingPlayers.find(
    (player) =>
      (incoming.sourcePlayerId && player.sourcePlayerId === incoming.sourcePlayerId) ||
      normalizeName(player.name || player.normalizedName || "") === incoming.normalizedName,
  )
}

function shouldUpdate(existing, incoming) {
  return [
    ["name", incoming.name],
    ["number", incoming.number],
    ["sourcePos", incoming.sourcePos],
    ["season", incoming.season],
    ["profileUrl", incoming.profileUrl],
    ["imageUrl", incoming.imageUrl],
    ["academicYear", incoming.academicYear],
  ].some(([key, value]) => (existing[key] ?? null) !== (value ?? null))
}

export function buildRosterDiff(existingPlayers, incomingPlayers) {
  const normalizedIncoming = incomingPlayers.map((player) => normalizeRosterPlayer(player))
  const create = []
  const update = []
  const matchedIds = new Set()

  for (const incoming of normalizedIncoming) {
    const existing = findExistingPlayer(existingPlayers, incoming)

    if (!existing) {
      create.push(incoming)
      continue
    }

    matchedIds.add(existing.id)
    if (shouldUpdate(existing, incoming)) {
      update.push({
        id: existing.id,
        sourcePlayerId: incoming.sourcePlayerId,
        name: incoming.name,
        number: incoming.number,
        sourcePos: incoming.sourcePos,
        season: incoming.season,
        profileUrl: incoming.profileUrl,
        imageUrl: incoming.imageUrl,
        academicYear: incoming.academicYear,
      })
    }
  }

  const incomingKeys = new Set(
    normalizedIncoming.flatMap((player) => [
      player.sourcePlayerId,
      player.normalizedName,
    ]),
  )
  const markInactive = existingPlayers
    .filter((player) => player.active !== 0)
    .filter((player) => !matchedIds.has(player.id))
    .filter(
      (player) =>
        !incomingKeys.has(player.sourcePlayerId) &&
        !incomingKeys.has(normalizeName(player.name || player.normalizedName || "")),
    )
    .map((player) => ({ id: player.id, name: player.name }))

  return { create, update, markInactive }
}

export async function fetchRosterHtml(fetchImpl = fetch, rosterUrl = ROSTER_URL) {
  const response = await fetchImpl(rosterUrl, {
    headers: {
      "User-Agent": "DrewTrackerRosterSync/1.0 (+https://drewrangers.com)",
    },
  })

  if (!response.ok) {
    throw new Error(`Roster fetch failed: ${response.status}`)
  }

  return response.text()
}
