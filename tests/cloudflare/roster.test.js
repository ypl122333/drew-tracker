import assert from "node:assert/strict"
import test from "node:test"

import {
  buildRosterDiff,
  mapSourcePosition,
  normalizeRosterPlayer,
  parseRosterHtml,
} from "../../src/cloudflare/roster.js"

const rosterHtml = `
<html>
  <body>
    <h2>2025-26 Men's Basketball Roster</h2>
    <ul class="sidearm-roster-players">
      <li class="sidearm-roster-player" data-player-id="9558" data-player-url="/sports/mens-basketball/roster/charlie-thornton/9558">
        <img class="lazyload" data-src="/images/2025/10/16/Thornton_Charlie_2025.jpg?width=80&quality=90" alt="">
        <span class="sidearm-roster-player-position-long-short hide-on-medium">G</span>
        <span class="sidearm-roster-player-jersey-number">0</span>
        <a href="/sports/mens-basketball/roster/charlie-thornton/9558" aria-label="Charlie Thornton - View Full Bio">
          <img class="lazyload" data-src="/images/2025/10/16/Thornton_Charlie_2025.jpg?width=80&quality=90" alt="">
        </a>
        <span class="sidearm-roster-player-academic-year">Junior</span>
      </li>
      <li class="sidearm-roster-player" data-player-id="9999" data-player-url="/sports/mens-basketball/roster/new-forward/9999">
        <img src="/images/2025/10/16/New_Forward_2025.jpg?width=80&quality=90" alt="">
        <span class="sidearm-roster-player-position-long-short hide-on-medium">F</span>
        <span class="sidearm-roster-player-jersey-number">44</span>
        <a href="/sports/mens-basketball/roster/new-forward/9999" aria-label="New Forward - View Full Bio">New Forward</a>
        <span class="sidearm-roster-player-academic-year">Fr.</span>
      </li>
    </ul>
  </body>
</html>
`

test("parseRosterHtml extracts Sidearm roster players from the current season", () => {
  const players = parseRosterHtml(rosterHtml)

  assert.deepEqual(players, [
    {
      sourcePlayerId: "9558",
      season: "2025-26",
      name: "Charlie Thornton",
      number: 0,
      sourcePos: "G",
      suggestedPos: "SG",
      profileUrl: "https://drewrangers.com/sports/mens-basketball/roster/charlie-thornton/9558",
      imageUrl: "https://drewrangers.com/images/2025/10/16/Thornton_Charlie_2025.jpg?width=80&quality=90",
      academicYear: "Junior",
    },
    {
      sourcePlayerId: "9999",
      season: "2025-26",
      name: "New Forward",
      number: 44,
      sourcePos: "F",
      suggestedPos: "PF",
      profileUrl: "https://drewrangers.com/sports/mens-basketball/roster/new-forward/9999",
      imageUrl: "https://drewrangers.com/images/2025/10/16/New_Forward_2025.jpg?width=80&quality=90",
      academicYear: "Fr.",
    },
  ])
})

test("mapSourcePosition keeps app positions stable while flagging broad source positions for review", () => {
  assert.equal(mapSourcePosition("G"), "SG")
  assert.equal(mapSourcePosition("Guard"), "SG")
  assert.equal(mapSourcePosition("F"), "PF")
  assert.equal(mapSourcePosition("Forward"), "PF")
  assert.equal(mapSourcePosition("C"), "C")
  assert.equal(mapSourcePosition("Center"), "C")
  assert.equal(mapSourcePosition("Unknown"), "SG")
})

test("normalizeRosterPlayer creates active review candidates with default local image", () => {
  assert.deepEqual(
    normalizeRosterPlayer({
      sourcePlayerId: "9999",
      season: "2025-26",
      name: " New Forward ",
      number: 44,
      sourcePos: "F",
      suggestedPos: "PF",
      profileUrl: "https://drewrangers.com/profile",
      imageUrl: "https://drewrangers.com/image.jpg",
      academicYear: "Fr.",
    }),
    {
      sourcePlayerId: "9999",
      season: "2025-26",
      name: "New Forward",
      normalizedName: "new forward",
      number: 44,
      sourcePos: "F",
      suggestedPos: "PF",
      profileUrl: "https://drewrangers.com/profile",
      imageUrl: "https://drewrangers.com/image.jpg",
      academicYear: "Fr.",
      localImagePath: "/icon.png",
      active: 1,
      needsReview: 1,
    },
  )
})

test("buildRosterDiff detects creates, safe updates, and inactive candidates without deleting players", () => {
  const existingPlayers = [
    {
      id: 1,
      sourcePlayerId: "9558",
      name: "Charlie Thornton",
      normalizedName: "charlie thornton",
      number: 41,
      pos: "PF",
      img: "/Photos/Charlie.png",
      active: 1,
    },
    {
      id: 2,
      sourcePlayerId: "8888",
      name: "Graduated Player",
      normalizedName: "graduated player",
      number: 1,
      pos: "PG",
      img: "/Photos/Old.png",
      active: 1,
    },
  ]
  const incomingPlayers = parseRosterHtml(rosterHtml)

  const diff = buildRosterDiff(existingPlayers, incomingPlayers)

  assert.deepEqual(diff.create.map((player) => player.name), ["New Forward"])
  assert.deepEqual(diff.update, [
    {
      id: 1,
      sourcePlayerId: "9558",
      name: "Charlie Thornton",
      number: 0,
      sourcePos: "G",
      season: "2025-26",
      profileUrl: "https://drewrangers.com/sports/mens-basketball/roster/charlie-thornton/9558",
      imageUrl: "https://drewrangers.com/images/2025/10/16/Thornton_Charlie_2025.jpg?width=80&quality=90",
      academicYear: "Junior",
    },
  ])
  assert.deepEqual(diff.markInactive, [{ id: 2, name: "Graduated Player" }])
})
