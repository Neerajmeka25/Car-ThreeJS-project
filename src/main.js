// ─── main.js ─────────────────────────────────────────────────
//
// This is the entry point. Its only job is to:
// 1. Start the garage screen
// 2. When the player hits RACE, receive the selections
//    and hand them to the race scene
//
// We import garage.js now. race.js will be added in Milestone 2.
// ─────────────────────────────────────────────────────────────

import './style.css'
import { initGarage } from './garage.js'
import { initRace }   from './race.js'

// initGarage accepts a callback — onRaceStart(selections)
// selections = { carIndex, color, gunIndex, timeOfDay }
// This callback fires when the player clicks START RACE

initGarage((selections) => {
  console.log('Race starting with:', selections)
  initRace(selections)
})