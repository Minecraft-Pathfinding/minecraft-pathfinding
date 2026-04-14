import { Vec3 } from 'vec3'
import {
  pitchFromDeg,
  snapTo45Deg,
  isCloseToEdge,
  randFloat,
  randRangeMs,
  randChoice,
  GodBridgeSideTracker,
  getMovementDegrees,
  dirFromYaw,
  DEG2RAD
} from '../BridgeUtils'
import { BridgeModeBase, ModeTickResult, TickContext, DEFAULT_TICK_RESULT } from './BridgeModeBase'

type LedgeAction = 'jump' | 'sneak' | 'stopInput' | 'backwards' | 'none'

interface ActiveLedge {
  action: LedgeAction
  until: number
}

const INACTIVE_LEDGE: ActiveLedge = { action: 'none', until: 0 }

export class GodBridgeMode extends BridgeModeBase {
  private readonly sideTracker = new GodBridgeSideTracker()
  private ledge: ActiveLedge = { ...INACTIVE_LEDGE }
  private pitchStraight = 0
  private pitchDiag = 0
  private yawJitter = 0

  onMoveStart (ctx: TickContext): void {
    this.sideTracker.reset()
    this.ledge = { ...INACTIVE_LEDGE }
    this._refreshPitch()
    this._refreshYawJitter()
  }

  onTick (ctx: TickContext): ModeTickResult {
    const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
    const bot = this.bot
    const now = ctx.nowMs

    const movDeg = getMovementDegrees(bot)

    if (movDeg != null) {
      const movRad = movDeg * DEG2RAD
      this.sideTracker.update(bot, this.world, movRad)
    }

    const moveDir = movDeg != null ? dirFromYaw(movDeg * DEG2RAD) : { dx: 0, dz: 0 }
    const atEdge = isCloseToEdge(bot, this.world, moveDir.dx, moveDir.dz, 0.12)

    if (atEdge && now >= this.ledge.until) {
      this._triggerLedge(ctx)
    }

    if (now < this.ledge.until) {
      switch (this.ledge.action) {
        case 'jump':
          result.wantJump = true
          break
        case 'sneak':
          result.wantSneak = true
          break
        case 'stopInput':
          result.movementOverride = new Vec3(0, 0, 0)
          break
        case 'backwards':
          result.movementOverride = new Vec3(-moveDir.dx, 0, -moveDir.dz)
          break
        default:
          break
      }
    }

    if (movDeg == null) {
      result.targetYaw = this._rotationNoInput(ctx)
      result.targetPitch = this.pitchStraight
    } else {
      const snapped = snapTo45Deg(movDeg)
      const isStraight = snapped % 90 === 0

      if (isStraight) {
        const snappedRad = snapped * DEG2RAD
        const sideOffset = this.sideTracker.getYawOffset()
        result.targetYaw = snappedRad + sideOffset + this.yawJitter * DEG2RAD
        result.targetPitch = this.pitchStraight
      } else {
        result.targetYaw = movDeg * DEG2RAD + this.yawJitter * DEG2RAD
        result.targetPitch = this.pitchDiag
      }
    }

    return result
  }

  onBlockPlaced (ctx: TickContext): void {
    this._refreshPitch()
    this._refreshYawJitter()
    this.ledge = { ...INACTIVE_LEDGE }
  }

  onMoveEnd (): void {
    this.sideTracker.reset()
    this.ledge = { ...INACTIVE_LEDGE }
  }

  private _triggerLedge (ctx: TickContext): void {
    const cfg = this.config.godbridge
    const now = ctx.nowMs

    if (ctx.totalBlockCount < cfg.forceSneakBelowCount) {
      this.ledge = { action: 'sneak', until: now + randRangeMs(cfg.sneakMs) }
      return
    }

    const modes = cfg.ledgeModes
    if (modes.length === 0) return

    const chosen = randChoice(modes)
    const durationMs = chosen === 'sneak' ? randRangeMs(cfg.sneakMs) : 50
    this.ledge = { action: chosen, until: now + durationMs }
  }

  private _rotationNoInput (ctx: TickContext): number {
    const pos = this.bot.entity.position
    const exitPos = ctx.move.exitPos
    const dx = exitPos.x - pos.x
    const dz = exitPos.z - pos.z
    return Math.atan2(-dx, -dz) + this.yawJitter * DEG2RAD
  }

  private _refreshPitch (): void {
    const cfg = this.config.godbridge
    const jit = randFloat(-cfg.pitchJitter, cfg.pitchJitter)
    this.pitchStraight = pitchFromDeg(cfg.pitchStraight + jit)
    this.pitchDiag = pitchFromDeg(cfg.pitchDiagonal + randFloat(-cfg.pitchJitter, cfg.pitchJitter))
  }

  private _refreshYawJitter (): void {
    this.yawJitter = randFloat(-this.config.godbridge.yawJitter, this.config.godbridge.yawJitter)
  }
}
