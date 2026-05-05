export const practiceCategories = [
  { key: "charges", label: "CHG", title: "Charges" },
  { key: "sprint", label: "SPR", title: "Sprints" },
  { key: "bDrives", label: "BLD", title: "Blow-By Drives" },
  { key: "pTouch", label: "PNT", title: "Paint Touches" },
  { key: "ast", label: "AST", title: "Assists" },
  { key: "stl", label: "STL", title: "Steals" },
  { key: "defl", label: "DEF", title: "Deflections" },
  { key: "dReb", label: "DRB", title: "Defensive Rebounds" },
  { key: "oReb", label: "ZHX", title: "Offensive Rebounds" },
]

export function createEmptyPracticeStats() {
  return Object.fromEntries(practiceCategories.map((category) => [category.key, 0]))
}

export function createPlayerState(player) {
  return {
    ...player,
    currentStint: 0,
    totalSeconds: 0,
    fouls: 0,
    isOnCourt: false,
    lastSubOutClock: null,
    subOutGameClock: null,
    practiceStats: createEmptyPracticeStats(),
    practiceTotal: 0,
  }
}


export const defaultStarterNames = [
  "Eli",
  "Andre",
  "Devon",
  "David",
  "Kevin Cronin",
]
