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
import type { Block, RayType } from '../../../../src/types'
import { faceToVec } from '../../../../src/utils'
import { ControlStateHandler } from '@nxg-org/mineflayer-physics-util'

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

  /**
   * Deterministic sneak state machine.
   *
   * Physics model (20 TPS, 50 ms per tick):
   *   RELEASE (50 ms / 1 tick)  → sneak=false, bot drifts backward ≤ 0.044 blocks
   *   HOLD    (100 ms / 2 ticks) → sneak=true, clamps motion at edge; place block here
   *
   * State is ONLY advanced when the bot is actually at the edge
   * (_wouldFallWithMovement = true).  Between blocks the state is 'walking'
   * and sneak is never applied — that is what was causing the spam.
   */
  private _sneakState: 'walking' | 'hold' | 'release' = 'walking'
  private _sneakStateEndMs = 0
  private _notAtEdgeTicks = 0        // debounce: require N consecutive !atEdge ticks before resetting HOLD/RELEASE
  private _blockPlacedThisHold = false  // prevent HOLD→RELEASE when no block was actually placed
  private static readonly SNEAK_HOLD_MIN_MS = 60
  private static readonly SNEAK_HOLD_MAX_MS = 80
  private static readonly SNEAK_RELEASE_MS = 50  // 1 tick
  private static readonly NOT_AT_EDGE_RESET_TICKS = 2  // ticks of !atEdge needed to reset HOLD/RELEASE

  onMoveStart(ctx: TickContext): void {
    this.phase = 'approach'
    this.placementPredictor.reset()
    this.currentPitch = this._nextPitch()
    this.currentYawBias = this._nextYawBias()
    this.shouldBridge = false
    this._sneakState = 'walking'
    this._sneakStateEndMs = 0
    this._notAtEdgeTicks = 0
    this._blockPlacedThisHold = false
  }

  onTick(ctx: TickContext, placements: Vec3[]): ModeTickResult {
    const bot = this.bot
    const entryPos = ctx.move.entryPos.floored().offset(0.5, 0, 0.5)
    const dx = ctx.move.exitPos.x - entryPos.x
    const dz = ctx.move.exitPos.z - entryPos.z

    const pathKind = this._getPathKind(dx, dz)

    // Snap to the nearest of the 8 principal directions before deriving
    // backX/backZ.  Without this, a merged move that folds a 1-block lateral
    // correction into an otherwise cardinal bridge produces a slightly off-axis
    // yaw (e.g. atan2(-1,-5) ≈ -169° instead of -180°), which corrupts the
    // sneak-edge detector and triggers diagonal mode unnecessarily.
    const rawMovingYaw = this._snapToNearestPrincipalDir(Math.atan2(-dx, -dz))
    const movingYaw = rawMovingYaw + this.currentYawBias
    const { dx: backX, dz: backZ } = dirFromYaw(movingYaw)
    const onGround = bot.entity.onGround

    const overAir = this._atPlatformEdgeInTicks(backX, backZ, 0)

    const checkBlock = placements.filter(p => this.bot.blockAt(p)?.boundingBox === 'empty')[0]


    if (this.phase === 'approach') {
      const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
      // Pre-align to the bridge yaw during approach so the bot is already looking
      // at the correct x*45° angle by the time it reaches the edge.
      result.targetYaw = this._getBridgeYaw(ctx, pathKind, movingYaw, checkBlock)
      result.targetPitch = this.currentPitch
      result.allowPlace = false
      result.wantSprint = true

      if (onGround && overAir) {
        this.phase = 'bridge'
        this.shouldBridge = true
        this._sneakState = 'walking'  // first bridge tick will immediately enter HOLD
        this._sneakStateEndMs = 0
        this._notAtEdgeTicks = 0
        this._blockPlacedThisHold = false
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
      result.useStrafe = false
      // While unaligned, sneak immediately if movement would send us off the edge.
      // Re-evaluated every tick so it auto-clears as soon as safe.
      result.wantSneak = this._wouldFallWithMovement(backX, backZ)
      result.targetYaw = bridgeYaw
      result.targetPitch = this.currentPitch
      result.allowPlace = false
      result.wantSprint = false
      return result
    }

    const nowMs = ctx.nowMs

    // ── Edge-gated sneak state machine ───────────────────────────────────────
    //
    // The machine ONLY advances when the bot is truly at the edge
    // (_wouldFallWithMovement = true with 5-tick look-ahead).
    // Between blocks (after placement, walking to the next edge) state is
    // 'walking' and sneak is never set — this was the "spam sneak" root cause.
    //
    //   'walking' → not at edge, move freely
    //   'hold'    → at edge, sneak=true  100 ms (2 ticks), place block here
    //   'release' → at edge, sneak=false  50 ms (1 tick), bot drifts ≤ 0.044 blks
    //
    // Backward movement is ALWAYS applied; sneak physically clamps the drift at
    // the 0.3-block bounding-box edge so zeroing movement is never needed.

    const atEdge = this._wouldFallWithMovement(backX, backZ)

    if (!atEdge) {
      // Require NOT_AT_EDGE_RESET_TICKS consecutive non-edge ticks before resetting
      // HOLD/RELEASE — prevents physics-sim noise from cutting the hold timer short.
      // In 'walking' state we reset immediately (nothing to protect).
      this._notAtEdgeTicks++
      if (this._sneakState === 'walking' || this._notAtEdgeTicks >= NormalMode.NOT_AT_EDGE_RESET_TICKS) {
        this._sneakState = 'walking'
        this._sneakStateEndMs = 0
        this._blockPlacedThisHold = false
        this._notAtEdgeTicks = 0
      }
    } else {
      this._notAtEdgeTicks = 0

      if (this._sneakState === 'walking') {
        // Just arrived at edge: enter HOLD.
        this._sneakState = 'hold'
        this._blockPlacedThisHold = false
        this._sneakStateEndMs = nowMs + randFloat(NormalMode.SNEAK_HOLD_MIN_MS, NormalMode.SNEAK_HOLD_MAX_MS)
      } else if (nowMs >= this._sneakStateEndMs) {
        // Advance hold ↔ release cycle.
        if (this._sneakState === 'hold') {
          if (this._blockPlacedThisHold) {
            // Block was placed — safe to release sneak briefly.
            this._sneakState = 'release'
            this._sneakStateEndMs = nowMs + NormalMode.SNEAK_RELEASE_MS
          } else {
            // No block placed yet — extending HOLD to avoid releasing over air.
            this._sneakStateEndMs = nowMs + randFloat(NormalMode.SNEAK_HOLD_MIN_MS, NormalMode.SNEAK_HOLD_MAX_MS)
          }
        } else {
          // release → hold
          this._sneakState = 'hold'
          this._blockPlacedThisHold = false
          this._sneakStateEndMs = nowMs + randFloat(NormalMode.SNEAK_HOLD_MIN_MS, NormalMode.SNEAK_HOLD_MAX_MS)
        }
      }
    }

    const wantSneak = this._sneakState === 'hold'
    // Allow placement only during HOLD: sneak is keeping us safely on the edge,
    // and BridgeExecutor's placementCooldownUntilMs prevents double-fires.
    const allowPlace = this.shouldBridge &&
      this._sneakState === 'hold' &&
      (!checkBlock || this._shouldAllowPlace(backX, backZ, checkBlock))

    // Always provide backward movement — sneak clamps it physically at the edge.
    const movementVec = pathKind === 'diagonal'
      ? this._getDiagonalBridgeMovement(ctx)
      : this._getStraightBridgeMovement(ctx, backX, backZ)

    const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
    result.wantSneak = wantSneak
    result.targetYaw = bridgeYaw
    result.targetPitch = this.currentPitch
    result.allowPlace = allowPlace
    result.wantSprint = false
    result.movementOverride = movementVec
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

    console.log(
      `[ninja dbg] BLOCK PLACED placedTotal=${ctx.placedThisMove + 1} ` +
      `pos=(${bot.entity.position.x.toFixed(2)},${bot.entity.position.y.toFixed(2)},${bot.entity.position.z.toFixed(2)}) ` +
      `yaw=${(bot.entity.yaw * RAD2DEG).toFixed(1)} pitch=${(bot.entity.pitch * RAD2DEG).toFixed(1)}`
    )

    this._blockPlacedThisHold = true
    this.currentPitch = this._nextPitch()
    this.currentYawBias = this._nextYawBias()
  }

  onMoveEnd(): void {
    this.phase = 'approach'
    this.placementPredictor.reset()
    this.shouldBridge = false
    this.currentYawBias = 0
    this._sneakState = 'walking'
    this._sneakStateEndMs = 0
    this._notAtEdgeTicks = 0
    this._blockPlacedThisHold = false
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
      console.error(
        "woah that's bad",
        predictedBlockPos,
        fuck.face,
        targetBPos,
        this.bot.entity.yaw * RAD2DEG,
        this.bot.entity.position
      )
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

  /**
   * Classify a bridge move as straight (cardinal) or diagonal (intercardinal).
   *
   * The naive check `dx !== 0 && dz !== 0` breaks when the optimiser merges a
   * short lateral-correction Diagonal move with a run of Forward moves: the
   * resulting merged move has a tiny dx and a large dz (or vice-versa), but
   * both are non-zero, so the old code entered diagonal mode even though the
   * overall bridge is cardinal.
   *
   * Fix: compare the magnitudes of the two components.  A true 45° diagonal has
   * ratio = min/max ≈ 1.0.  A cardinal bridge with a 1-block correction and
   * n≥2 forward blocks has ratio ≤ 1/2 = 0.5.  We require ≥ 0.7 (within ~35°
   * of 45°) to call it diagonal, which leaves a comfortable margin for genuine
   * diagonal bridges while ignoring small lateral artefacts.
   */
  private _getPathKind(dx: number, dz: number): BridgePathKind {
    const ax = Math.abs(dx)
    const az = Math.abs(dz)
    if (ax < 0.001 || az < 0.001) return 'straight'
    const ratio = Math.min(ax, az) / Math.max(ax, az)
    return ratio >= 0.7 ? 'diagonal' : 'straight'
  }
  private _getBridgeYaw(ctx: TickContext, pathKind: BridgePathKind, movingYaw: number, targetPlace: Vec3): number {
    if (pathKind === 'diagonal') {
      // Diagonal bridging: look exactly backward from path direction.
      return this._getDiagonalYaw(ctx, movingYaw, targetPlace)
    }

    return this._snapToNearestPrincipalDir(movingYaw - 3 * Math.PI / 4)
  }



  private _getDiagonalYaw(ctx: TickContext, movingYaw: number, targetBPos: Vec3): number {
    const baseYaw = this._snapToNearestPrincipalDir(movingYaw - Math.PI)

    if (targetBPos == null) return baseYaw

    const resolved = this._resolveDiagonalYawForTarget(baseYaw, targetBPos)
    return resolved ?? baseYaw
  }


  private _resolveDiagonalYawForTarget(baseYaw: number, targetBPos: Vec3): number | null {
    const bot = this.bot

    // baseYaw is already the backward-facing yaw (movingYaw - π, snapped to 45°).
    // Try small alternating nudges around it to find the exact angle that
    // places the cursor on targetBPos.
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
    let found: number | null = null

    for (const off of attempts) {
      // Do NOT apply another -π here — baseYaw is already backward-facing.
      const testYaw = baseYaw + off

      // Temporarily set yaw to query cursor; always restored below.
      bot.entity.yaw = testYaw
      const hit = bot.blockAtCursor() as (Block & { face: BlockFace }) | null

      if (!hit) continue

      const predictedBlockPos = hit.position.plus(faceToVec(hit.face))
      if (predictedBlockPos.equals(targetBPos)) {
        console.log('hiting on yaw:', testYaw)
        found = testYaw
        break
      }
    }

    // Always restore the real yaw — never leave bot.entity.yaw in a test state.
    bot.entity.yaw = originalYaw

    if (found === null) console.log('NOTHING HIT??')
    return found
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
   * Simulates N physics ticks with the actual S+D movement controls that will
   * be applied this tick (mirroring _applyDirectionalVector), but with sneak
   * forced off. Returns true if the bot would leave the ground — i.e. it needs
   * to sneak to stay on the platform.
   *
   * Using DEFAULT controls (no movement) was wrong: ground friction kills
   * velocity in 1 tick so willFallOff returned false even at the edge, and
   * the very next tick S+D pushed the bot off.
   */
  private _wouldFallWithMovement(moveX: number, moveZ: number): boolean {
    const yaw = this.bot.entity.yaw
    const cosYaw = Math.cos(yaw)
    const sinYaw = Math.sin(yaw)

    const fwdDot  = -sinYaw * moveX - cosYaw * moveZ
    const rightDot = -cosYaw * moveX + sinYaw * moveZ
    const EPS = 1e-2

    const ctrl = ControlStateHandler.DEFAULT()
    ctrl.set('forward', fwdDot  >  EPS)
    ctrl.set('back',    fwdDot  < -EPS)
    ctrl.set('right',   rightDot < -EPS)
    ctrl.set('left',    rightDot >  EPS)
    ctrl.set('sneak',   false)

    const ectx = this.executor.simForward({ticks:5, controls: ctrl});

    return ectx.position.y < this.bot.entity.position.y && !ectx.state.onGround
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