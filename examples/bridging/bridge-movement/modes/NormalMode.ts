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
import { Block } from '../../../src/types'
import { faceToVec } from '../../../src/mineflayer-specific/movements/interactionUtils'

const NINJA_ALIGN_THRESH_DEG = 0.1
const NINJA_PITCH_THRESH_DEG = 1.5

type BridgePhase = 'approach' | 'bridge'

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

  onMoveStart (ctx: TickContext): void {
    this.phase = 'approach'
    this.placementPredictor.reset()
    this.currentPitch = this._nextPitch()
    this.currentYawBias = this._nextYawBias()
    this.shouldBridge = false
    this._sneakUntilMs = 0
    this._wasOverAir = false
  }

  onTick (ctx: TickContext, placements: Vec3[]): ModeTickResult {
    const bot = this.bot
    const dx = ctx.move.exitPos.x - ctx.move.entryPos.x
    const dz = ctx.move.exitPos.z - ctx.move.entryPos.z
    const rawMovingYaw = Math.atan2(-dx, -dz)
    const movingYaw = rawMovingYaw + this.currentYawBias
    const { dx: backX, dz: backZ } = dirFromYaw(movingYaw)
    const onGround = bot.entity.onGround

    const overAir = this._atPlatformEdgeInTicks(backX, backZ, 0);

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
          `pos=(${bot.entity.position.x.toFixed(2)},${bot.entity.position.y.toFixed(2)},${bot.entity.position.z.toFixed(2)}) ` +
          `yaw=${(bot.entity.yaw * RAD2DEG).toFixed(1)}`
        )
      } else {
        result.movementOverride = null
      }
      return result
    }

    // Ninja bridge: aim at the backward‑right diagonal (movingYaw - 3π/4).
    // In mineflayer yaw convention: 0°=North, 90°=West, 180°=South, 270°=East.
    // Resulting facing directions for each cardinal path:
    //   Path North → facing 225° (SE)
    //   Path East  → facing 135° (SW)
    //   Path South → facing  45° (NW)  ← the backward corner to place on
    //   Path West  → facing 315° (NE)
    const ninjaYaw = this._snapToNearestPrincipalDir(movingYaw - 3 * Math.PI / 4)

    const yawErr = Math.abs(shortestYawDelta(bot.entity.yaw, ninjaYaw))
    const pitchErr = Math.abs((bot.entity.pitch - this.currentPitch) * RAD2DEG)
    if (yawErr > NINJA_ALIGN_THRESH_DEG * DEG2RAD || pitchErr > NINJA_PITCH_THRESH_DEG) {
      console.log('ninja misalign', bot.entity.yaw * RAD2DEG, bot.entity.pitch * RAD2DEG, ninjaYaw * RAD2DEG, this.currentPitch * RAD2DEG)
      console.log('[ninja dbg] UNALIGNED yawErr=' + (yawErr * RAD2DEG).toFixed(1) + '° pitchErr=' + pitchErr.toFixed(1) + '°')
      const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
      result.wantSneak = true
      result.targetYaw = ninjaYaw
      result.targetPitch = this.currentPitch
      // result.movementOverride = new Vec3(0, 0, 0)
      result.allowPlace = false
      result.wantSprint = false
      return result
    }

    const nowMs = ctx.nowMs

    // ── Smooth, humanistic sneak logic ───────────────────────────────────
    // A real player makes one macro decision ("sneak for ~80 ms") rather than
    // toggling sneak every tick based on raw position checks.
    //
    // Rising-edge trigger: arm a fresh window the FIRST tick the leading
    //   hitbox enters air.  Suppressed if a window is already active, so
    //   we never re-trigger mid-sneak (eliminates key-spam).
    // Safety extension: if we're still over air when the window expires,
    //   renew it briefly instead of letting the player step off the edge.
    if (overAir && !this._wasOverAir && nowMs >= this._sneakUntilMs) {
      // Leading edge just crossed into air — start a fresh sneak window.
      this._sneakUntilMs = nowMs + randFloat(70, 90)
    } else if (overAir && nowMs >= this._sneakUntilMs) {
      // Window expired but player is still at the edge: brief safety renewal.
      this._sneakUntilMs = nowMs + randFloat(40, 55)
    }
    this._wasOverAir = overAir
    // ─────────────────────────────────────────────────────────────────────

    console.log(
      `[ninja dbg] phase=bridge sneaking=${nowMs < this._sneakUntilMs} overAir=${overAir} onGround=${onGround} ` +
      `yaw=${(bot.entity.yaw * RAD2DEG).toFixed(1)} pitch=${(bot.entity.pitch * RAD2DEG).toFixed(1)} ` +
      `pos=(${bot.entity.position.x.toFixed(2)},${bot.entity.position.y.toFixed(2)},${bot.entity.position.z.toFixed(2)}) ` +
      `vel=(${bot.entity.velocity.x.toFixed(3)},${bot.entity.velocity.y.toFixed(3)},${bot.entity.velocity.z.toFixed(3)}) ` +
      `placed=${ctx.placedThisMove}`
    )


    const checkBlock = placements.filter(p => this.bot.blockAt(p)?.boundingBox === "empty")[0]

    let allowPlace = this.shouldBridge && (!checkBlock || this._shouldAllowPlace(ctx, backX, backZ, checkBlock))

    const result: ModeTickResult = { ...DEFAULT_TICK_RESULT }
    result.wantSneak = nowMs < this._sneakUntilMs
    result.targetYaw = ninjaYaw
    result.targetPitch = this.currentPitch
    result.allowPlace = allowPlace;
    result.wantSprint = false

    // Move in the actual path direction (backX/backZ are derived from the path's
    // entryPos→exitPos vector).  The ninjaYaw is ONLY for the facing/aiming
    // direction — block placement requires looking diagonally down at the edge,
    // but the player's feet must follow the path, not the facing vector.
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
    // console.log(movX, movZ, line, movX / movLen, 0, movZ / movLen)
    if (movLen < 0.001) {
      result.movementOverride = new Vec3(0, 0, 0)
    } else {
      result.movementOverride = new Vec3(movX / movLen, 0, movZ / movLen)
    }

    return result
  }

  onBlockPlaced (ctx: TickContext): void {
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

  onMoveEnd (): void {
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
  private _atPlatformEdgeInTicks (backX: number, backZ: number, ticks = 1): boolean {
    const bot = this.bot
  

    const fuck = this.bot.physicsUtil.getPhysicsSim();
    const ctx = this.bot.physicsUtil.getPhysicsCtx(fuck, this.bot.entity);

    for (let i = 0; i < ticks; i++) {
      fuck.simulate(ctx, this.bot.world);
    }

    if (this.bot.entity.onGround && !ctx.state.onGround && ctx.state.vel.y < -0.1) return true; // yes.

    const pos = ctx.state.pos; // bot.entity.position


    // Ground Y is the block directly below the player's feet.
    const groundY = Math.floor(pos.y) - 1

    // If the player is not on ground, we cannot reliably use the leading-edge check.
    // Fall back to a simpler integer check (though this rarely happens during bridging).
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

    // On ground: check the block directly under the player's leading hitbox edge.
    // Player width is 0.6, so leading edge is 0.3 blocks ahead in movement direction.
    const leadX = pos.x + backX * 0.3
    const leadZ = pos.z + backZ * 0.3



    const blockAtLead = this.world.getBlockInfo(
      new Vec3(Math.floor(leadX), groundY, Math.floor(leadZ))
    )

    return !blockAtLead.physical && !blockAtLead.liquid
  }

  private _shouldAllowPlace (ctx: TickContext, backX: number, backZ: number, targetBPos: Vec3): boolean {
    const fuck = this.bot.blockAtCursor()! as (Block & { face: BlockFace }) | null;

    if (!fuck) return false;
    const predictedBlockPos  = fuck.position.plus(faceToVec(fuck.face))
  
    if (fuck && !predictedBlockPos.equals((targetBPos))) {
      console.error("woah that's bad", predictedBlockPos, fuck.face, targetBPos, this.bot.entity.yaw * RAD2DEG, this.bot.entity.position)
      return false;
    }

    const avg = this.placementPredictor.average()
    if (avg === null) return true

    const bot = this.bot
    const edgePos = this._computeEdgePos(bot.entity.position, backX, backZ)
    const off = bot.entity.position.minus(edgePos)
    const dist = Math.sqrt((off.x - avg.x) ** 2 + (off.z - avg.z) ** 2)
    return dist <= this.config.normal.placementPredictorThreshold
  }

  private _computeEdgePos (pos: Vec3, backX: number, backZ: number): Vec3 {
    return new Vec3(
      Math.floor(pos.x) + 0.5 - backX * 0.5,
      pos.y,
      Math.floor(pos.z) + 0.5 - backZ * 0.5
    )
  }

  /**
   * Snaps the facing yaw to the nearest of the 8 principal directions
   * (every 45°: cardinals + diagonals).
   */
  private _snapToNearestPrincipalDir (yaw: number): number {
    const D = Math.PI / 4
    const DIRS = [0, D, 2 * D, 3 * D, 4 * D, 5 * D, 6 * D, 7 * D]
    const wrapped = wrapRadians(yaw)
    let best = DIRS[0]
    let bestDist = Math.abs(shortestYawDelta(wrapped, best))
    for (let i = 1; i < DIRS.length; i++) {
      const dist = Math.abs(shortestYawDelta(wrapped, DIRS[i]))
      if (dist < bestDist) { bestDist = dist; best = DIRS[i] }
    }
    return best
  }

  private _nextPitch (): number {
    return pitchFromDeg(
      this.config.normal.pitch +
      randFloat(-this.config.normal.pitchJitter, this.config.normal.pitchJitter)
    )
  }

  private _nextYawBias (): number {
    return randFloat(-this.config.normal.yawJitter, this.config.normal.yawJitter) * DEG2RAD
  }
}