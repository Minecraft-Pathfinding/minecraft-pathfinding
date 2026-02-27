import { Vec3 } from 'vec3'
import * as goals from '../goals'
import { Move } from '../move'
import { CancelError } from '../exceptions'
import { BlockInfo } from '../world/cacheWorld'
import { BreakHandler, PlaceHandler, RayType } from './interactionUtils'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { CompleteOpts, MovementExecutor } from './movementExecutor'
import { JumpCalculator, ParkourJumpHelper, getUnderlyingBBs, leavingBlockLevel, stateLookAt } from './movementUtils'
import { EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { printBotControls } from '../../utils'
import { Block } from '../../types'

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
  provideMovements (start: Move, storage: Move[]): void {}
  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    logIdle('performInit called')
  }
  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    return true
  }
}


export class NewForwardExecutor extends MovementExecutor {
  private getRemainingPlacements(): PlaceHandler[] {
    if (!this.currentMove) return []
    // Filter out blocks that have already been physically placed or predicted locally
    return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot))
  }

  private async faceForward (): Promise<boolean> {
    if (this.doWaterLogic()) return true

    const remainingPlacements = this.getRemainingPlacements()
    if (remainingPlacements.length === 0) {
      return true // No blocks left, safe to face forward and walk
    }

    const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0)
    const placementVecs = remainingPlacements.map((p) => AABB.fromBlock(p.vec))
    const near = placementVecs.some((p) => p.distanceToVec(eyePos) < PlaceHandler.reach + 2)

    return !near
  }

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    const inWater = this.doWaterLogic()
    const onGround = this.bot.entity.onGround

    if (this.bot.entity.position.y < thisMove.entryPos.y - 1) {
      logFwd(`Bot fell too far below entry Y (${thisMove.entryPos.y}). Aborting alignment.`)
      throw new CancelError('ForwardMove: too low to align')
    }

    const faceFwd = await this.faceForward()
    const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)

    let lookTarget: import('vec3').Vec3
    if (faceFwd) {
      lookTarget = target
      void this.lookAt(target)
    } else {
      lookTarget = this.bot.entity.position.minus(target).plus(this.bot.entity.position)
      void this.lookAt(lookTarget)
    }

    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })
    const bb1bl = this.getBlockInfo(target, 0, -1, 0)
    
    const rawBBs = bb1bl.getBBs()
    const bb1 = rawBBs.length > 0 ? rawBBs : [AABB.fromBlock(bb1bl.position)]

    const isContainedXZ = bb1.some((b) => {
      return bb0.minX >= b.minX && 
             bb0.maxX <= b.maxX && 
             bb0.minZ >= b.minZ && 
             bb0.maxZ <= b.maxZ
    })

    const xzDist = this.bot.entity.position.xzDistanceTo(target)

    const dirToTarget = lookTarget.minus(this.bot.entity.position)
    dirToTarget.y = 0
    let isLooking = true
    
    if (dirToTarget.norm() > 0.01) {
      dirToTarget.normalize()
      const currentView = this.bot.util.getViewDir()
      currentView.y = 0
      currentView.normalize()
      const dot = dirToTarget.x * currentView.x + dirToTarget.z * currentView.z
      isLooking = dot > 0.95 
    }

    if ((isContainedXZ || xzDist < 0.2) && isLooking) {
      this.bot.clearControlStates()
      return true
    }

    if (faceFwd) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('back', false)
      const sprint = this.bot.food > 6 && (xzDist > 0.8 || inWater)
      this.bot.setControlState('sprint', sprint)
      this.bot.setControlState('sneak', !sprint && xzDist <= 0.8)
    } else {
      // CAREFUL BACKWARD ALIGNMENT
      this.bot.setControlState('forward', false)
      this.bot.setControlState('back', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true) // Always sneak when backing up to edge!
    }

    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.bot.clearControlStates()

    const faceFwd = await this.faceForward()

    if (faceFwd) {
      await this.postInitAlignToPath(thisMove)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      await this.postInitAlignToPath(thisMove, { lookAt: offset })
    }
  }

  private doWaterLogic (): boolean {
    if ((this.bot.entity as any).isInWater as boolean) return true
    if (this.bot.entity.onGround) return false

    const bl = this.getBlockInfo(this.bot.entity.position, 0, -0.6, 0)
    return bl.liquid
  }

  private canJump (thisMove: Move, currentIndex: number, path: Move[]): boolean {
    if (this.doWaterLogic()) {
      return this.bot.entity.position.y < thisMove.exitPos.y
    }

    if (!this.settings.allowJumpSprint) return false
    if (!this.bot.entity.onGround) return false
    if (this.toBreakLen() > 0 || this.toPlaceLen() > 0) return false

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.14) return false

    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    this.sim.simulateUntil(
      (state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally,
      () => {},
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
      if (nextPos.exitPos.y > thisMove.entryPos.y) offset = 0.8
      if (nextPos.exitPos.y - thisMove.entryPos.y > 2) offset = 0.8
    }

    if (thisMove.entryPos.xzDistanceTo(ctx.state.pos) > thisMove.entryPos.xzDistanceTo(thisMove.exitPos) - offset) {
      return false
    }

    if (ctx.state.isCollidedHorizontally) return false
    return ctx.state.onGround
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      this.bot.clearControlStates()
      this.bot.setControlState('sneak', true)
      return false
    } 
    
    if (this.cI == null) {
      const remaining = this.getRemainingPlacements()

      if (remaining.length > 0) {
        let batchExecuted = false
        
        for (const p of remaining) {
          const info = await p.performInfo(this.bot, 5)
          
          if (info.ticks === 0) {
            logFwd(`Block ${p.vec} is visible NOW. Rapid-placing.`)
            this.bot.clearControlStates()
            this.bot.setControlState('sneak', true)
            
            await this.performInteraction(p, { info, predictBlock: true, noAwait: true }) // fire and forget, we just want to trigger the placement and get out of the way
            batchExecuted = true
          } else if (info.ticks < Infinity) {
            if (!batchExecuted) {
              logFwd(`Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`)
              void this.performInteraction(p, { info, predictBlock: true })
            }
            break // Wait for next tick to assess further blocks
          } else {
            break // Unreachable
          }
        }
        
        if (batchExecuted) return false
      }
    }

    if (
      (!this.bot.entity.onGround &&
        !this.bot.getControlState('jump') &&
        !this.doWaterLogic() &&
        this.canJump(thisMove, currentIndex, path)) ||
      this.bot.entity.position.y < Math.round(thisMove.entryPos.y) - 1
    ) {
      logFwd('Bot fell too low or is off-ground. Throwing CancelError.')
      throw new CancelError('ForwardMove: not on ground')
    }

    const faceFwd = await this.faceForward()

    if (faceFwd) {
      const jump = this.canJump(thisMove, currentIndex, path)
      this.bot.setControlState('jump', jump)
      void this.postInitAlignToPath(thisMove)
      return this.isComplete(thisMove)
    } else {
      // CAREFULLY BACK UP TO THE EDGE (SCAFFOLDING)
      const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
      const lookTarget = this.bot.entity.position.minus(target).plus(this.bot.entity.position)
      
      void this.lookAt(lookTarget)
      
      this.bot.setControlState('forward', false)
      this.bot.setControlState('back', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true) 
      
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

  private async faceForward (): Promise<boolean> {
    const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0)
    const remaining = this.getRemainingPlacements()
    
    if (remaining.length === 0) return true

    const placementVecs = remaining.map((p) => AABB.fromBlock(p.vec))
    const near = placementVecs.some((p) => p.distanceToVec(eyePos) < PlaceHandler.reach + 2)

    return !near
  }

  async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
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

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
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

  private async identMove (thisMove: Move, currentIndex: number, path: Move[]): Promise<number> {
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

  private canJump (thisMove: Move, currentIndex: number, path: Move[]): boolean {
    if (!this.settings.allowJumpSprint) return false
    if (!this.bot.entity.onGround) return false
    if (this.toBreakLen() > 0 || this.toPlaceLen() > 0) return false

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.14) return false

    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    this.sim.simulateUntil(
      (state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally,
      () => {},
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

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
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

  protected isComplete (startMove: Move, endMove?: Move): boolean {
    return super.isComplete(startMove, endMove, { ticks: 0 })
  }

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y)
      return await super.align(thisMove, tickCount, goal)
    }

    return await super.align(thisMove, tickCount, goal)
  }

  align1 (thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
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

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.flag = false
    this.bot.clearControlStates()

    if (thisMove.toBreak.length > 0) {
      await this.bot.clearControlStates()
      for (const breakH of thisMove.toBreak) {
        await this.performInteraction(breakH)
      }
    }

    this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos)

    if (this.jumpInfo === null) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('jump', true)
      this.bot.setControlState('sprint', true)
    }
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
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
  override async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
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

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      return await super.align(thisMove, tickCount, goal)
    }
    return await super.align(thisMove, tickCount, goal)
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.currentIndex = currentIndex
    await this.postInitAlignToPath(thisMove)
  }

  private identMove (thisMove: Move, currentIndex: number, path: Move[]): number {
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

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
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

  getLandingBlock (node: Move, dir: Vec3): BlockInfo | null {
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
  override async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
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

  align (thisMove: Move): boolean {
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

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // Initialization logic cleared; breaks are dynamically handled in performPerTick
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
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
  private getRemainingPlacements(): PlaceHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot))
  }

  private getRemainingBreaks(): BreakHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toBreak.filter(b => b.needToPerform(this.bot))
  }

  isAlreadyCompleted (thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    const isCompleted = this.bot.entity.position.y >= thisMove.exitPos.y
    return isCompleted
  }

  override async align (thisMove: Move): Promise<boolean> {
    if (this.bot.entity.position.y < thisMove.entryPos.y - 0.5) {
      logUp(`Bot Y (${this.bot.entity.position.y.toFixed(2)}) is too far below entry Y (${thisMove.entryPos.y}). Aborting.`)
      throw new CancelError(`StraightUp: Bot is too low to begin move`)
    }

    const onGround = this.bot.entity.onGround
    const inWater = (this.bot.entity as any).isInWater as boolean

    if (!onGround || inWater) {
      this.bot.setControlState('jump', true)

      const target = thisMove.exitPos.floored().translate(0.5, 0, 0.5)
      void this.postInitAlignToPath(thisMove, { lookAt: target, sprint: false })

      const off0 = thisMove.exitPos.minus(this.bot.entity.position)
      const off1 = thisMove.exitPos.minus(target)

      off0.translate(0, -off0.y, 0)
      off1.translate(0, -off1.y, 0)

      const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95
      const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })

      let bb1: AABB[]
      let bb2: AABB[]
      let bb1Good: boolean
      let bb2Good: boolean

      if (inWater) {
        const bb1bl = this.getBlockInfo(thisMove.entryPos, 0, 0, 0)
        bb1 = [AABB.fromBlockPos(thisMove.entryPos)]
        bb1Good = bb1bl.liquid

        const bb2bl = this.getBlockInfo(target, 0, 0, 0)
        bb2 = [AABB.fromBlock(bb2bl.position)]
        bb2Good = bb2bl.walkthrough || bb2bl.liquid
      } else {
        const bb1bl = this.getBlockInfo(target, 0, -1, 0)
        bb1 = bb1bl.getBBs()
        if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position))
        bb1Good = bb1bl.physical

        const bb2bl = thisMove.moveType.getBlockInfo(thisMove.exitPos.floored(), 0, -1, 0)
        bb2 = bb2bl.getBBs()
        if (bb2.length === 0) bb2.push(AABB.fromBlock(bb1bl.position))
        bb2Good = bb2bl.physical
      }

      const collidesBb1 = bb1.some((b) => b.collides(bb0))
      const collidesBb2 = bb2.some((b) => b.collides(bb0))

      if ((collidesBb1 && bb1Good) || (collidesBb2 && bb2Good)) {
        const xzDist = this.bot.entity.position.xzDistanceTo(target)
        if (similarDirection || xzDist < 0.2) {
          return true
        }
      }

      return false
    } else {
      return await this.align1(thisMove)
    }
  }

  async align1 (thisMove: Move): Promise<boolean> {
    const target = thisMove.entryPos.floored().offset(0.5, 0, 0.5)
    this.bot.clearControlStates()

    void this.lookAt(target)

    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })
    const bb1bl = this.getBlockInfo(target, 0, -1, 0)

    const rawBBs = bb1bl.getBBs()
    const bb1 = rawBBs.length > 0 
      ? rawBBs.map(b => b.clone()) 
      : [AABB.fromBlock(bb1bl.position)]

    bb1.forEach((b) => b.extend(0, 10, 0))

    const isContainedXZ = bb1.some((b) => {
      return bb0.minX >= b.minX && 
             bb0.maxX <= b.maxX && 
             bb0.minZ >= b.minZ && 
             bb0.maxZ <= b.maxZ
    })

    const xzDist = this.bot.entity.position.xzDistanceTo(target)

    logUp(`align1() Check -> Bot XZ inside target: ${isContainedXZ}, xzDist: ${xzDist.toFixed(3)}`)

    if (isContainedXZ || xzDist < 0.2) {
      return true
    }

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    const dotProd = xzVel.normalize().dot(this.bot.util.getViewDir())

    if (dotProd <= -0.2 || xzDist > 0.8) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('sneak', false)
    } else {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true)
    }

    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    if (thisMove.toPlace.length > 1) {
      throw new CancelError('StraightUp: toPlace.length > 1')
    }
    // Interactions dynamically handled in performPerTick
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.bot.entity.position.y < thisMove.entryPos.y - 0.5) {
      throw new CancelError('StraightUp: fell too low during execution')
    }

    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot, 0))) {
      // Crucial: Maintain jump state even if an interaction locks the tick!
      const needsToJump = this.bot.entity.position.y < thisMove.exitPos.y
      this.bot.setControlState('jump', needsToJump)
      return false
    } 
    
    if (this.cI == null) {
      // 1. Check for blocks that need breaking above us
      const remainingBreaks = this.getRemainingBreaks()
      if (remainingBreaks.length > 0) {
        const breakTarget = remainingBreaks[0]
        logUp(`[StraightUp] Block ${breakTarget.vec} needs breaking. Triggering background interaction.`)
        this.bot.clearControlStates()
        void this.performInteraction(breakTarget)
        return false
      }

      // 2. Process Concurrent Rapid-Placements below us
      const remainingPlaces = this.getRemainingPlacements()
      if (remainingPlaces.length > 0) {
        let batchExecuted = false
        
        for (const p of remainingPlaces) {
          const info = await p.performInfo(this.bot, 5)
          
          if (info.ticks === 0) {
            logUp(`[StraightUp] Block ${p.vec} is visible NOW. Rapid-placing.`)
            // Maintain jump upward momentum!
            const needsToJump = this.bot.entity.position.y < thisMove.exitPos.y
            this.bot.setControlState('jump', needsToJump)
            
            await this.performInteraction(p, { info, predictBlock: true, noAwait: true }) // fire and forget, we just want to trigger the placement and get out of the way
            batchExecuted = true
          } else if (info.ticks < Infinity) {
            if (!batchExecuted) {
              logUp(`[StraightUp] Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`)
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

    void this.align(thisMove)

    const needsToJump = this.bot.entity.position.y < thisMove.exitPos.y
    this.bot.setControlState('jump', needsToJump)

    const inWater = (this.bot.entity as any).isInWater as boolean
    
    if (inWater) {
      return tickCount > 0 && this.bot.entity.position.y >= thisMove.exitPos.y
    }

    return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y >= thisMove.exitPos.y
  }
}

export class ParkourForwardExecutor extends MovementExecutor {
  private readonly shitterTwo: ParkourJumpHelper = new ParkourJumpHelper(this.bot, this.world)

  private backUpTarget?: Vec3
  private reachedBackup = false
  private executing = false
  private stepAmt = 1

  protected isComplete (startMove: Move, endMove?: Move, opts: CompleteOpts = {}): boolean {
    return super.isComplete(startMove, endMove, opts)
  }

  private getRemainingPlacements(): PlaceHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot))
  }

  private getRemainingBreaks(): BreakHandler[] {
    if (!this.currentMove) return []
    return this.currentMove.toBreak.filter(b => b.needToPerform(this.bot))
  }

  private async cheatCode (ticks = this.stepAmt): Promise<number> {
    let counter = 0
    await new Promise<boolean>((resolve, reject) => {
      let leave = false
      const listener = (): void => {
        if (counter++ > ticks) {
          this.bot.off('physicsTick', listener)
          counter--
          resolve(false)
        }

        if (leave) {
          this.bot.off('physicsTick', listener)
          counter--
          resolve(true)
        }

        if (leavingBlockLevel(this.bot, this.world, 1)) {
          leave = true
        }
      }
      this.bot.entity.onGround = true
      this.bot.on('physicsTick', listener)
    })
    return counter
  }

  async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    this.executing = false
    const target = thisMove.exitPos.offset(0, -1, 0)

    const targetEyeVec = this.shitterTwo.findGoalVertex(AABB.fromBlockPos(target))
    const test2 = this.shitterTwo.simFallOffEdge(target)

    if (test2) {
      this.executing = true
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('forward', true)
      this.bot.setControlState('jump', false)
      void this.lookAtPathPos(target)
      return true
    }

    const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6)

    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos.offset(0, -1, 0)))
    }

    const test0 = this.shitterTwo.simForwardMove(target)
    const test1 = this.shitterTwo.simJumpFromEdge(bbs, target)

    if (this.bot.entity.onGround) {
      if (test0) {
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
        this.bot.setControlState('jump', true)
        this.bot.setControlState('sneak', false)
        this.bot.setControlState('jump', false)
        void this.lookAt(targetEyeVec)
        this.executing = true
        return true
      }
      if (test1) {
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
        void this.lookAt(targetEyeVec)
        return false
      }
    }

    const bb = AABBUtils.getPlayerAABB({ position: this.bot.entity.position, width: 0.3, height: 1.8 }).extend(0, -0.252, 0)
    const ctx = EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot)
    
    // Assume moving forward.
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.03) {
      stateLookAt(ctx.state, targetEyeVec)
      ctx.state.control.set('forward', true)
      ctx.state.control.set('sprint', true)
    }

    const goingToFall = leavingBlockLevel(this.bot, this.world, this.stepAmt, ctx)

    if (!goingToFall && this.backUpTarget != null && bb.containsVec(this.backUpTarget)) {
      this.reachedBackup = true
      await this.lookAtPathPos(targetEyeVec)

      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
    } else if (this.bot.entity.onGround && goingToFall && this.backUpTarget == null) {
      this.stepAmt = 1
      this.reachedBackup = false
      this.backUpTarget = this.shitterTwo.findBackupVertex(bbs, target)

      const oldY = this.bot.entity.position.y

      await this.cheatCode(2)

      const currentY = this.bot.entity.position.y

      this.bot.entity.onGround = true
      this.bot.entity.position.y = oldY
      const res = this.shitterTwo.simForwardMove(target)

      if (res) {
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('jump', true)
        this.executing = true
        return true
      } else {
        this.bot.entity.position.y = currentY
        await this.lookAt(this.backUpTarget)
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
      }
    } else if (goingToFall && this.backUpTarget != null && this.reachedBackup) {
      const oldY = this.bot.entity.position.y

      await this.cheatCode()

      const currentY = this.bot.entity.position.y
      printBotControls(this.bot)
      this.bot.entity.onGround = true
      this.bot.entity.position.y = oldY
      const res = this.shitterTwo.simForwardMove(target)

      if (res) {
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('jump', true)
        this.executing = true
        return true
      } else {
        this.bot.entity.position.y = currentY
        await this.lookAtPathPos(this.backUpTarget)
        this.bot.clearControlStates()
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sneak', true)
        await this.bot.waitForTicks(1)
        this.stepAmt = 1
        delete this.backUpTarget
        this.reachedBackup = false
        throw new CancelError('ParkourExecutor: will not make this jump!')
      }
    } else if (!this.reachedBackup && this.backUpTarget != null) {
      const dist = this.bot.entity.position.xzDistanceTo(this.backUpTarget)

      void this.lookAtPathPos(this.backUpTarget)
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', dist > 0)
    } else {
      this.bot.clearControlStates()
      void this.lookAtPathPos(targetEyeVec)
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
    }

    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    delete this.backUpTarget
    this.reachedBackup = false
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot, 0))) {
      // Parkour safety: If we are locked by an interaction, only anchor if we are firmly on the ground.
      // If we are mid-air, clearing states would cause us to fall into the gap!
      if (this.bot.entity.onGround) {
        this.bot.clearControlStates()
        this.bot.setControlState('sneak', true)
      }
      return false
    } 
    
    if (this.cI == null) {
      const remainingBreaks = this.getRemainingBreaks()
      if (remainingBreaks.length > 0) {
        const breakTarget = remainingBreaks[0]
        logParkour(`[Parkour] Block ${breakTarget.vec} needs breaking. Triggering background interaction.`)
        if (this.bot.entity.onGround) {
          this.bot.clearControlStates()
          this.bot.setControlState('sneak', true)
        }
        void this.performInteraction(breakTarget)
        return false
      }

      const remainingPlaces = this.getRemainingPlacements()
      if (remainingPlaces.length > 0) {
        let batchExecuted = false
        
        for (const p of remainingPlaces) {
          const info = await p.performInfo(this.bot, 5)
          
          if (info.ticks === 0) {
            logParkour(`[Parkour] Block ${p.vec} is visible NOW. Rapid-placing.`)
            if (this.bot.entity.onGround) {
               this.bot.clearControlStates()
               this.bot.setControlState('sneak', true)
            }
            
            await this.performInteraction(p, { info, predictBlock: true, noAwait: true }) // fire and forget, we just want to trigger the placement and get out of the way
            batchExecuted = true
          } else if (info.ticks < Infinity) {
            if (!batchExecuted) {
              logParkour(`[Parkour] Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`)
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

    const targetEyeVec = this.shitterTwo.findGoalVertex(AABB.fromBlockPos(thisMove.exitPos))
    
    if (this.executing) {
      this.bot.setControlState('jump', false)
      void this.postInitAlignToPath(thisMove, { lookAtYaw: targetEyeVec })
      return this.isComplete(thisMove)
    }

    const target = thisMove.exitPos.offset(0, -1, 0)
    const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6)
    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos))
    }

    void this.postInitAlignToPath(thisMove, { lookAtYaw: targetEyeVec })

    const test = this.shitterTwo.simForwardMove(target)
    const test1 = this.shitterTwo.simJumpFromEdge(bbs, target)

    if (test) {
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('forward', true)
      this.bot.setControlState('jump', true)
      this.executing = true
    } else if (test1) {
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('forward', true)
    }

    return false
  }
}