import { Vec3 } from 'vec3'
import { Move, MovementExecutor } from '../../../src'
import { ControlStateHandler, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { botSmartMovement, botStrafeMovement } from '../../../src/mineflayer-specific/movements/controls'
import {
  findSafeYaw,
  collectNeoWallAABBs,
  getNeoAlignmentTarget,
  getNeoAlignmentSide,
  getNeoDirectYaw,
  getNeoGoalBackVertex,
  signedRadians,
  getNeoYawSearchDirection,
  type NeoYawProbeResult
} from './neo-align-utils'
import { CancelError } from '../../../src/mineflayer-specific/exceptions'
import { printBotControls } from '../../../src/utils'
import { World } from '../../../src/mineflayer-specific/world/worldInterface'
import { MovementOptions } from '../../../src/mineflayer-specific/movements'

export interface NeoExecutorSettings {
  neoWaitForVelocitySettle?: boolean
}

export class NeoExecutor extends MovementExecutor {
  private static readonly ALIGN_EPS = 0.08
  private static readonly ALIGN_SNEAK_EPS = 0.15
  private static readonly SNEAK_SETTLE_XZ_VEL = 1e-4
  private static readonly SNEAK_SETTLE_MAX_TICKS = 5
  private static readonly VELOCITY_SETTLE_XZ_VEL = 1e-4
  private phase: 'approach' | 'jump' | 'air' | 'look' = 'approach'
  private airTicks = 0
  private approachTarget: Vec3 | null = null
  private backVertex: Vec3 | null = null
  private jumpYaw: number | null = null
  private neededSneak = false
  private alignSneakWaitTicks = 0
  private pendingIdealYaw: number | null = null
  private strictStrafeActive = false
  private neoWallBlocks: AABB[] = []
  private readonly waitForVelocitySettle: boolean

  private isPositionAligned(alignTarget: Vec3): boolean {
    console.log(`alignment: %O -> %O, dist: %d`, this.bot.entity.position, alignTarget, this.bot.entity.position.xzDistanceTo(alignTarget))
    return this.bot.entity.position.xzDistanceTo(alignTarget) <= NeoExecutor.ALIGN_EPS
  }

  constructor(bot: import('mineflayer').Bot, world: World, settings: Partial<MovementOptions> & NeoExecutorSettings = {}) {
    super(bot, world, settings)
    this.waitForVelocitySettle = settings.neoWaitForVelocitySettle ?? true
  }

  override reset(): void {
    this.approachTarget = null;
    this.backVertex = null;
    this.jumpYaw = null;
    this.pendingIdealYaw = null
    super.reset()
  }


  private shouldSneak(ticks = 2) {
    const controls = ControlStateHandler.COPY_BOT(this.bot).set('sneak', false).set('jump', false)
    const ectx = this.simForward({ controls, ticks })
    const ret = !ectx.state.onGround && this.bot.entity.onGround && ectx.state.pos.y < this.bot.entity.position.y
    // console.log('should sneak?', ret, ectx.position, this.bot.entity.position)
    return ret

  }

  private shouldJumpNow(ticks = 1): boolean {
    const controls = ControlStateHandler.COPY_BOT(this.bot)
      .set('forward', true)
      .set('sprint', true)
      .set('back', false)
      .set('left', false)
      .set('right', false)
      .set('jump', false)
      .set('sneak', false)

    const ectx = this.simForward({ ticks, controls })
    const nextOnGround = ectx.state.onGround
    const nextHortCollision = ectx.state.isCollidedHorizontally

    // console.log(
    //   '[neo jump check]',
    //   'pos=', this.bot.entity.position,
    //   'nextOnGround=', nextOnGround,
    //   'nextHortCollision=', nextHortCollision,
    //   'nextPos=', ectx.state.pos,
    //   'nextVel=', ectx.state.vel
    // )

    return !nextOnGround
  }

  private probeAlignYaw(yaw: number, maxTicks = 10): NeoYawProbeResult {
    const controls = ControlStateHandler.COPY_BOT(this.bot)
      .set('forward', true)
      .set('sprint', true)
      .set('back', false)
      .set('left', false)
      .set('right', false)
      .set('jump', false)
      .set('sneak', false)


    let result: NeoYawProbeResult = { safe: false, reason: 'no-escape' }
    const ectx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    ectx.state.yaw = yaw
    ectx.state.pitch = 0
    for (let i = 0; i < maxTicks; i++) {
      this.simForward({ ticks: 1, controls, ectx })
      if (ectx.state.isCollidedHorizontally) {
        result = { safe: false, reason: 'horizontal-collision', age: i }
        break
      }
      if (!ectx.state.onGround) {
        result = { safe: true, reason: 'direct', age: i }
        break
      }
    }

    return result
  }

  private findIdealAlignYaw(thisMove: Move): { yaw: number, usedFallback: boolean } {
    const directYaw = getNeoDirectYaw(this.bot.entity.position, thisMove.exitPos)
    const side = getNeoAlignmentSide(thisMove)
    const directionHint = getNeoYawSearchDirection(thisMove, side)

    const dist = thisMove.entryPos.floored().xzDistanceTo(thisMove.exitPos.floored())
    let maxDist, probeStep;
    if (dist === 3) {
      maxDist = 180 * (Math.PI / 180);
      probeStep = 0.5 * (Math.PI / 180);
    } else {
      maxDist = 30 * (Math.PI / 180);
      probeStep = 0.5 * (Math.PI / 180);
    }

    const directProbe = this.probeAlignYaw(directYaw, 12)
    if (directProbe.safe && directProbe.age && directProbe.age > 1) {
      console.log('safe??', directProbe.age)
      return { yaw: signedRadians(directYaw), usedFallback: false }
    }

    const safeYaw = findSafeYaw(directYaw, (yaw) => this.probeAlignYaw(yaw, 12), {
      maxDelta: maxDist,
      probeStep: probeStep,
      directionHint
    })

    const usedFallback = Math.abs(safeYaw - directYaw) < 1e-9
    return {
      yaw: signedRadians(safeYaw),
      usedFallback
    }
  }

  private lookAtBackVertex(thisMove: Move): void {
    if (this.approachTarget == null) return

    this.backVertex ??= getNeoGoalBackVertex(thisMove, this.approachTarget)
    const target = this.backVertex
    const eye = this.bot.entity.position.offset(0, 1.62, 0)
    const delta = target.minus(eye)
    const yaw = Math.atan2(-delta.x, -delta.z)
    const pitch = Math.atan2(delta.y, Math.sqrt(delta.x * delta.x + delta.z * delta.z))



    // if (this.jumpYaw == null) {
    this.jumpYaw = yaw;
    // }

    this.bot.entity.yaw = this.jumpYaw!
    this.bot.entity.pitch = pitch
  }

  private hasClearedEntryWall(thisMove: Move): boolean {
    if (this.approachTarget == null) return false

    const entry = thisMove.entryPos.floored()
    const entryWall = new AABB(entry.x, entry.y, entry.z, entry.x + 1, entry.y + 3, entry.z + 1)

    const ectx = this.simForward({ ticks: 2 })
    const playerBB = AABBUtils.getPlayerAABBRaw(ectx.position, this.bot.entity.height)

    return !entryWall.intersects(playerBB)
  }


  private getNeoWallEnvelope(): { minX: number, maxX: number, minZ: number, maxZ: number } | null {
    if (this.neoWallBlocks.length === 0) return null

    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity

    for (const bb of this.neoWallBlocks) {
      minX = Math.min(minX, bb.minX)
      maxX = Math.max(maxX, bb.maxX)
      minZ = Math.min(minZ, bb.minZ)
      maxZ = Math.max(maxZ, bb.maxZ)
    }

    return { minX, maxX, minZ, maxZ }
  }

  private hasClearedNeoWall(thisMove: Move): boolean {
    const envelope = this.getNeoWallEnvelope()
    if (envelope == null) return false


    const ectx = this.simForward({ ticks: 3 })
    const playerBB = AABBUtils.getPlayerAABBRaw(ectx.position, this.bot.entity.height)

    const delta = thisMove.exitPos.minus(thisMove.entryPos)
    const xMajor = Math.abs(delta.x) >= Math.abs(delta.z)
    const epsilon = 0.02

    if (xMajor) {
      return delta.x >= 0
        ? playerBB.minX > envelope.maxX + epsilon
        : playerBB.maxX < envelope.minX - epsilon
    }

    return delta.z >= 0
      ? playerBB.minZ > envelope.maxZ + epsilon
      : playerBB.maxZ < envelope.minZ - epsilon
  }

  private updateStrictStrafeState(thisMove: Move): boolean {
    if (!this.strictStrafeActive && this.hasClearedNeoWall(thisMove)) {
      this.strictStrafeActive = true
    }

    return this.strictStrafeActive
  }

  async align(thisMove: Move): Promise<boolean> {
    const side = getNeoAlignmentSide(thisMove)
    const alignTarget = getNeoAlignmentTarget(thisMove, side)
    this.approachTarget ??= alignTarget

    console.log(this.approachTarget, alignTarget)

    this.bot.clearControlStates()
    if (!this.isPositionAligned(alignTarget)) {
      botSmartMovement(this.bot, alignTarget, false, 0.001)
      botStrafeMovement(this.bot, alignTarget, false, 0.001)
      this.neededSneak ||= this.shouldSneak()
      const sneak = this.neededSneak ||  this.bot.entity.position.xzDistanceTo(alignTarget) < NeoExecutor.ALIGN_SNEAK_EPS
      this.alignSneakWaitTicks = 0
      this.pendingIdealYaw = null
      this.bot.setControlState('sneak', sneak)
      return false
    }


    if (this.waitForVelocitySettle) {
      this.neededSneak ||= this.shouldSneak(2)
      this.bot.clearControlStates()
      this.bot.setControlState('sneak', true)

      printBotControls(this.bot)

      const xzVelNorm = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm()
      if (xzVelNorm >= NeoExecutor.VELOCITY_SETTLE_XZ_VEL) return false
    }


    if (!this.isPositionAligned(alignTarget)) {
      this.bot.clearControlStates()
      botSmartMovement(this.bot, alignTarget, false, 0.001)
      botStrafeMovement(this.bot, alignTarget, false, 0.001)
      this.neededSneak ||= this.shouldSneak()
      const sneak = this.neededSneak || this.bot.entity.position.xzDistanceTo(alignTarget) < NeoExecutor.ALIGN_SNEAK_EPS
      this.alignSneakWaitTicks = 0
      this.pendingIdealYaw = null

      console.log('goddamnit?')
      this.bot.setControlState('sneak', sneak)
      return false
    }

    console.log('yes done')

    // const idealYawResult = this.findIdealAlignYaw(thisMove)
    // if (idealYawResult.usedFallback) {
    //   throw new CancelError('Neo: cannot make this jump')
    // }

    // this.pendingIdealYaw = idealYawResult.yaw
    this.neededSneak ||= this.shouldSneak()
    this.alignSneakWaitTicks = 0
    this.bot.setControlState('sneak', this.neededSneak)


    if (this.neededSneak) {
      const xzVelNorm = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm()
      if (xzVelNorm > NeoExecutor.SNEAK_SETTLE_XZ_VEL && this.alignSneakWaitTicks < NeoExecutor.SNEAK_SETTLE_MAX_TICKS) {
        this.alignSneakWaitTicks++
        return false
      }
    }


    return true
  }

  async performInit(thisMove: Move, _currentIndex: number, _path: Move[]): Promise<void> {
    this.neededSneak ||= this.shouldSneak()
    this.bot.setControlState('sneak', this.neededSneak)
    this.phase = 'approach'
    this.airTicks = 0
    this.approachTarget = getNeoAlignmentTarget(thisMove, getNeoAlignmentSide(thisMove))
    this.backVertex = null
    this.jumpYaw = null
    this.neededSneak = false
    this.alignSneakWaitTicks = 0
    this.strictStrafeActive = false
    this.neoWallBlocks = collectNeoWallAABBs(thisMove, (pos) => this.getBlockInfoRaw(pos))

    // this.bot.entity.position.set(this.approachTarget.x, this.approachTarget.y + 1, this.approachTarget.z)
    // this.bot.entity.velocity.set(0, 0, 0)
    this.bot.entity.yaw = this.findIdealAlignYaw(thisMove).yaw
    this.pendingIdealYaw = null
    this.bot.entity.pitch = 0

    // await this.bot.waitForTicks(2)

    this.bot.setControlState('forward', true)
    this.bot.setControlState('sprint', true)
    this.bot.setControlState('back', false)
  }

  performPerTick(thisMove: Move, _tickCount: number, _currentIndex: number, _path: Move[]): boolean {
    const sneak = this.shouldSneak() && !this.shouldJumpNow(2)
    this.neededSneak = sneak;
    this.bot.setControlState('sneak', sneak)

    const botY = this.bot.entity.position.y + 0.6;
    if (botY < thisMove.entryPos.y) {
      throw new CancelError('Neo: y level too low!')
    }
    // this.bot.setControlState('forward', true)
    // this.bot.setControlState('sprint', true)


    // this.bot.setControlState('sneak', false)

    if (this.phase === 'approach') {
      if (this.shouldJumpNow(1)) {
        this.phase = 'jump'
        this.jumpYaw = this.bot.entity.yaw
        this.bot.setControlState('jump', true)
        this.bot.setControlState('sneak', false)
        console.log('[neo phase] jump triggered')
      }
      if (this.jumpYaw != null) {
        this.bot.entity.yaw = this.jumpYaw
      }
      return false
    }

    if (this.phase === 'jump') {
      if (this.jumpYaw != null) {
        this.bot.entity.yaw = this.jumpYaw
      }
      this.bot.setControlState('jump', true)
      if (!this.bot.entity.onGround) {
        this.airTicks++
      }

      if (this.hasClearedEntryWall(thisMove)) {
        this.jumpYaw = null;
        this.lookAtBackVertex(thisMove)
        // botStrafeMovement(this.bot, thisMove.exitPos, true)
        this.phase = 'look'
        console.log('[neo phase] look at back vertex', this.backVertex)
      }
      return false
    }

    if (this.phase === 'look') {
      if (this.updateStrictStrafeState(thisMove)) {
        console.log('strafe')
        botStrafeMovement(this.bot, thisMove.exitPos, true)
      } else {
        this.lookAtBackVertex(thisMove)
      }
      return this.bot.entity.onGround
    }

    return false
  }
}

export { NeoExecutor as ParkourForwardExecutor }
