import { Vec3 } from 'vec3'
import {
  pitchFromDeg,
  randFloat,
  dirFromYaw,
  shortestYawDelta,
  wrapRadians,
  PlacementPredictor,
  DEG2RAD,
  RAD2DEG
} from '../BridgeUtils'
import { BridgeModeBase, ModeTickResult, TickContext, DEFAULT_TICK_RESULT } from './BridgeModeBase'
import { BlockFace } from '@nxg-org/mineflayer-util-plugin'
import { Block, RayType } from '../../../../src/types'
import { faceToVec } from '../../../../src/utils'
import test from 'node:test'

const NINJA_ALIGN_THRESH_DEG = 5
const NINJA_PITCH_THRESH_DEG = 5

type BridgePhase = 'approach' | 'bridge'
type BridgePathKind = 'straight' | 'diagonal'

export class NormalMode extends BridgeModeBase {
  private readonly placementPredictor = new PlacementPredictor()
  private phase: BridgePhase = 'approach'
  private currentPitch = 0
  private currentYawBias = 0
  private shouldBridge = false
  /** Single timer drives all sneaking – no per-tick reactive toggling. */
  private _sneakUntilMs = 0
  /** Tracks previous overAir state for rising-edge detection. */
  private _wasOverAir = false

  onMoveStart(ctx: TickContext): void {
    this.phase = 'approach'
    this.placementPredictor.reset()
    this.currentPitch = this._nextPitch()
    this.currentYawBias = this._nextYawBias()
    this.shouldBridge = false
    this._sneakUntilMs = 0
    this._wasOverAir = false
  }

  onTick(ctx: TickContext, placements: Vec3[]): ModeTickResult {
    const bot = this.bot
    const entryPos = ctx.move.entryPos.floored().offset(0.5, 0, 0.5)
    const dx = ctx.move.exitPos.x - entryPos.x
    const dz = ctx.move.exitPos.z - entryPos.z

    const pathKind = this._getPathKind(dx, dz)

    const rawMovingYaw = Math.atan2(-dx, -dz)
    const movingYaw = rawMovingYaw + this.currentYawBias
    const { dx: backX, dz: backZ } = dirFromYaw(movingYaw)
    const onGround = bot.entity.onGround

    const overAir = this._atPlatformEdgeInTicks(backX, backZ, 0)

    if (this.phase === 'approach') {
      const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
      result.targetYaw = rawMovingYaw
      result.targetPitch = this.currentPitch
      result.allowPlace = false
      result.wantSprint = true

      if (onGround && overAir) {
        this.phase = 'bridge'
        this.shouldBridge = true
        result.wantSneak = true
        result.movementOverride = new Vec3(0, 0, 0)
        console.log(
          `[ninja dbg] APPROACH->BRIDGE edge detected ` +
          `pathKind=${pathKind} ` +
          `pos=(${bot.entity.position.x.toFixed(2)},${bot.entity.position.y.toFixed(2)},${bot.entity.position.z.toFixed(2)}) ` +
          `yaw=${(bot.entity.yaw * RAD2DEG).toFixed(1)}`
        )
      } else {
        result.movementOverride = null
      }
      return result
    }

    const checkBlock = placements.filter(p => this.bot.blockAt(p)?.boundingBox === 'empty')[0]


    const bridgeYaw = this._getBridgeYaw(ctx, pathKind, movingYaw, checkBlock)

    const yawErr = Math.abs(shortestYawDelta(bot.entity.yaw, bridgeYaw))
    const pitchErr = Math.abs((bot.entity.pitch - this.currentPitch) * RAD2DEG)
    if (yawErr > NINJA_ALIGN_THRESH_DEG * DEG2RAD || pitchErr > NINJA_PITCH_THRESH_DEG) {
      console.log(
        'ninja misalign',
        bot.entity.yaw * RAD2DEG,
        bot.entity.pitch * RAD2DEG,
        bridgeYaw * RAD2DEG,
        this.currentPitch * RAD2DEG
      )
      console.log(
        '[ninja dbg] UNALIGNED ' +
        `pathKind=${pathKind} ` +
        'yawErr=' + (yawErr * RAD2DEG).toFixed(1) + '° pitchErr=' + pitchErr.toFixed(1) + '°'
      )
      const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
      result.useStrafe = false;
      result.wantSneak = true
      result.targetYaw = bridgeYaw
      result.targetPitch = this.currentPitch
      result.allowPlace = false
      result.wantSprint = false
      return result
    }

    const nowMs = ctx.nowMs

    if (overAir && !this._wasOverAir && nowMs >= this._sneakUntilMs) {
      this._sneakUntilMs = nowMs + randFloat(70, 90)
    } else if (overAir && nowMs >= this._sneakUntilMs) {
      this._sneakUntilMs = nowMs + randFloat(40, 55)
    }
    this._wasOverAir = overAir


    // console.log(
    //   `[ninja dbg] phase=bridge pathKind=${pathKind} sneaking=${nowMs < this._sneakUntilMs} overAir=${overAir} onGround=${onGround} ` +
    //   `yaw=${(bot.entity.yaw * RAD2DEG).toFixed(1)} pitch=${(bot.entity.pitch * RAD2DEG).toFixed(1)} ` +
    //   `pos=(${bot.entity.position.x.toFixed(2)},${bot.entity.position.y.toFixed(2)},${bot.entity.position.z.toFixed(2)}) ` +
    //   `vel=(${bot.entity.velocity.x.toFixed(3)},${bot.entity.velocity.y.toFixed(3)},${bot.entity.velocity.z.toFixed(3)}) ` +
    //   `placed=${ctx.placedThisMove}, shouldBridge=${this.shouldBridge}, `
    // )

    const allowPlace = this.shouldBridge && (!checkBlock || this._shouldAllowPlace(backX, backZ, checkBlock))

    const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
    result.wantSneak = nowMs < this._sneakUntilMs
    result.targetYaw = bridgeYaw
    result.targetPitch = this.currentPitch
    result.allowPlace = allowPlace
    result.wantSprint = false

    result.movementOverride =
      pathKind === 'diagonal'
        ? this._getDiagonalBridgeMovement(ctx)
        : this._getStraightBridgeMovement(ctx, backX, backZ)

    result.useStrafe = pathKind !== 'diagonal'
    return result
  }

  onBlockPlaced(ctx: TickContext): void {
    const bot = this.bot
    const dx = ctx.move.exitPos.x - ctx.move.entryPos.x
    const dz = ctx.move.exitPos.z - ctx.move.entryPos.z
    const movingYaw = Math.atan2(-dx, -dz) + this.currentYawBias
    const { dx: backX, dz: backZ } = dirFromYaw(movingYaw)
    const edgePos = this._computeEdgePos(bot.entity.position, backX, backZ)
    this.placementPredictor.record(bot.entity.position, edgePos)

    this._sneakUntilMs = ctx.nowMs + randFloat(70, 90)

    console.log(
      `[ninja dbg] BLOCK PLACED placedTotal=${ctx.placedThisMove + 1} sneakFor=${(this._sneakUntilMs - ctx.nowMs).toFixed(0)}ms ` +
      `pos=(${bot.entity.position.x.toFixed(2)},${bot.entity.position.y.toFixed(2)},${bot.entity.position.z.toFixed(2)}) ` +
      `yaw=${(bot.entity.yaw * RAD2DEG).toFixed(1)} pitch=${(bot.entity.pitch * RAD2DEG).toFixed(1)}`
    )

    this.currentPitch = this._nextPitch()
    this.currentYawBias = this._nextYawBias()
  }

  onMoveEnd(): void {
    this.phase = 'approach'
    this.placementPredictor.reset()
    this.shouldBridge = false
    this.currentYawBias = 0
    this._sneakUntilMs = 0
    this._wasOverAir = false
  }

  /**
   * Returns true if the player's leading edge (0.3 blocks ahead) is over air.
   * This triggers sneaking exactly when the edge is 0.3 blocks away.
   */
  private _atPlatformEdgeInTicks(backX: number, backZ: number, ticks = 1): boolean {
    const bot = this.bot

    const fuck = this.bot.physicsUtil.getPhysicsSim()
    const ctx = this.bot.physicsUtil.getPhysicsCtx(fuck, this.bot.entity)

    for (let i = 0; i < ticks; i++) {
      fuck.simulate(ctx, this.bot.world)
    }

    if (this.bot.entity.onGround && !ctx.state.onGround && ctx.state.vel.y < -0.1) return true

    const pos = ctx.state.pos

    const groundY = Math.floor(pos.y) - 1

    if (this.bot.entity.onGround) {
      const bx = Math.floor(pos.x)
      const bz = Math.floor(pos.z)
      const stepX = Math.round(backX)
      const stepZ = Math.round(backZ)
      if (!this.world.getBlockInfo(new Vec3(bx + stepX, groundY, bz + stepZ)).physical) return true
      if (stepX !== 0 && !this.world.getBlockInfo(new Vec3(bx + stepX, groundY, bz)).physical) return true
      if (stepZ !== 0 && !this.world.getBlockInfo(new Vec3(bx, groundY, bz + stepZ)).physical) return true
      return false
    }

    const leadX = pos.x + backX * 0.3
    const leadZ = pos.z + backZ * 0.3

    const blockAtLead = this.world.getBlockInfo(
      new Vec3(Math.floor(leadX), groundY, Math.floor(leadZ))
    )

    return !blockAtLead.physical && !blockAtLead.liquid
  }

  private _shouldAllowPlace(backX: number, backZ: number, targetBPos: Vec3): boolean {
    const sPos = this.bot.entity.position.offset(0, 1.55, 0)
    const fuck = (this.bot.world.raycast(
      sPos,
      this.bot.util.getViewDir().scale(0.1),
      40
    )) as unknown as RayType
    if (!fuck) return false
    // if (fuck.face === BlockFace.TOP) return false;
    // const backtrace = fuck.position.distanceTo(targetBPos) === 1
    // if (!backtrace) return false;

    const predictedBlockPos = fuck.position.plus(faceToVec(fuck.face))



    if (fuck && !predictedBlockPos.equals(targetBPos)) {
      // console.error(
      //   "woah that's bad",
      //   predictedBlockPos,
      //   fuck.face,
      //   targetBPos,
      //   this.bot.entity.yaw * RAD2DEG,
      //   this.bot.entity.position
      // )
      return false
    }

    const avg = this.placementPredictor.average()
    if (avg === null) return true

    const bot = this.bot
    const edgePos = this._computeEdgePos(bot.entity.position, backX, backZ)
    const off = bot.entity.position.minus(edgePos)
    const dist = Math.sqrt((off.x - avg.x) ** 2 + (off.z - avg.z) ** 2)
    return dist <= this.config.normal.placementPredictorThreshold
  }

  private _computeEdgePos(pos: Vec3, backX: number, backZ: number): Vec3 {
    return new Vec3(
      Math.floor(pos.x) + 0.5 - backX * 0.5,
      pos.y,
      Math.floor(pos.z) + 0.5 - backZ * 0.5
    )
  }

  private _getPathKind(dx: number, dz: number): BridgePathKind {
    return dx !== 0 && dz !== 0 ? 'diagonal' : 'straight'
  }

  private _getBridgeYaw(ctx: TickContext, pathKind: BridgePathKind, movingYaw: number, targetPlace: Vec3): number {
    if (pathKind === 'diagonal') {
      // Diagonal bridging: look exactly backward from path direction.
      return this._getDiagonalYaw(ctx, movingYaw, targetPlace)
    }

    return this._snapToNearestPrincipalDir(movingYaw - 5 * Math.PI / 4)
  }



  private _getDiagonalYaw(ctx: TickContext, movingYaw: number, targetBPos: Vec3): number {
    const baseYaw = this._snapToNearestPrincipalDir(movingYaw - Math.PI)

    if (targetBPos == null) return baseYaw

    const resolved = this._resolveDiagonalYawForTarget(baseYaw, targetBPos)
    return resolved ?? baseYaw
  }


  private _resolveDiagonalYawForTarget(baseYaw: number, targetBPos: Vec3): number | null {
    const bot = this.bot

    // Try current yaw first, then small alternating nudges.
    const step = 1.5 * DEG2RAD
    const attempts = [
      0,
      step, -step,
      2 * step, -2 * step,
      3 * step, -3 * step,
      4 * step, -4 * step,
      5 * step, -5 * step,
    ]

    const originalYaw = bot.entity.yaw

    for (const off of attempts) {
      const testYaw = this._snapToNearestPrincipalDir(baseYaw - Math.PI) + off

      // We only want to query cursor resolution, not commit permanent view state.
      bot.entity.yaw = testYaw
      const hit = bot.blockAtCursor() as (Block & { face: BlockFace }) | null

      if (!hit) continue

      const predictedBlockPos = hit.position.plus(faceToVec(hit.face))
      if (predictedBlockPos.equals(targetBPos)) {
        console.log('hiting on yaw:', testYaw)
        return testYaw
      }
    }

    console.log('NOTHING HIT??')
    bot.entity.yaw = originalYaw
    return null
  }

  private _getStraightBridgeMovement(ctx: TickContext, backX: number, backZ: number): Vec3 {
    const bot = this.bot

    // Keep straight-line logic essentially unchanged.
    // Move in the actual path direction, with line correction added.
    let movX = backX
    let movZ = backZ
    const line = ctx.lineTracker.getOptimalLine(bot, this.world)
    if (line != null) {
      const corr = ctx.lineTracker.getCorrectionDir(bot, line)
      if (corr.norm() > 0.001) {
        movX += corr.x * 0.9
        movZ += corr.z * 0.9
      }
    }

    const movLen = Math.sqrt(movX * movX + movZ * movZ)
    if (movLen < 0.001) {
      return new Vec3(0, 0, 0)
    }

    return new Vec3(movX / movLen, 0, movZ / movLen)
  }

  private _getDiagonalBridgeMovement(ctx: TickContext): Vec3 {
    const entryPos = ctx.move.entryPos.floored()
    const dx = ctx.move.exitPos.x - entryPos.x
    const dz = ctx.move.exitPos.z - entryPos.z
    const len = Math.sqrt(dx * dx + dz * dz)

    if (len < 0.001) {
      return new Vec3(0, 0, 0)
    }

    return new Vec3(dx / len, 0, dz / len)
  }

  /**
   * Snaps the facing yaw to the nearest of the 8 principal directions
   * (every 45°: cardinals + diagonals).
   */
  private _snapToNearestPrincipalDir(yaw: number): number {
    const D = Math.PI / 4
    const DIRS = [0, D, 2 * D, 3 * D, 4 * D, 5 * D, 6 * D, 7 * D]
    const wrapped = wrapRadians(yaw)
    let best = DIRS[0]
    let bestDist = Math.abs(shortestYawDelta(wrapped, best))
    for (let i = 1; i < DIRS.length; i++) {
      const dist = Math.abs(shortestYawDelta(wrapped, DIRS[i]))
      if (dist < bestDist) {
        bestDist = dist
        best = DIRS[i]
      }
    }
    return best
  }

  private _nextPitch(): number {
    return pitchFromDeg(
      this.config.normal.pitch +
      randFloat(-this.config.normal.pitchJitter, this.config.normal.pitchJitter)
    )
  }

  private _nextYawBias(): number {
    return randFloat(-this.config.normal.yawJitter, this.config.normal.yawJitter) * DEG2RAD
  }
}