import { Vec3 } from 'vec3'

export interface FlightCarrot {
  target: Vec3
  index: number
  lookaheadDistance: number
}

function horizontalSpeed(vel: Vec3): number {
  return Math.hypot(vel.x, vel.z)
}

export function selectFlightCarrot(
  pos: Vec3,
  vel: Vec3,
  waypoints: Vec3[],
  routeIndex = 0,
  reachDistance = 7
): FlightCarrot | null {
  if (waypoints.length === 0) return null

  let index = Math.max(0, Math.min(routeIndex, waypoints.length - 1))
  while (
    index < waypoints.length - 1 &&
    pos.distanceTo(waypoints[index]) <= reachDistance
  )
    index++

  const speed = horizontalSpeed(vel)
  const lookaheadDistance = Math.max(reachDistance, Math.min(28, 5 + speed * 7))
  while (
    index < waypoints.length - 1 &&
    pos.distanceTo(waypoints[index]) < lookaheadDistance
  ) {
    const to = waypoints[index].minus(pos)
    const toLen = Math.hypot(to.x, to.z)
    const velLen = speed
    if (toLen < 1e-6 || velLen < 1e-6) break
    const dot = (to.x * vel.x + to.z * vel.z) / (toLen * velLen)
    if (dot < 0.92) break
    index++
  }

  return {
    target: waypoints[index].clone(),
    index,
    lookaheadDistance
  }
}
