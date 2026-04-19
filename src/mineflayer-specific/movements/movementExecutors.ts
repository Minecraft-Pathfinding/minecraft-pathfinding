import { Vec3 } from 'vec3'
import * as goals from '../goals'
import { Move } from '../move'
import { CancelError } from '../exceptions'
import { BlockInfo } from '../world/cacheWorld'
import { BreakHandler, PlaceHandler } from './interactionUtils'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { CompleteOpts, InitAlignOpts, MovementExecutor } from './movementExecutor'
import { JumpCalculator, ParkourJumpHelper, getUnderlyingBBs, leavingBlockLevel, stateLookAt } from './movementUtils'
import { ControlStateHandler, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { printBotControls } from '../../utils'
import type { Block, RayType } from '../../types'
import { botSmartMovement, botStrafeMovement } from './controls'

const debug = require('debug')
const logIdle = debug('minecraft-pathfinding:movementExecutors:Idle')
const logFwd = debug('minecraft-pathfinding:movementExecutors:NewForward')
const logOldFwd = debug('minecraft-pathfinding:movementExecutors:Forward')
const logJump = debug('minecraft-pathfinding:movementExecutors:ForwardJump')
const logDrop = debug('minecraft-pathfinding:movementExecutors:ForwardDropDown')
const logDown = debug('minecraft-pathfinding:movementExecutors:StraightDown')
const logUp = debug('minecraft-pathfinding:movementExecutors:StraightUp')
const logParkour = debug('minecraft-pathfinding:movementExecutors:Parkour')


export class IdleMovementExecutor extends MovementExecutor {
  provideMovements(start: Move, storage: Move[]): void { }
  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    logIdle('performInit called')
  }
  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    return true
  }
}


export class NewForwardExecutor extends MovementExecutor {

  protected isComplete(startMove: Move, endMove?: Move, opts?: CompleteOpts): boolean {
    return super.isComplete(startMove, endMove, { ticks: 2 })
  }

  private async faceForward(): Promise<boolean> {
    // console.log('called faceForward!')
    if (this.doWaterLogic()) return true
    const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0)
    const placementVecs = this.toPlace().map((p) => AABB.fromBlock(p.vec))
    const near = placementVecs.some((p) => p.distanceToVec(eyePos) < PlaceHandler.reach + 2)

    // console.log('this.currentMove?.toPlace.length === 0 || !near', this.currentMove?.toPlace.length === 0 || !near)
    // console.log(this.currentMove.toPlace.length, this.toPlace().length, placementVecs.map((p) => p.distanceToVec(eyePos)), near, this.currentMove?.toPlace.length === 0 && !near)
    return this.currentMove?.toPlace.length === 0 || !near
  }

  override async align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if (this.doWaterLogic()) {
      await super.align(thisMove, tickCount, goal)
      // this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y)
    }

    const faceForward = await this.faceForward()
    let target
    if (faceForward) {
      target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      target = offset
    }

    return await this.landAlign(thisMove, tickCount, goal)
  }

  async landAlign(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    const faceForward = await this.faceForward()

    const opts: InitAlignOpts = { enterExitInterp: true }

    // need to shift positional data downward if in air.
    if (!this.bot.entity.onGround || this.bot.getControlState('jump')) {
      opts.customBB = AABBUtils.getEntityAABB(this.bot.entity)
      opts.customBB.expand(0, -1.3, 0) // generous check for alignment if jumping.
    }

    const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
    if (faceForward) {
      // await this.postInitAlignToPath(thisMove)
      // void this.lookAt(target);
      this.bot.setControlState('forward', true)
      if (this.bot.food <= 6) this.bot.setControlState('sprint', false)
      else this.bot.setControlState('sprint', true)

    } else {
      const offset = this.bot.entity.position.minus(target).plus(this.bot.entity.position)
      // await this.postInitAlignToPath(thisMove, { lookAt: offset })
      void this.lookAt(offset)
      this.bot.setControlState('forward', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('back', true)
    }

    // return this.isComplete(thisMove, thisMove, {entry: true})
    // console.log("align", this.bot.entity.position, thisMove.exitPos, this.bot.entity.position.xzDistanceTo(thisMove.exitPos), this.bot.entity.onGround)
    // return this.bot.entity.position.distanceTo(thisMove.entryPos) < 0.2 && this.bot.entity.onGround;

    return this.isInitAligned(thisMove, target, opts)
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // console.log('ForwardMove', thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length)

    this.bot.clearControlStates()

    const faceForward = await this.faceForward()

    if (faceForward) {
      await this.postInitAlignToPath(thisMove)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      // console.log('here!', thisMove.exitPos, this.bot.entity.position, offset)
      await this.postInitAlignToPath(thisMove, { lookAt: offset })
    }
  }

  private doWaterLogic(): boolean {
    if ((this.bot.entity as any).isInWater as boolean) return true

    if (this.bot.entity.onGround) return false

    const bl = this.getBlockInfo(this.bot.entity.position, 0, -0.6, 0)
    return bl.liquid
  }

  // TODO: clean this up.
  private canJump(thisMove: Move, currentIndex: number, path: Move[]): boolean {
    if (this.doWaterLogic()) {
      if (this.bot.entity.position.y < thisMove.exitPos.y) {
        return true
      } else {
        return false
      }
    }

    if (!this.settings.allowJumpSprint) return false
    if (!this.bot.entity.onGround) return false
    if (this.toBreakLen() > 0 || this.toPlaceLen() > 0) return false

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.14) return false

    // console.log("hey");
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    this.sim.simulateUntil(
      (state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally,
      () => { },
      (state) => {
        state.control.set('jump', true)
      },
      ctx,
      this.world,
      20
    )

    if (ctx.state.pos.y > thisMove.entryPos.y) return false

    const nextPos = path[++currentIndex]
    let offset = 0.4
    if (currentIndex < path.length) {
      if (nextPos.toPlace.length > 0 || nextPos.toBreak.length > 0) offset = 0.8

      // handle potential collisions here.
      if (nextPos.exitPos.y > thisMove.entryPos.y) {
        offset = 0.8
      }

      if (nextPos.exitPos.y - thisMove.entryPos.y > 2) {
        offset = 0.8
      }
    }

    if (thisMove.entryPos.xzDistanceTo(ctx.state.pos) > thisMove.entryPos.xzDistanceTo(thisMove.exitPos) - offset) {
      return false
    }

    if (ctx.state.isCollidedHorizontally) return false
    return ctx.state.onGround
  }

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      return false
    } else if (this.cI == null) {
      const test = await this.interactNeeded(5)
      if (test != null) {
        // console.log('performing interaction')
        void this.performInteraction(test)
        return false
      }
    }

    // if (tickCount > 160) throw new CancelError("ForwardMove: tickCount > 160");

    if (
      (!this.bot.entity.onGround &&
        !this.bot.getControlState('jump') &&
        !this.doWaterLogic() &&
        this.canJump(thisMove, currentIndex, path)) ||
      this.bot.entity.position.y < Math.round(thisMove.entryPos.y) - 1
    ) {
      // console.log(this.bot.entity.position, thisMove.entryPos)
      throw new CancelError(`ForwardMove: not on ground. Target pos: ${thisMove.exitPos}, us: ${this.bot.entity.position}`)
    }

    const faceForward = await this.faceForward()

    if (faceForward) {
      const jump = this.canJump(thisMove, currentIndex, path)
      this.bot.setControlState('jump', jump)
      void this.postInitAlignToPath(thisMove)
      return this.isComplete(thisMove)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      void this.postInitAlignToPath(thisMove, { lookAt: offset })
      return this.isComplete(thisMove)
    }
  }
}

export class ForwardExecutor extends MovementExecutor {
  private currentIndex!: number

  private getRemainingPlacements(): PlaceHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot))
  }

  private async faceForward(): Promise<boolean> {
    const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0)
    const remaining = this.getRemainingPlacements()

    if (remaining.length === 0) return true

    const placementVecs = remaining.map((p) => AABB.fromBlock(p.vec))
    const near = placementVecs.some((p) => p.distanceToVec(eyePos) < PlaceHandler.reach + 2)

    return !near
  }

  async align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    const faceFwd = await this.faceForward()

    const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
    if (faceFwd) {
      void this.postInitAlignToPath(thisMove, { lookAtYaw: target })
    } else {
      const offset = this.bot.entity.position.minus(target).plus(this.bot.entity.position)
      void this.postInitAlignToPath(thisMove, { lookAt: offset })
    }

    const off0 = thisMove.exitPos.minus(this.bot.entity.position)
    const off1 = thisMove.exitPos.minus(target)

    off0.translate(0, -off0.y, 0)
    off1.translate(0, -off1.y, 0)

    const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95
    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })

    const bb1bl = this.getBlockInfo(target, 0, -1, 0)
    const bb1 = bb1bl.getBBs()
    if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position))
    const bb1physical = bb1bl.physical || bb1bl.liquid

    const bb2bl = thisMove.moveType.getBlockInfo(thisMove.exitPos.floored(), 0, -1, 0)
    const bb2 = bb2bl.getBBs()
    if (bb2.length === 0) bb2.push(AABB.fromBlock(bb1bl.position))
    const bb2physical = bb2bl.physical || bb2bl.liquid

    if ((bb1.some((b) => b.collides(bb0)) && bb1physical) || (bb2.some((b) => b.collides(bb0)) && bb2physical)) {
      if (similarDirection) return true
      else if (this.bot.entity.position.xzDistanceTo(target) < 0.2) return this.isLookingAtYaw(target)
    }

    return false
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.bot.clearControlStates()
    this.currentIndex = 0

    const faceFwd = await this.faceForward()

    if (faceFwd) {
      await this.postInitAlignToPath(thisMove)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      await this.postInitAlignToPath(thisMove, { lookAt: offset, sprint: true })
    }
  }

  private async identMove(thisMove: Move, currentIndex: number, path: Move[]): Promise<number> {
    let lastMove = thisMove
    let nextMove = path[++currentIndex]

    if (nextMove === undefined) return --currentIndex

    const orgY = thisMove.entryPos.y
    const width = 0.61
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width, height: 1.8 })
    const verts = bb.expand(0, -1, 0).toVertices()

    const verts1 = [
      this.bot.entity.position.offset(-width / 2, -0.6, -width / 2),
      this.bot.entity.position.offset(width / 2, -0.6, -width / 2),
      this.bot.entity.position.offset(width / 2, -0.6, width / 2),
      this.bot.entity.position.offset(-width / 2, -0.6, width / 2)
    ]

    const pos0 = this.bot.entity.position

    while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
      if (nextMove === undefined) return --currentIndex
      for (const vert of verts) {
        const offset = vert.minus(this.bot.entity.position)
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0)
        const test = test1.plus(offset)
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 1
        const raycast0 = (await this.bot.world.raycast(
          vert,
          test.minus(vert).normalize().scale(0.5),
          dist * 2
        )) as unknown as RayType | null
        const valid0 = raycast0 == null || raycast0.position.distanceTo(pos0) > dist
        if (!valid0) {
          return --currentIndex
        }
      }

      let counter = verts1.length
      for (const vert of verts1) {
        const offset = vert.minus(this.bot.entity.position)
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0)
        const test = test1.plus(offset)
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 1
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize().scale(0.5), dist * 2, (block) =>
          BlockInfo.replaceables.has(block.type)
        )) as unknown as RayType | null

        const valid0 = raycast0 == null || raycast0.position.distanceTo(pos0) > dist
        if (!valid0) counter--
      }

      if (counter === 0) return --currentIndex
      if (++currentIndex >= path.length) return --currentIndex

      lastMove = nextMove
      nextMove = path[currentIndex]
    }
    return --currentIndex
  }

  private canJump(thisMove: Move, currentIndex: number, path: Move[]): boolean {
    if (!this.settings.allowJumpSprint) return false
    if (!this.bot.entity.onGround) return false
    if (this.toBreakLen() > 0 || this.toPlaceLen() > 0) return false

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.14) return false

    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    this.sim.simulateUntil(
      (state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally,
      () => { },
      (state) => {
        state.control.set('jump', true)
      },
      ctx,
      this.world,
      20
    )

    if (ctx.state.pos.y > thisMove.entryPos.y) return false

    const nextPos = path[++currentIndex]
    let offset = 0.3
    if (currentIndex < path.length) {
      if (nextPos.toPlace.length > 0 || nextPos.toBreak.length > 0) offset = 0.8
      if (nextPos.exitPos.y > thisMove.entryPos.y) offset = 0.8
    }

    if (thisMove.entryPos.xzDistanceTo(ctx.state.pos) > thisMove.entryPos.xzDistanceTo(thisMove.exitPos) - offset) {
      return false
    }

    if (ctx.state.isCollidedHorizontally) return false
    return ctx.state.onGround
  }

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      this.bot.clearControlStates()
      this.bot.setControlState('sneak', true)
      return false
    } else if (this.cI == null) {
      const remaining = this.getRemainingPlacements()

      if (remaining.length > 0) {
        let batchExecuted = false

        for (const p of remaining) {
          const info = await p.performInfo(this.bot, 5)

          if (info.ticks === 0) {
            logOldFwd(`Block ${p.vec} is visible NOW. Rapid-placing.`)
            this.bot.clearControlStates()
            this.bot.setControlState('sneak', true)

            await this.performInteraction(p, { info, predictBlock: true, noAwait: true }) // fire and forget, we just want to trigger the placement and get out of the way  
            batchExecuted = true
          } else if (info.ticks < Infinity) {
            if (!batchExecuted) {
              logOldFwd(`Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`)
              void this.performInteraction(p, { info, predictBlock: true })
            }
            break
          } else {
            break
          }
        }

        if (batchExecuted) return false
      }
    }

    if (
      !this.bot.entity.onGround &&
      this.bot.entity.position.y < thisMove.entryPos.y &&
      !this.bot.getControlState('jump')
    ) {
      throw new CancelError('ForwardMove: not on ground')
    }

    const faceFwd = await this.faceForward()

    if (faceFwd) {
      // User's original disabled identMove logic block
      // eslint-disable-next-line no-constant-condition
      if (false) {
        this.bot.setControlState('back', false)
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
        const idx = await this.identMove(thisMove, currentIndex, path)
        this.currentIndex = Math.max(idx, this.currentIndex)
        const nextMove = path[this.currentIndex]
        if (currentIndex !== this.currentIndex && nextMove !== undefined) {
          void this.postInitAlignToPath(thisMove, nextMove)
          if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex
        } else {
          void this.postInitAlignToPath(thisMove)
          return this.isComplete(thisMove)
        }
      } else {
        const jump = this.canJump(thisMove, currentIndex, path)
        this.bot.setControlState('jump', jump)
        void this.postInitAlignToPath(thisMove)
        return this.isComplete(thisMove)
      }
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      void this.postInitAlignToPath(thisMove, { lookAt: offset })
      this.bot.setControlState('forward', false)
      this.bot.setControlState('back', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true) // Anchor while moving backwards
      return this.isComplete(thisMove)
    }

    return false
  }
}

export class ForwardJumpExecutor extends MovementExecutor {
  jumpInfo!: ReturnType<JumpCalculator['findJumpPoint']>

  private readonly shitter: JumpCalculator = new JumpCalculator(this.sim, this.bot, this.world, this.simCtx)
  private flag = false

  private getRemainingPlacements(): PlaceHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot))
  }

  protected isComplete(startMove: Move, endMove?: Move): boolean {
    return super.isComplete(startMove, endMove, { ticks: 0 })
  }

  override async align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y)
      return await super.align(thisMove, tickCount, goal)
    }

    return await super.align(thisMove, tickCount, goal)
  }

  align1(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })

    if (this.flag) {
      void this.lookAt(thisMove.entryPos.floored().offset(0.5, 0, 0.5))
      this.bot.setControlState('forward', true)
      this.bot.setControlState('back', false)
      this.bot.setControlState('sprint', true)

      const bl = this.getBlockInfo(thisMove.entryPos.floored(), 0, -1, 0)
      const bigBBs = bl.getBBs().map((b) => b.extend(0, 10, 0))

      return bigBBs.some((b) => b.contains(bb)) && this.bot.entity.onGround
    } else if (this.bot.entity.onGround) {
      if (thisMove.toPlace.length === 0) {
        this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos)
        if (this.jumpInfo === null) {
          this.flag = true
          return false
        }
      }
      return true
    }
    return false
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.flag = false
    this.bot.clearControlStates()

    logJump(`performInit`)

    if (thisMove.toBreak.length > 0) {
      await this.bot.clearControlStates()
      for (const breakH of this.toBreak()) {
        const start = performance.now()
        await this.performInteraction(breakH)
        logJump(`[${performance.now() - start}ms] break block ${breakH.blockInfo.position} completed.`)
      }
    }

    this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos)

    if (this.jumpInfo === null) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('jump', true)
      this.bot.setControlState('sprint', true)
    }
  }

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      // NOTE: During a jump, we DO NOT want to clear control states or set sneak, 
      // otherwise the bot will lose its momentum and fall straight down!
      return false
    }

    if (this.cI == null) {
      const remaining = this.getRemainingPlacements()

      if (remaining.length > 0) {
        let batchExecuted = false

        for (const p of remaining) {
          const info = await p.performInfo(this.bot, 5)

          if (info.ticks === 0) {
            logJump(`Block ${p.vec} is visible NOW. Rapid-placing mid-air.`)
            // Maintain jump momentum, do not clear controls here

            await this.performInteraction(p, { info, predictBlock: true, noAwait: true }) // fire and forget, we just want to trigger the placement and get out of the way
            batchExecuted = true
          } else if (info.ticks < Infinity) {
            if (!batchExecuted) {
              logJump(`Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`)
              void this.performInteraction(p, { info, predictBlock: true })
            }
            break
          } else {
            break
          }
        }

        // Let the movement physics tick process even if we fired a placement packet
      }
    }

    void this.postInitAlignToPath(thisMove)

    if (this.jumpInfo != null) {
      if (tickCount >= this.jumpInfo.backTick) {
        this.bot.setControlState('forward', false)
        this.bot.setControlState('back', true)
      }

      if (tickCount >= this.jumpInfo.sprintTick) {
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
      } else {
        this.bot.setControlState('sprint', false)
        this.bot.setControlState('forward', false)
      }
      if (tickCount >= this.jumpInfo.jumpTick) {
        this.bot.setControlState('jump', this.bot.entity.position.y - thisMove.entryPos.y < 0.8)
      } else {
        this.bot.setControlState('jump', false)
      }
    }

    if (this.bot.entity.position.y - thisMove.exitPos.y < -1.25) throw new CancelError('ForwardJumpMove: too low (1)')

    if (tickCount > (this.jumpInfo?.jumpTick ?? 0) && this.bot.entity.onGround) {
      this.bot.setControlState('jump', false)
      this.bot.setControlState('sprint', true)

      if (this.bot.entity.position.y - thisMove.exitPos.y < -0.25) {
        throw new CancelError(`ForwardJumpMove: too low (2) ${this.bot.entity.position.y} ${thisMove.exitPos.y}`)
      }
    }

    return this.isComplete(thisMove)
  }
}

export class NewForwardJumpExecutor extends ForwardJumpExecutor {
  override async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y)
      void this.postInitAlignToPath(thisMove)
      return this.isComplete(thisMove)
    } else {
      return await super.performPerTick(thisMove, tickCount, currentIndex, path)
    }
  }
}

export class ForwardDropDownExecutor extends MovementExecutor {
  private currentIndex!: number

  private getRemainingPlacements(): PlaceHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot))
  }

  private getRemainingBreaks(): BreakHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toBreak.filter(b => b.needToPerform(this.bot))
  }

  override async align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      return await super.align(thisMove, tickCount, goal)
    }
    return await super.align(thisMove, tickCount, goal)
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.currentIndex = currentIndex
    await this.postInitAlignToPath(thisMove)
  }

  private identMove(thisMove: Move, currentIndex: number, path: Move[]): number {
    let lastMove = thisMove
    let nextMove = path[++currentIndex]

    if (nextMove === undefined) return --currentIndex

    const pos = this.bot.entity.position

    while (
      lastMove.entryPos.xzDistanceTo(pos) > lastMove.entryPos.xzDistanceTo(lastMove.exitPos) &&
      lastMove.entryPos.y > nextMove.exitPos.y &&
      nextMove.moveType.toPlaceLen() === 0
    ) {
      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }

    if (lastMove.entryPos.y === nextMove.exitPos.y) currentIndex++

    return --currentIndex
  }

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot, 0))) {
      // If we are locked by an interaction, freeze so we don't accidentally fall early.
      this.bot.clearControlStates()
      return false
    }

    if (this.cI == null) {
      // 1. Process Sequential Breaks (Must wait for server digging)
      const remainingBreaks = this.getRemainingBreaks()
      if (remainingBreaks.length > 0) {
        const breakTarget = remainingBreaks[0]
        logDrop(`[ForwardDrop] Block ${breakTarget.vec} needs breaking. Triggering background interaction.`)
        this.bot.clearControlStates()
        void this.performInteraction(breakTarget)
        return false
      }

      // 2. Process Concurrent Rapid-Placements
      const remainingPlaces = this.getRemainingPlacements()
      if (remainingPlaces.length > 0) {
        let batchExecuted = false

        for (const p of remainingPlaces) {
          const info = await p.performInfo(this.bot, 5)

          if (info.ticks === 0) {
            logDrop(`[ForwardDrop] Block ${p.vec} is visible NOW. Rapid-placing.`)
            this.bot.clearControlStates()

            await this.performInteraction(p, { info, predictBlock: true, noAwait: true }) // fire and forget, we just want to trigger the placement and get out of the way
            batchExecuted = true
          } else if (info.ticks < Infinity) {
            if (!batchExecuted) {
              logDrop(`[ForwardDrop] Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`)
              void this.performInteraction(p, { info, predictBlock: true })
            }
            break
          } else {
            break
          }
        }

        if (batchExecuted) return false
      }
    }

    // eslint-disable-next-line no-constant-condition
    if (false) {
      const idx = this.identMove(thisMove, currentIndex, path)
      this.currentIndex = Math.max(idx, this.currentIndex)
      const nextMove = path[this.currentIndex]

      if (currentIndex !== this.currentIndex && nextMove !== undefined) {
        void this.postInitAlignToPath(thisMove, nextMove)
        if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex
      } else {
        void this.postInitAlignToPath(thisMove, thisMove)
        if (this.isComplete(thisMove, thisMove)) return true
      }
    } else {
      if (currentIndex < path.length) void this.postInitAlignToPath(thisMove)
      else void this.postInitAlignToPath(thisMove)

      if (this.isComplete(thisMove)) return true
    }

    return false
  }

  getLandingBlock(node: Move, dir: Vec3): BlockInfo | null {
    let blockLand = this.getBlockInfo(node, dir.x, -2, dir.z)
    while (blockLand.position.y > (this.bot.game as any).minY) {
      if (blockLand.liquid && blockLand.walkthrough) return blockLand
      if (blockLand.physical) {
        if (node.y - blockLand.position.y <= this.settings.maxDropDown) return this.getBlockInfo(blockLand.position, 0, 1, 0)
        return null
      }
      if (!blockLand.walkthrough) return null
      blockLand = this.getBlockInfo(blockLand.position, 0, -1, 0)
    }
    return null
  }
}

export class NewForwardDropDownExecutor extends ForwardDropDownExecutor {
  override async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if ((this.bot.entity as any).isInWater as boolean) {
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y)
      return this.isComplete(thisMove)
    } else {
      return await super.performPerTick(thisMove, tickCount, currentIndex, path)
    }
  }
}

export class StraightDownExecutor extends MovementExecutor {
  private getRemainingBreaks(): BreakHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toBreak.filter(b => b.needToPerform(this.bot))
  }

  align(thisMove: Move): boolean {
    this.bot.clearControlStates()
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && xzVel.norm() < 0.1) {
      return true
    }

    void this.lookAt(thisMove.exitPos)

    // provided that velocity is not pointing towards goal OR distance to goal is greater than 0.5
    // adjust as quickly as possible to goal.
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0 || this.bot.entity.position.distanceTo(thisMove.exitPos) > 0.5) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('sneak', false)

      // if velocity is already heading towards the goal, slow down.
    } else {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true)
    }
    return false
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // Initialization logic cleared; breaks are dynamically handled in performPerTick
  }

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot, 0))) {
      this.bot.clearControlStates()
      return false
    }

    if (this.cI == null) {
      const remainingBreaks = this.getRemainingBreaks()
      if (remainingBreaks.length > 0) {
        const breakTarget = remainingBreaks[0]
        logDown(`[StraightDown] Block ${breakTarget.vec} needs breaking. Triggering background interaction.`)
        this.bot.clearControlStates()
        void this.performInteraction(breakTarget)
        return false
      }
    }

    if ((this.bot.entity as any).isInWater as boolean) {
      return tickCount > 0 && this.bot.entity.position.y <= thisMove.exitPos.y
    }

    if (this.bot.entity.position.y < thisMove.exitPos.y) throw new CancelError('StraightDown: too low')

    return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y === thisMove.exitPos.y
  }
}

export class StraightUpExecutor extends MovementExecutor {
  private static readonly CENTER_EPS = 0.2
  private static readonly FAR_CENTER_DIST = 0.45
  private static readonly BAD_VEL_DOT = 0.25

  isAlreadyCompleted(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    return this.bot.entity.position.y >= thisMove.exitPos.y
  }

  private _getEntryCenter(thisMove: Move): Vec3 {
    return thisMove.entryPos.floored().offset(0.5, 0, 0.5)
  }

  private _getExitCenter(thisMove: Move): Vec3 {
    return thisMove.exitPos.floored().offset(0.5, 0, 0.5)
  }

  private _getHorizontalOffsetToCenter(center: Vec3): Vec3 {
    return center.minus(this.bot.entity.position).offset(0, -(center.y - this.bot.entity.position.y), 0)
  }

  private _getHorizontalVelocity(): Vec3 {
    return this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
  }

  private _isMostlyCentered(thisMove: Move): boolean {
    const center = this._getEntryCenter(thisMove)
    return this.bot.entity.position.xzDistanceTo(center) <= StraightUpExecutor.CENTER_EPS
  }

  private _clearLateralControls(): void {
    this.bot.setControlState('forward', false)
    this.bot.setControlState('back', false)
    this.bot.setControlState('left', false)
    this.bot.setControlState('right', false)
    this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', false)
  }

  private _faceCenterYaw(thisMove: Move): void {
    const center = this._getEntryCenter(thisMove)
    const pos = this.bot.entity.position
    const yaw = Math.atan2(-(center.x - pos.x), -(center.z - pos.z))
    this.bot.entity.yaw = yaw
  }

  /**
   * Ground centering logic:
   * - if we are already mostly centered, do not over-correct
   * - if velocity is bad or we are far from center, move assertively
   * - otherwise creep in more gently
   */
  private _applyGroundCentering(thisMove: Move): boolean {
    const center = this._getEntryCenter(thisMove)
    const offset = this._getHorizontalOffsetToCenter(center)
    const dist = offset.norm()

    this._faceCenterYaw(thisMove)

    if (dist <= StraightUpExecutor.CENTER_EPS) {
      this._clearLateralControls()
      return true
    }

    const xzVel = this._getHorizontalVelocity()
    const velNorm = xzVel.norm()
    const dirToCenter = dist > 1e-6 ? offset.normalize() : new Vec3(0, 0, 0)
    const velDir = velNorm > 1e-6 ? xzVel.normalize() : null
    const velDot = velDir != null ? velDir.dot(dirToCenter) : 1

    const shouldCorrectHard =
      dist > StraightUpExecutor.FAR_CENTER_DIST ||
      velNorm < 0.03 ||
      velDot < StraightUpExecutor.BAD_VEL_DOT

    this.bot.setControlState('forward', true)
    this.bot.setControlState('back', false)
    this.bot.setControlState('left', false)
    this.bot.setControlState('right', false)

    if (shouldCorrectHard) {
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('sneak', false)
    } else {
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true)
    }

    return false
  }

  /**
   * While rising / airborne / in water:
   * - keep jump held
   * - avoid additional complicated steering
   * - if reasonably centered, just keep going straight up
   */
  private _applyVerticalAscentControls(thisMove: Move): boolean {
    this.bot.setControlState('jump', true)

    if (this._isMostlyCentered(thisMove)) {
      this._clearLateralControls()
      return true
    }

    this.bot.setControlState('forward', true)
    this.bot.setControlState('back', false)
    this.bot.setControlState('left', false)
    this.bot.setControlState('right', false)
    this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', false)

    this._faceCenterYaw(thisMove)
    return false
  }

  override async align(thisMove: Move): Promise<boolean> {
    const inWater = (this.bot.entity as any).isInWater as boolean

    if (!this.bot.entity.onGround || inWater) {
      return this._applyVerticalAscentControls(thisMove)
    }

    return this._applyGroundCentering(thisMove)
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.bot.clearControlStates()

    for (const breakH of this.toBreak()) {
      await this.lookAt(breakH.vec.offset(0.5, 0.5, 0.5))
      await this.performInteraction(breakH)
    }

    if (thisMove.toPlace.length > 1) {
      throw new CancelError('StraightUp: toPlace.length > 1')
    }

    const place = thisMove.toPlace[0]
    if (place != null) {
      await this.lookAt(place.vec.offset(0.5, 0.5, 0.5))
      this.bot.setControlState('jump', true)
      await this.performInteraction(place)
    }
  }

  performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if (this.bot.entity.position.y < thisMove.entryPos.y) {
      throw new CancelError('StraightUp: too low')
    }

    const inWater = (this.bot.entity as any).isInWater as boolean

    if (!this.bot.entity.onGround || inWater) {
      this._applyVerticalAscentControls(thisMove)
    } else {
      this._applyGroundCentering(thisMove)
    }

    this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y)

    if (inWater) {
      return tickCount > 0 && this.bot.entity.position.y >= thisMove.exitPos.y
    }

    return tickCount > 0 &&
      this.bot.entity.onGround &&
      this.bot.entity.position.y >= thisMove.exitPos.y
  }
}

export class ParkourForwardExecutor extends MovementExecutor {
  private readonly shitterTwo: ParkourJumpHelper = new ParkourJumpHelper(this.bot, this.world)

  private executing = false
  private lockedYaw: number | null = null
  private backingUp = false
  private backupSettling = false
  private backupAttempted = false
  private backupTarget: Vec3 | null = null
  private _lookAtInFlight: Promise<void> | null = null
  private _pendingLookTarget: Vec3 | null = null

  protected static readonly APPROACH_YAW_EPS: number = 0.16 // ~9.2 deg — generous for cardinal jumps

  protected isComplete(startMove: Move, endMove?: Move, opts: CompleteOpts = {}): boolean {
    const ret = super.isComplete(startMove, endMove, opts)
    return ret;
  }

  private _debugLog(...args: any[]): void {
    logParkour(...args)
  }

  private _lockCurrentYaw(targetYaw: number): void {
    this.lockedYaw = targetYaw
  }

  private _clearLockedYaw(): void {
    this.lockedYaw = null
  }

  private _applyLockedYaw(): void {

    if (this.lockedYaw != null) {
      this.bot.entity.yaw = this.lockedYaw
    }
  }

  private _applySmartControls(target: Vec3, jump: boolean): void {
    this._applyLockedYaw()
    botSmartMovement(this.bot, target, true)
    botStrafeMovement(this.bot, target, true)
    this.bot.setControlState('jump', jump)
    this.bot.setControlState('sneak', false)
  }

  private _queueLookAtSync(target: Vec3): Promise<void> {

    this._pendingLookTarget = target.offset(0, this.bot.entity.position.y - target.y, 0)

    if (this._lookAtInFlight != null) {
      return this._lookAtInFlight
    }

    this._lookAtInFlight = (async () => {
      try {
        while (this._pendingLookTarget != null) {
          const nextTarget = this._pendingLookTarget
          this._pendingLookTarget = null
          await this.lookAt(nextTarget, true)
        }
      } finally {
        this._lookAtInFlight = null
      }
    })()

    return this._lookAtInFlight
  }

  private _clearBackupState(): void {
    this.backingUp = false
    this.backupSettling = false
    this.backupTarget = null
  }

  private _getTargetBlock(thisMove: Move): Vec3 {
    return thisMove.exitPos.offset(0, -1, 0)
  }

  private _getTargetEyeVec(target: Vec3): Vec3 {
    return this.shitterTwo.findGoalVertex(AABB.fromBlockPos(target))
  }

  private _getUnderlyingBbs(thisMove: Move): AABB[] {
    const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6)
    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos.offset(0, -1, 0)))
    }
    return bbs
  }

  private _getBackupTarget(thisMove: Move): Vec3 | null {
    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(target)

    const pos = thisMove.entryPos
    // if (!this.bot.entity.onGround) {
    //   pos.translate(0, (pos.floored().y - pos.y), 0)
    //   pos.y = Math.round(pos.y)
    // }

    const bbs = getUnderlyingBBs(this.bot.pathfinder.world, pos, 0.6);
    const backupTarget = this.shitterTwo.findBackupVertex(bbs, targetEyeVec, pos)
    this._debugLog(
      'backup target check:',
      'pos', pos,
      'target:', target,
      'eye:', targetEyeVec,
      'result:', backupTarget,
      'bbs', bbs
    )
    return backupTarget
  }

  private _shouldSneakDuringBackup(thisMove: Move, target: Vec3): boolean {
    const entryBB = AABB.fromBlockPos(thisMove.entryPos)
    const botPos = this.bot.entity.position

    if (botPos.xzDistanceTo(target) < 0.1) return true;


    const controls = ControlStateHandler.COPY_BOT(this.bot).set('sneak', false).set('jump', false)
    const ectx = this.simForward({ticks: 2, controls})
    // console.log(ectx.state.pos, ectx.state.control, ectx.state.pos.y, this.bot.entity.position.y, !ectx.state.onGround)
    return  ectx.state.pos.y < this.bot.entity.position.y && !ectx.state.onGround


  }

  private _applyBackupControls(thisMove: Move, target: Vec3): void {
    this._lockCurrentYaw(this._desiredYawTo(target))
    void this._queueLookAtSync(target)
    this._applySmartControls(target, false)
    // console.log('should sneak', this._shouldSneakDuringBackup(thisMove, target))
    this.bot.setControlState('sneak', this._shouldSneakDuringBackup(thisMove, target))
  }

  private _startBackup(thisMove: Move): boolean {
    this.backupTarget ??= this._getBackupTarget(thisMove)
    if (this.backupTarget == null) {
      this._debugLog('backup start failed: no backup target')
      return false
    }

    this.backingUp = true
    this.backupAttempted = true
    this._debugLog('backup start:', this.backupTarget)
    this._applyBackupControls(thisMove, this.backupTarget)
    return true
  }

  private _advanceBackup(thisMove: Move): 'backing' | 'recheck' | 'jump' | 'failed' {
    this.backupTarget ??= this._getBackupTarget(thisMove)
    if (this.backupTarget == null) {
      // this._debugLog('backup advance failed: no backup target')
      return 'failed'
    }

    const jumpState = this._getJumpState(thisMove)
    if (jumpState.canJumpFromEdge) {
      this._debugLog('backup advance: jump-from-edge became available, switching out of backup')
      this._clearBackupState()
      this._clearLockedYaw()
      this.bot.clearControlStates()
      return 'jump'
    }

    const dist = this.bot.entity.position.xzDistanceTo(this.backupTarget)
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    this._debugLog(
      'backup advance:',
      'target:', this.backupTarget,
      'pos:', this.bot.entity.position,
      'dist:', dist,
      'xzVel:', xzVel,
      'settling:', this.backupSettling
    )

    if (dist > 0.08) {
      this.backupSettling = false
      this._applyBackupControls(thisMove, this.backupTarget)
      return 'backing'
    }

    this.backupSettling = true
    this.bot.clearControlStates()
    this.bot.setControlState('sneak', this._shouldSneakDuringBackup(thisMove, this.backupTarget))

    if (xzVel.norm() > 0.05) {
      this._debugLog(
        'backup advance: waiting for velocity to settle',
        'target:', this.backupTarget,
        'xzVel:', xzVel.norm()
      )
      return 'backing'
    }

    this._clearBackupState()
    this._clearLockedYaw()
    this.bot.clearControlStates()
    this._debugLog('backup recheck: reached target, retrying jump state')
    return 'recheck'
  }

  private _getJumpState(thisMove: Move): {
    target: Vec3
    targetEyeVec: Vec3
    canDirectJump: boolean
    canJumpFromEdge: boolean
    fallOffEdge: boolean
  } {
    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(target)
    const bbs = this._getUnderlyingBbs(thisMove)

    return {
      target,
      targetEyeVec,
      canDirectJump: this.shitterTwo.simForwardMove(target, targetEyeVec),
      canJumpFromEdge: this.shitterTwo.simJumpFromEdge(bbs, target),
      fallOffEdge: this.shitterTwo.simFallOffEdge(target)
    }
  }

  private _debugJumpState(
    label: string,
    jumpState: {
      target: Vec3
      targetEyeVec: Vec3
      canDirectJump: boolean
      canJumpFromEdge: boolean
      fallOffEdge: boolean
    }
  ): void {

    (this as any)._lastTime ??= 0

    this._debugLog(label, performance.now() - (this as any)._lastTime)
    this._debugLog(
      'can we make it?',
      'jump right now:', jumpState.canDirectJump,
      'jump at ledge:', jumpState.canJumpFromEdge,
      'fallOffEdge:', jumpState.fallOffEdge
    )
    this._debugLog(
      'current bot info:',
      this.bot.entity.yaw,
      this.bot.entity.position,
      this.bot.entity.velocity,
    )
    this._debugLog(
      'yaw info:',
      this._yawDeltaAbs(this._desiredYawTo(jumpState.targetEyeVec)) * (180 / Math.PI),
      jumpState.targetEyeVec
    );

    (this as any)._lastTime = performance.now()
  }

  private _clearApproachControls(): void {
    this.bot.setControlState('forward', false)
    this.bot.setControlState('back', false)
    this.bot.setControlState('left', false)
    this.bot.setControlState('right', false)
    this.bot.setControlState('jump', false)
    this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', false)
  }

  private _startJumpExecution(target: Vec3): void {
    this.lockedYaw = this._desiredYawTo(target)
    this.executing = true
    this._applySmartControls(target, true)
  }

  protected _desiredYawTo(target: Vec3): number {
    const dx = target.x - this.bot.entity.position.x
    const dz = target.z - this.bot.entity.position.z
    return Math.atan2(-dx, -dz)
  }

  protected _yawDeltaAbs(targetYaw: number): number {
    let delta = targetYaw - this.bot.entity.yaw
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    return Math.abs(delta)
  }

  protected _isYawAlignedForApproach(target: Vec3): boolean {
    const wantedYaw = this._desiredYawTo(target)
    return this._yawDeltaAbs(wantedYaw) <= ParkourForwardExecutor.APPROACH_YAW_EPS
  }

  private _tryApproachWhenAligned(targetEyeVec: Vec3): boolean {
    void this._queueLookAtSync(targetEyeVec)

    if (!this._isYawAlignedForApproach(targetEyeVec)) {
      this._clearApproachControls()
      return false
    }

    this._applySmartControls(targetEyeVec, false)
    return true
  }

  async align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    this.executing = false
    this._clearLockedYaw()

    while (true) {

      const botY = this.bot.entity.position.y;

      if (botY < thisMove.exitPos.y && botY < thisMove.entryPos.y) {
        throw new CancelError(`y level: too low! ${botY}, ${thisMove.entryPos.y} ${thisMove.exitPos.y}`)
      }



      if (this.backingUp) {
        const backupState = this._advanceBackup(thisMove)
        if (backupState === 'backing') return false
        if (backupState === 'jump') continue
        if (backupState === 'failed') {
          this.bot.clearControlStates()
          throw new CancelError('ParkourExecutor: backup failed')
        }
      }

      const jumpState = this._getJumpState(thisMove)
      const { targetEyeVec, canDirectJump, canJumpFromEdge, fallOffEdge } = jumpState

      void this._queueLookAtSync(targetEyeVec)

      this._debugJumpState('align', jumpState)

      if (fallOffEdge) {
        this.executing = true
        this._lockCurrentYaw(this._desiredYawTo(targetEyeVec))
        this._applySmartControls(targetEyeVec, false)
        return true
      }

      if (canDirectJump) {
        if (!this._isYawAlignedForApproach(targetEyeVec)) {
          this._clearApproachControls()
          return false
        }

        this._clearBackupState()
        this._startJumpExecution(targetEyeVec)
        return true
      }

      if (canJumpFromEdge) {
        this._clearBackupState()
        this._lockCurrentYaw(this._desiredYawTo(targetEyeVec))
        this._tryApproachWhenAligned(targetEyeVec)
        return false
      }

      if (!this.bot.entity.onGround && this.bot.entity.position.y <= thisMove.entryPos.y) {
        throw new CancelError(`Too low y level! bot: ${this.bot.entity.position.y} | target: ${thisMove.entryPos.y}`)
      }

      if (this.bot.entity.onGround) {
        this.bot.clearControlStates()
      }

      if (this.backupAttempted) {
        this._clearBackupState()
        this.bot.clearControlStates()
        this.bot.setControlState('sneak', true)
        if (this.bot.entity.velocity.norm() < 1e-4) {
          throw new CancelError('ParkourExecutor: will not make this jump after backing up!')
        }
      }

      if (this._startBackup(thisMove)) return false

      this.bot.clearControlStates()
      throw new CancelError('ParkourExecutor: will not make this jump!')
    }
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this._clearLockedYaw()
    this._clearBackupState()
    this.backupAttempted = false

    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(target)
    void this._queueLookAtSync(targetEyeVec)
  }

  performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(target)

    const botY = this.bot.entity.position.y;

    if (botY < thisMove.exitPos.y && botY < thisMove.entryPos.y) {
      throw new CancelError(`y level: too low! ${botY}, ${thisMove.entryPos.y} ${thisMove.exitPos.y}`)
    }

    if (this.executing) {
      // printBotControls(this.bot, logParkour)
      logParkour(`Bot pos: %O`, this.bot.entity.position)
      this._lockCurrentYaw(this._desiredYawTo(targetEyeVec))
      this._applySmartControls(targetEyeVec, false)
      return this.isComplete(thisMove)
    }

    const jumpState = this._getJumpState(thisMove)
    const { canDirectJump, canJumpFromEdge, fallOffEdge } = jumpState

    this._debugJumpState('tick', jumpState)

    void this._queueLookAtSync(targetEyeVec)

    if (canDirectJump || fallOffEdge) {
      if (!this._isYawAlignedForApproach(targetEyeVec)) {
        this._clearApproachControls()
        return false
      }
      this._clearBackupState()
      if (canDirectJump) this._startJumpExecution(targetEyeVec)
      else this._applySmartControls(targetEyeVec, false)

      return false
    }

    if (canJumpFromEdge) {
      this._clearBackupState()
      this._clearLockedYaw()
      this._tryApproachWhenAligned(targetEyeVec)
      return false
    }

    if (!this.bot.entity.onGround) {
      this._clearLockedYaw()
      throw new CancelError('ParkourExecutor: missed jump window')
    }

    if (this.backupAttempted) {
      this._clearBackupState()
      this.bot.clearControlStates()
      throw new CancelError('ParkourExecutor: will not make this jump after backing up!')
    }

    if (this._startBackup(thisMove)) return false

    this._clearLockedYaw()
    this.bot.clearControlStates()
    throw new CancelError('ParkourExecutor: will not make this jump!')
  }
}

/**
 * Executor for diagonal (intercardinal) parkour jumps.
 *
 * Inherits all physics-simulation and jump-execution logic from
 * ParkourForwardExecutor — the only meaningful difference is a tighter
 * yaw-alignment threshold.
 *
 * Why tighter?  In a cardinal jump the hitbox approaches the gap head-on, so
 * a few degrees of misalignment just costs a little forward momentum.  In a
 * diagonal jump the corners of the hitbox are only 0.3 blocks away from the
 * two side-blocks (the "inner corners" of the L-shape).  A misalignment of
 * more than ~6° can push the hitbox into those corners and abort the jump
 * with a horizontal collision, so we require closer alignment before we
 * commit to the sprint-jump.
 */
export class ParkourDiagonalExecutor extends ParkourForwardExecutor {
  /** ~6.9 deg — tighter than the cardinal 9.2 deg to avoid corner clipping. */
  protected static override readonly APPROACH_YAW_EPS = 0.12

  /**
   * Resolve the yaw-alignment check using this class's tighter epsilon.
   * TypeScript static dispatch means the parent's _isYawAlignedForApproach
   * already reads `ParkourForwardExecutor.APPROACH_YAW_EPS`, so we
   * override the instance method to point at the subclass constant instead.
   */
  protected override _isYawAlignedForApproach(target: Vec3): boolean {
    const wantedYaw = this._desiredYawTo(target)
    return this._yawDeltaAbs(wantedYaw) <= ParkourDiagonalExecutor.APPROACH_YAW_EPS
  }
}
