import { parseTeamColour } from './car-model.js'

// Pilotes OpenF1 d'une course vers la liste des écuries : { name, colour, drivers: [{ code, lastName }] }.
// Une écurie par nom, dans l'ordre d'apparition ; les pilotes sans écurie sont ignorés.
export function buildTeams(rawDrivers) {
  const teams = new Map()
  for (const driver of rawDrivers) {
    if (!driver.team_name) continue
    if (!teams.has(driver.team_name)) {
      teams.set(driver.team_name, {
        name: driver.team_name,
        colour: parseTeamColour(driver.team_colour),
        drivers: [],
      })
    }
    teams.get(driver.team_name).drivers.push({ code: driver.name_acronym, lastName: driver.last_name })
  }
  return [...teams.values()]
}
