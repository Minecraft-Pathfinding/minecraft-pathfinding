import { Vec3 } from 'vec3'
import { Move, MovementExecutor } from '../../../src'
import { ControlStateHandler, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { botSmartMovement, botStrafeMovement } from '../../../src/mineflayer-specific/movements/controls'
import {
  findSafeYaw,
  getNeoAlignmentTarget,
  getNeoDirectYaw,
  getNeoGoalBackVertex,
  signedRadians,
  getNeoYawSearchDirection,
  type NeoYawProbeResult
} from './neo-align-utils'
import { CancelError } from '../../../src/mineflayer-specific/exceptions'

export class NeoExecutor extends MovementExecutor {
  private static readonly ALIGN_EPS = 0.08
  private static readonly SNEAK_SETTLE_XZ_VEL = 1e-4
  private static readonly SNEAK_SETTLE_MAX_TICKS = 10
  private phase: 'approach' | 'jump' | 'air' | 'look' = 'approach'
  private airTicks = 0
  private approachTarget: Vec3 | null = null
  private backVertex: Vec3 | null = null
  private jumpYaw: number | null = null
  private alignSneakRequired = false
  private alignSneakWaitTicks = 0

  private isPositionAligned(alignTarget: Vec3): boolean {
    return this.bot.entity.position.xzDistanceTo(alignTarget) <= NeoExecutor.ALIGN_EPS
  }


  private shouldSneak() {
    const controls = ControlStateHandler.COPY_BOT(this.bot).set('sneak', false).set('jump', false)
    const ectx = this.simForward({ controls, ticks: 2 })
    const ret = !ectx.state.onGround && this.bot.entity.onGround && ectx.state.pos.y < this.bot.entity.position.y
    // console.log('should sneak?', ret)
    return ret

  }

  private shouldJumpNow(): boolean {
    const controls = ControlStateHandler.COPY_BOT(this.bot)
      .set('forward', true)
      .set('sprint', true)
      .set('back', false)
      .set('left', false)
      .set('right', false)
      .set('jump', false)
      .set('sneak', false)

    const ectx = this.simForward({ ticks: 2, controls })
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
        result = { safe: false, reason: 'horizontal-collision' }
        break
      }
      if (!ectx.state.onGround) {
        result = { safe: true, reason: 'direct' }
        break
      }
    }

    return result
  }

  private findIdealAlignYaw(thisMove: Move): number {
    const directYaw = getNeoDirectYaw(this.bot.entity.position, thisMove.exitPos)
    const directionHint = getNeoYawSearchDirection(thisMove)
    const safeYaw = findSafeYaw(directYaw, (yaw) => this.probeAlignYaw(yaw, 12), {
      maxDelta: Math.PI,
      probeStep: Math.PI / 60,
      directionHint
    })
    return signedRadians(safeYaw + directionHint * (Math.PI / 60))
  }

  private lookAtBackVertex(thisMove: Move): void {
    if (this.approachTarget == null) return

    this.backVertex ??= getNeoGoalBackVertex(thisMove, this.approachTarget)
    const target = this.backVertex
    const eye = this.bot.entity.position.offset(0, 1.62, 0)
    const delta = target.minus(eye)
    const yaw = Math.atan2(-delta.x, -delta.z)
    const pitch = Math.atan2(delta.y, Math.sqrt(delta.x * delta.x + delta.z * delta.z))



    if (this.jumpYaw == null) {
      this.jumpYaw = yaw;
    }

    console.log(this.bot.entity.yaw, this.jumpYaw, yaw)
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

  align(thisMove: Move): boolean {
    const alignTarget = getNeoAlignmentTarget(thisMove)
    this.approachTarget ??= alignTarget

    console.log(alignTarget)



    this.bot.clearControlStates()
    if (!this.isPositionAligned(alignTarget)) {
      botSmartMovement(this.bot, alignTarget, false, 0.001)
      botStrafeMovement(this.bot, alignTarget, false, 0.001)
      const sneak = this.shouldSneak()
      this.alignSneakRequired = sneak
      this.alignSneakWaitTicks = 0
      this.bot.setControlState('sneak', sneak)
      return false
    }


    const sneak = this.shouldSneak()
    this.alignSneakRequired = sneak
    this.alignSneakWaitTicks = 0
    this.bot.setControlState('sneak', sneak)


    if (this.alignSneakRequired) {
      const xzVelNorm = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm()
      if (xzVelNorm > NeoExecutor.SNEAK_SETTLE_XZ_VEL && this.alignSneakWaitTicks < NeoExecutor.SNEAK_SETTLE_MAX_TICKS) {
        this.alignSneakWaitTicks++
        return false
      }
    }

    const idealYaw = this.findIdealAlignYaw(thisMove)

    this.bot.entity.yaw = idealYaw
    this.bot.entity.pitch = 0

    return true
  }

  async performInit(thisMove: Move, _currentIndex: number, _path: Move[]): Promise<void> {
    const sneak = this.shouldSneak()
    this.bot.setControlState('sneak', sneak)
    this.phase = 'approach'
    this.airTicks = 0
    this.approachTarget = getNeoAlignmentTarget(thisMove)
    this.backVertex = null
    this.jumpYaw = null
    this.alignSneakRequired = false
    this.alignSneakWaitTicks = 0
    this.bot.setControlState('forward', true)
    this.bot.setControlState('sprint', true)
  }

  performPerTick(thisMove: Move, _tickCount: number, _currentIndex: number, _path: Move[]): boolean {
    const sneak = this.shouldSneak()

    console.log(this.phase)
    this.bot.setControlState('sneak', sneak)

    const botY = this.bot.entity.position.y + 0.6;
    if (botY < thisMove.entryPos.y) {
      throw new CancelError('Neo: y level too low!')
    }
    // this.bot.setControlState('forward', true)
    // this.bot.setControlState('sprint', true)


    // this.bot.setControlState('sneak', false)

    if (this.phase === 'approach') {
      if (this.shouldJumpNow()) {
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
        botStrafeMovement(this.bot, thisMove.exitPos, true)
        this.phase = 'look'
        console.log('[neo phase] look at back vertex', this.backVertex)
      }
      return false
    }

    if (this.phase === 'look') {
      this.lookAtBackVertex(thisMove)
      botStrafeMovement(this.bot, thisMove.exitPos, true)
      return this.bot.entity.onGround
    }

    return false
  }
}

export { NeoExecutor as ParkourForwardExecutor }
