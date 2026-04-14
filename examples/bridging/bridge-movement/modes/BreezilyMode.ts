import { Vec3 } from 'vec3'
import {
  pitchFromDeg,
  snapTo45Deg,
  randFloat,
  getMovementDegrees,
  wrapDegrees,
  DEG2RAD,
  dirFromYaw
} from '../BridgeUtils'
import { BridgeModeBase, ModeTickResult, TickContext, DEFAULT_TICK_RESULT } from './BridgeModeBase'

const enum CardinalDeg {
  SOUTH = 0,
  WEST = 90,
  NORTH = 180,
  EAST = 270
}

const BREEZILY_AIR_WINDOW_MS = 500

export class BreezilyMode extends BridgeModeBase {
  private lastSideways = 0
  private lastAirTimeMs = 0
  private currentEdgeDist = 0.45
  private pitchStraight = 0
  private pitchDiag = 0
  private pitchNoInput = 0
  private currentYawBias = 0

  onMoveStart (ctx: TickContext): void {
    this.lastSideways = 0
    this.lastAirTimeMs = 0
    this.currentEdgeDist = this._nextEdgeDist()
    this.currentYawBias = this._nextYawBias()
    this._refreshPitch()
  }

  onTick (ctx: TickContext): ModeTickResult {
    const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
    const bot = this.bot
    const now = ctx.nowMs

    if (!bot.entity.onGround) {
      this.lastAirTimeMs = now
    }

    const movDeg = getMovementDegrees(bot)

    if (movDeg == null) {
      result.targetYaw = this._rotationNoInput(ctx)
      result.targetPitch = this.pitchNoInput
      return result
    }

    const snapped = snapTo45Deg(movDeg)
    const isStraight = snapped % 90 === 0
    result.targetYaw = movDeg * DEG2RAD + this.currentYawBias
    result.targetPitch = isStraight ? this.pitchStraight : this.pitchDiag

    const fwdPressed = bot.getControlState('forward')
    const sneaking = bot.getControlState('sneak')

    if (!fwdPressed || sneaking) return result

    const msSinceAir = now - this.lastAirTimeMs
    if (this.lastAirTimeMs === 0 || msSinceAir > BREEZILY_AIR_WINDOW_MS) return result

    const pos = bot.entity.position
    const fx = pos.x - Math.floor(pos.x)
    const fz = pos.z - Math.floor(pos.z)
    const margin = this.currentEdgeDist
    const ma = 1 - margin

    let newSideways = 0
    const cardinalDeg = Math.round(wrapDegrees(movDeg) / 90) * 90

    switch (cardinalDeg % 360) {
      case CardinalDeg.SOUTH:
        if (fx > ma) newSideways = 1
        else if (fx < margin) newSideways = -1
        break
      case CardinalDeg.NORTH:
        if (fx > ma) newSideways = -1
        else if (fx < margin) newSideways = 1
        break
      case CardinalDeg.EAST:
        if (fz > ma) newSideways = -1
        else if (fz < margin) newSideways = 1
        break
      case CardinalDeg.WEST:
        if (fz > ma) newSideways = 1
        else if (fz < margin) newSideways = -1
        break
      default:
        break
    }

    if (newSideways !== 0 && newSideways !== this.lastSideways) {
      this.lastSideways = newSideways
      this.currentEdgeDist = this._nextEdgeDist()
    }

    if (this.lastSideways !== 0) {
      const movRad = movDeg * DEG2RAD
      const { dx: fdx, dz: fdz } = dirFromYaw(movRad)
      const perpX = -fdz * this.lastSideways
      const perpZ = fdx * this.lastSideways
      const combX = fdx + perpX * 0.6
      const combZ = fdz + perpZ * 0.6
      const len = Math.sqrt(combX * combX + combZ * combZ)
      result.movementOverride = new Vec3(combX / len, 0, combZ / len)
    }

    return result
  }

  onBlockPlaced (ctx: TickContext): void {
    this.currentYawBias = this._nextYawBias()
    this._refreshPitch()
  }

  onMoveEnd (): void {
    this.lastSideways = 0
    this.lastAirTimeMs = 0
    this.currentYawBias = 0
  }

  private _nextEdgeDist (): number {
    const [min, max] = this.config.breezily.edgeDistance
    return randFloat(min, max)
  }

  private _nextYawBias (): number {
    const jitter = this.config.breezily.yawJitter
    return randFloat(-jitter, jitter) * DEG2RAD
  }

  private _refreshPitch (): void {
    const cfg = this.config.breezily
    const jit = (): number => randFloat(-cfg.pitchJitter, cfg.pitchJitter)
    this.pitchStraight = pitchFromDeg(cfg.pitchStraight + jit())
    this.pitchDiag = pitchFromDeg(cfg.pitchDiagonal + jit())
    this.pitchNoInput = pitchFromDeg(75 + jit())
  }

  private _rotationNoInput (ctx: TickContext): number {
    const exitPos = ctx.move.exitPos
    const pos = this.bot.entity.position
    const dx = exitPos.x - pos.x
    const dz = exitPos.z - pos.z
    return Math.atan2(-dx, -dz) + this.currentYawBias
  }
}
