import { Vec3 } from 'vec3'
import { Move, MovementExecutor } from '../../../src'
import { ControlStateHandler, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { botSmartMovement, botStrafeMovement } from '../../../src/mineflayer-specific/movements/controls'
import {
  findSafeYaw,
  getNeoAlignmentTarget,
  getNeoDirectYaw,
  getNeoGoalBackVertex,
  getNeoYawSearchDirection,
  type NeoYawProbeResult
} from './neo-align-utils'

export class NeoExecutor extends MovementExecutor {
  private static readonly ALIGN_EPS = 0.08
  private phase: 'approach' | 'jump' | 'air' | 'look' = 'approach'
  private airTicks = 0
  private approachTarget: Vec3 | null = null
  private backVertex: Vec3 | null = null

  private isPositionAligned(alignTarget: Vec3): boolean {
    return this.bot.entity.position.xzDistanceTo(alignTarget) <= NeoExecutor.ALIGN_EPS
  }


  private shouldSneak() {
      // const controls = ControlStateHandler.COPY_BOT(this.bot).set('sneak', false).set('jump', false)
      // const ectx = this.simForward({controls, ticks: 2})
      // const ret = !ectx.state.onGround && ectx.state.pos.y < this.bot.entity.position.y
      // console.log('should sneak?', ret)
      return true

  }

  private shouldJumpNow (): boolean {
    const controls = ControlStateHandler.COPY_BOT(this.bot)
      .set('forward', true)
      .set('sprint', true)
      .set('back', false)
      .set('left', false)
      .set('right', false)
      .set('jump', false)
      .set('sneak', false)

    const ectx = this.simForward({ ticks: 1, controls })
    const nextOnGround = ectx.state.onGround
    const nextVertCollision = ectx.state.isCollidedHorizontally

    console.log(
      '[neo jump check]',
      'pos=', this.bot.entity.position,
      'nextOnGround=', nextOnGround,
      'nextVertCollision=', nextVertCollision,
      'nextPos=', ectx.state.pos
    )

    return !nextOnGround
  }

  private probeAlignYaw (yaw: number, maxTicks = 10): NeoYawProbeResult {
    const controls = ControlStateHandler.COPY_BOT(this.bot)
      .set('forward', true)
      .set('sprint', true)
      .set('back', false)
      .set('left', false)
      .set('right', false)
      .set('jump', false)
      .set('sneak', false)

    const prevYaw = this.bot.entity.yaw
    const prevPitch = this.bot.entity.pitch
    this.bot.entity.yaw = yaw
    this.bot.entity.pitch = 0

    let result: NeoYawProbeResult = { safe: false, reason: 'no-escape' }
    const ectx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
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

    this.bot.entity.yaw = prevYaw
    this.bot.entity.pitch = prevPitch
    return result
  }

  private findIdealAlignYaw (thisMove: Move): number {
    const directYaw = getNeoDirectYaw(this.bot.entity.position, thisMove.exitPos)
    return findSafeYaw(directYaw, (yaw) => this.probeAlignYaw(yaw, 12), {
      maxDelta: Math.PI,
      probeStep: Math.PI / 60,
      directionHint: getNeoYawSearchDirection(thisMove)
    })
  }

  private lookAtBackVertex (thisMove: Move): void {
    if (this.approachTarget == null) return

    this.backVertex ??= getNeoGoalBackVertex(thisMove, this.approachTarget)
    const target = this.backVertex
    const eye = this.bot.entity.position.offset(0, 1.62, 0)
    const delta = target.minus(eye)
    const yaw = Math.atan2(-delta.x, -delta.z)
    const pitch = Math.atan2(delta.y, Math.sqrt(delta.x * delta.x + delta.z * delta.z))

    this.bot.entity.yaw = yaw
    this.bot.entity.pitch = pitch
  }

  align(thisMove: Move): boolean {
    const alignTarget = getNeoAlignmentTarget(thisMove)
    this.approachTarget ??= alignTarget



    this.bot.clearControlStates()
    if (!this.isPositionAligned(alignTarget)) {
      botSmartMovement(this.bot, alignTarget, false, 0.001)
      botStrafeMovement(this.bot, alignTarget, false, 0.001)
      const sneak = this.shouldSneak()
      this.bot.setControlState('sneak', sneak)
      return false
    }


    const sneak = this.shouldSneak()
    this.bot.setControlState('sneak', sneak)
    const idealYaw = this.findIdealAlignYaw(thisMove)

    this.bot.entity.yaw = idealYaw
    this.bot.entity.pitch = 0
    return true
  }

  async performInit(thisMove: Move, _currentIndex: number, _path: Move[]): Promise<void> {
    // const sneak = this.shouldSneak()
    this.bot.setControlState('sneak', true)
    this.phase = 'approach'
    this.airTicks = 0
    this.approachTarget  = getNeoAlignmentTarget(thisMove)
    this.backVertex = null
  }

  performPerTick(thisMove: Move, _tickCount: number, _currentIndex: number, _path: Move[]): boolean {
    // const sneak = this.shouldSneak()

    this.bot.setControlState('sneak', true)
    // // this.bot.setControlState('forward', true)
    // // this.bot.setControlState('sprint', true)


    // // this.bot.setControlState('sneak', false)

    // if (this.phase === 'approach') {
    //   if (this.shouldJumpNow()) {
    //     this.phase = 'jump'
    //     this.bot.setControlState('jump', true)
    //     console.log('[neo phase] jump triggered')
    //   }
    //   return false
    // }

    // if (this.phase === 'jump') {
    //   this.bot.setControlState('jump', true)
    //   if (!this.bot.entity.onGround) {
    //     this.phase = 'air'
    //     this.airTicks = 0
    //     console.log('[neo phase] entered air')
    //   }
    //   return false
    // }

    // if (this.phase === 'air') {
    //   this.airTicks++
    //   this.bot.setControlState('jump', false)
    //   if (this.airTicks >= 1) {
    //     this.lookAtBackVertex(thisMove)
    //     this.phase = 'look'
    //     console.log('[neo phase] look at back vertex', this.backVertex)
    //   }
    //   return false
    // }

    // if (this.phase === 'look') {
    //   this.lookAtBackVertex(thisMove)
    //   return false
    // }

    return true
  }
}

export { NeoExecutor as ParkourForwardExecutor }
