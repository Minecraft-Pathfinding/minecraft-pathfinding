import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { World } from '../../../src/mineflayer-specific/world/worldInterface'

export const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI

export function randFloat (min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function randInt (min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

export function randRangeMs (range: [number, number]): number {
  return randFloat(range[0], range[1])
}

export function randChoice<T> (arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function wrapRadians (r: number): number {
  const t = r % (2 * Math.PI)
  return t < 0 ? t + 2 * Math.PI : t
}

export function wrapDegrees (d: number): number {
  const t = d % 360
  return t < 0 ? t + 360 : t
}

export function shortestYawDelta (from: number, to: number): number {
  return ((to - from) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
}

export function yawFromDir (dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

export function pitchFromDeg (degrees: number): number {
  return -(degrees * DEG2RAD)
}

export function snapTo8Dirs (yaw: number): number {
  const wrapped = wrapRadians(yaw)
  const sector = Math.round(wrapped / (Math.PI / 4))
  return wrapRadians(sector * (Math.PI / 4))
}

export function snapTo45Deg (deg: number): number {
  return Math.round(deg / 45) * 45
}

export function dirFromYaw (yaw: number): { dx: number, dz: number } {
  return {
    dx: -Math.sin(yaw),
    dz: -Math.cos(yaw)
  }
}

export function getMovementDegrees (bot: Bot): number | null {
  const fwd = bot.getControlState('forward')
  const back = bot.getControlState('back')
  const left = bot.getControlState('left')
  const right = bot.getControlState('right')

  if (!fwd && !back && !left && !right) return null

  const botYawDeg = wrapDegrees(bot.entity.yaw * RAD2DEG)

  let inputAngle = 0
  if (fwd && !back) inputAngle = 0
  else if (back && !fwd) inputAngle = 180
  else if (left && !right) inputAngle = -90
  else if (right && !left) inputAngle = 90
  else if (fwd && left) inputAngle = -45
  else if (fwd && right) inputAngle = 45
  else if (back && left) inputAngle = -135
  else if (back && right) inputAngle = 135

  return wrapDegrees(botYawDeg + inputAngle)
}

export function getHorizontalMoveDir (bot: Bot): Vec3 {
  const vel = bot.entity.velocity
  const xzSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
  if (xzSpeed > 0.02) {
    return new Vec3(vel.x / xzSpeed, 0, vel.z / xzSpeed)
  }
  const { dx, dz } = dirFromYaw(bot.entity.yaw)
  return new Vec3(dx, 0, dz)
}

export function isCloseToEdge (
  bot: Bot,
  world: World,
  dirX: number,
  dirZ: number,
  distance: number = 0.1
): boolean {
  const pos = bot.entity.position

  const len = Math.sqrt(dirX * dirX + dirZ * dirZ)
  if (len < 0.001) return false
  const ndx = dirX / len
  const ndz = dirZ / len
  const perpX = -ndz
  const perpZ = ndx

  for (const off of [-0.25, 0, 0.25]) {
    const cx = pos.x + ndx * distance + perpX * off
    const cz = pos.z + ndz * distance + perpZ * off
    const below = world.getBlockInfo(
      new Vec3(Math.floor(cx), Math.floor(pos.y) - 1, Math.floor(cz))
    )
    if (!below.physical && !below.liquid) return true
  }
  return false
}

export function isFractionallyNearEdge (
  bot: Bot,
  dirX: number,
  dirZ: number,
  margin: number = 0.45
): boolean {
  const pos = bot.entity.position
  const fx = pos.x - Math.floor(pos.x)
  const fz = pos.z - Math.floor(pos.z)

  const len = Math.sqrt(dirX * dirX + dirZ * dirZ)
  if (len < 0.001) return false
  const ndx = dirX / len
  const ndz = dirZ / len

  if (Math.abs(ndx) > 0.5) {
    const edgeFrac = ndx > 0 ? 1 - margin : margin
    return ndx > 0 ? fx > edgeFrac : fx < edgeFrac
  } else {
    const edgeFrac = ndz > 0 ? 1 - margin : margin
    return ndz > 0 ? fz > edgeFrac : fz < edgeFrac
  }
}

interface Line3D {
  origin: Vec3
  direction: Vec3
}

export class OptimalLineTracker {
  private readonly MAX_HISTORY = 4
  private lastPlaced: Vec3[] = []
  private lastStoodOn: Vec3 | null = null

  trackPlacement (blockPos: Vec3): void {
    const last = this.lastPlaced[this.lastPlaced.length - 1]
    if (last != null && last.equals(blockPos)) return
    this.lastPlaced.push(blockPos.clone())
    while (this.lastPlaced.length > this.MAX_HISTORY) this.lastPlaced.shift()
  }

  getOptimalLine (bot: Bot, world: World): Line3D | null {
    const moveDir = getHorizontalMoveDir(bot)
    const snapped = snapTo8Dirs(Math.atan2(moveDir.x, moveDir.z))
    const direction = new Vec3(-Math.sin(snapped), 0, -Math.cos(snapped))

    const baseBlock = this._findStoodOnBlock(bot, world)
    if (baseBlock == null) return null

    const historyLine = this._fitLineFromHistory()

    let origin: Vec3
    if (historyLine != null && historyLine.direction.dot(direction) > 0.5) {
      origin = historyLine.origin
    } else {
      origin = baseBlock.offset(0.5, 0, 0.5)
    }

    return { origin: new Vec3(origin.x, bot.entity.position.y, origin.z), direction }
  }

  getCorrectionDir (bot: Bot, line: Line3D, threshold: number = 0.15): Vec3 {
    const pos = bot.entity.position
    const nearest = this._nearestPointOnLine(pos, line)
    const delta = new Vec3(nearest.x - pos.x, 0, nearest.z - pos.z)
    if (delta.norm() < threshold) return new Vec3(0, 0, 0)
    return delta.normalize()
  }

  reset (): void {
    this.lastPlaced = []
    this.lastStoodOn = null
  }

  /**
   * Seed the line tracker with the intended path direction before any blocks
   * are placed, so drift correction is active from the very first tick.
   * Without this, the tracker has no history and applies zero correction,
   * allowing diagonal strafe vectors to cause unchecked X/Z drift.
   */
  seedPath (entryPos: Vec3, exitPos: Vec3): void {
    const dir = new Vec3(exitPos.x - entryPos.x, 0, exitPos.z - entryPos.z)
    if (dir.norm() < 0.001) return
    const n = dir.normalize()
    const y = Math.floor(entryPos.y) - 1
    // Two synthetic block positions along the intended path — one at the entry
    // end and one at the exit end.  _fitLineFromHistory needs at least two
    // points with a meaningful separation; using the full span gives the most
    // stable direction vector.
    this.lastPlaced = [
      new Vec3(Math.floor(entryPos.x), y, Math.floor(entryPos.z)),
      // new Vec3(Math.floor(exitPos.x), y, Math.floor(exitPos.z))
    ]
  }

  private _findStoodOnBlock (bot: Bot, world: World): Vec3 | null {
    const pos = bot.entity.position
    const candidates: Vec3[] = []

    for (const ox of [0, 0.301, -0.301]) {
      for (const oz of [0, 0.301, -0.301]) {
        const bp = new Vec3(Math.floor(pos.x + ox), Math.floor(pos.y) - 1, Math.floor(pos.z + oz))
        if (!world.getBlockInfo(bp).physical) continue
        const lastPlaced = this.lastPlaced[this.lastPlaced.length - 1]
        if (lastPlaced != null && bp.equals(lastPlaced)) return bp
        candidates.push(bp)
      }
    }

    if (this.lastStoodOn != null && candidates.some(c => c.equals(this.lastStoodOn!))) {
      return this.lastStoodOn
    }

    const first = candidates[0] ?? null
    this.lastStoodOn = first
    return first
  }

  private _fitLineFromHistory (): Line3D | null {
    if (this.lastPlaced.length < 2) return null
    const a = this.lastPlaced[this.lastPlaced.length - 2]
    const b = this.lastPlaced[this.lastPlaced.length - 1]
    const diff = new Vec3(b.x - a.x, 0, b.z - a.z)
    if (diff.norm() < 0.01) return null

    return {
      origin: this.lastPlaced[0].offset(0.5, 0, 0.5),
      direction: diff.normalize()
    }
  }

  private _nearestPointOnLine (pos: Vec3, line: Line3D): Vec3 {
    const toPoint = new Vec3(pos.x - line.origin.x, 0, pos.z - line.origin.z)
    const t = toPoint.dot(line.direction)
    return new Vec3(
      line.origin.x + line.direction.x * t,
      pos.y,
      line.origin.z + line.direction.z * t
    )
  }
}

export class GodBridgeSideTracker {
  private isOnRightSide = false
  private currentJitter = 0
  private readonly jitterRange: number

  constructor (jitterRangeDeg: number = 3.5) {
    this.jitterRange = jitterRangeDeg * DEG2RAD
    this._rollJitter()
  }

  update (bot: Bot, world: World, movingYaw: number): void {
    if (!bot.entity.onGround) return

    const pos = bot.entity.position
    const movDx = -Math.sin(movingYaw)
    const movDz = -Math.cos(movingYaw)

    const crossX = Math.floor(pos.x + movDx * 0.5) !== Math.floor(pos.x)
    const crossZ = Math.floor(pos.z + movDz * 0.5) !== Math.floor(pos.z)
    let newSide = crossX || crossZ

    const belowAir = world.getBlockInfo(
      new Vec3(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z))
    )?.physical === false

    const aheadPos = new Vec3(
      Math.floor(pos.x + movDx),
      Math.floor(pos.y) - 1,
      Math.floor(pos.z + movDz)
    )
    const aheadAir = world.getBlockInfo(aheadPos)?.physical === false

    if (belowAir && aheadAir) newSide = !newSide

    if (newSide !== this.isOnRightSide) {
      this.isOnRightSide = newSide
      this._rollJitter()
    }
  }

  getYawOffset (): number {
    return (this.isOnRightSide ? Math.PI / 4 : -Math.PI / 4) + this.currentJitter
  }

  reset (): void {
    this.isOnRightSide = false
    this._rollJitter()
  }

  private _rollJitter (): void {
    this.currentJitter = randFloat(-this.jitterRange, this.jitterRange)
  }
}

export class PlacementPredictor {
  private readonly MAX = 6
  private offsets: Vec3[] = []

  record (playerPos: Vec3, edgePos: Vec3): void {
    const off = new Vec3(playerPos.x - edgePos.x, 0, playerPos.z - edgePos.z)
    this.offsets.push(off)
    while (this.offsets.length > this.MAX) this.offsets.shift()
  }

  average (): Vec3 | null {
    if (this.offsets.length < 2) return null
    const sum = this.offsets.reduce((acc, v) => new Vec3(acc.x + v.x, 0, acc.z + v.z), new Vec3(0, 0, 0))
    return new Vec3(sum.x / this.offsets.length, 0, sum.z / this.offsets.length)
  }

  reset (): void {
    this.offsets = []
  }
}