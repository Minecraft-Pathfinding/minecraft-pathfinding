import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Move } from '../move'
import * as goals from '../goals'
import { World } from '../world/worldInterface'
import { BreakHandler, InteractHandler, InteractOpts, PlaceHandler, RayType } from './interactionUtils'
import { AbortError, CancelError, ResetError } from '../exceptions'
import { Movement, MovementOptions } from './movement'
import { AABB, AABBUtils, Task } from '@nxg-org/mineflayer-util-plugin'
import { BaseSimulator, Controller, EPhysicsCtx, EntityPhysics, PlayerState, SimulationGoal } from '@nxg-org/mineflayer-physics-util'
import { botStrafeMovement, botSmartMovement } from './controls'
import { getNormalizedPos } from '../../utils'

const debug = require('debug')

const log = debug('minecraft-pathfinding:movementExecutor')

// temp typing
interface AbortOpts {
  reason?: ResetError | AbortError
  timeout?: number
}

export interface CompleteOpts {
  ticks?: number
  entry?: boolean
}

export abstract class MovementExecutor extends Movement {
  /**
   * Physics engine, baby.
   */
  protected sim: BaseSimulator<PlayerState>

  /**
   * Entity state of bot
   */
  protected simCtx: EPhysicsCtx<PlayerState>

  /** */
  protected engine: EntityPhysics

  /**
   * Return the current interaction.
   */
  public get cI (): InteractHandler | undefined {
    // if (this._cI === undefined) return undefined;
    // if (this._cI.allowExit) return undefined;
    return this._cI
  }

  /**
   * Whether or not this movement has been cancelled/aborted.
   */
  public aborted = false

  /**
   * Whether or not this movement is asking for a reset.
   */
  public resetReason?: AbortOpts['reason']

  private task: Task<void, void> = new Task()

  public constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings)
    this.engine = new EntityPhysics(bot.registry)
    this.sim = new BaseSimulator(this.engine)
    this.simCtx = EPhysicsCtx.FROM_BOT(this.engine, bot)
  }

  public reset (): void {
    log('Resetting MovementExecutor')
    this.aborted = false
    delete this.resetReason
    this.task.finish()
  }

  /**
   * TODO: Implement.
   */
  public async abort (move: Move = this.currentMove, settings: AbortOpts = {}): Promise<void> {
    // if (this.aborted || this.resetReason != null) return

    const resetting = settings.reason
    log('Aborting movement. Reason:', resetting?.message ?? 'None')

    this.aborted = true
    this.resetReason = resetting

    await this.task.promise

    this.task = new Task()
  }

  private async holdUntilAborted (move: Move, task: Task<void>, timeout = 1000): Promise<void> {
    if (!this.aborted && this.resetReason == null) return

    log('holdUntilAborted: aborting process started')
    let start = performance.now()

    for (const breakTarget of move.toBreak) {
      await breakTarget._abort(this.bot)
    }

    log('aborted breaks in %d ms', performance.now() - start)
    start = performance.now()

    for (const place of move.toPlace) {
      await place._abort(this.bot)
    }

    log('aborted places in %d ms', performance.now() - start)
    start = performance.now()

    // TODO: handle bug (nextMove not included).
    await new Promise<void>((resolve, reject) => {
      const listener = (): void => {
        if (this.safeToCancel(move)) {
          this.bot.off('physicsTick', listener)
          // task.finish()
          resolve()
        }
      }
      this.bot.on('physicsTick', listener)
      setTimeout(() => {
        this.bot.off('physicsTick', listener)
        // task.finish()
        reject(new Error('Movement failed to abort properly.'))
      }, timeout)
    })

    log('aborted all in %d ms', performance.now() - start)

    if (this.resetReason != null) throw this.resetReason // new ResetError('Movement is resetting.')
    if (this.aborted) throw new AbortError('Movement aborted.')
  }

  /**
   * TODO: potentially buggy code. Check.
   */
  public async perform (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    log('Performing move at index %d', currentIndex)
    this.currentMove = thisMove
    if (this.aborted) throw new AbortError('Movement aborted.')
    if (this.resetReason != null) throw this.resetReason // new ResetError('Movement is resetting.')

    await this._performInit(thisMove, currentIndex, path)

    let result: boolean | number = false
    await new Promise<void>((resolve, reject) => {
      const listener = async (): Promise<void> => {
        if (this.aborted) {
          reject(new AbortError('Movement aborted.'))
        }
        if (this.resetReason != null) {
          reject(this.resetReason)
        }

        if (result === false) {
          result = await this._performPerTick(thisMove, tickCount, currentIndex, path)
        }

        if (result as boolean) {
          this.bot.off('physicsTick', listener)
          resolve()
        }
      }
      this.bot.on('physicsTick', listener)
    })

    let tickCount = 0

    while (result === false) {
      result = await this._performPerTick(thisMove, tickCount, currentIndex, path)
      tickCount++
    }
  }

  public async _performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    await this.holdUntilAborted(thisMove, this.task)
    return await this.performInit(thisMove, currentIndex, path)
  }

  public async _performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    await this.holdUntilAborted(thisMove, this.task)
    return await this.performPerTick(thisMove, tickCount, currentIndex, path)
  }

  public async _align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    await this.holdUntilAborted(thisMove, this.task)
    return await this.align(thisMove, tickCount, goal)
  }

  /**
   * Runtime calculation.
   *
   * Perform initial setup upon movement start.
   * Can be sync or async.
   */
  abstract performInit (thisMove: Move, currentIndex: number, path: Move[]): void | Promise<void>

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot per-tick.
   * Return whether or not bot has reached the goal.
   *
   */
  abstract performPerTick (
    thisMove: Move,
    tickCount: number,
    currentIndex: number,
    path: Move[]
  ): boolean | number | Promise<boolean | number>

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot BEFORE attempting the move.
   * This can be used to align to the center of blocks, etc.
   * Align IS allowed to throw exceptions, it will revert to recovery.
   */
  align (thisMove: Move, tickCount?: number, goal?: goals.Goal, lookTarget?: Vec3): boolean | Promise<boolean> {
    const target = lookTarget ?? thisMove.entryPos
    if (lookTarget != null) void this.postInitAlignToPath(thisMove, { lookAt: target })
    else void this.postInitAlignToPath(thisMove)

    return this.isInitAligned(thisMove, target)
  }

  /**
   * Runtime calculation.
   *
   * Check whether or not the move is already currently completed. This is checked once, before alignment.
   */
  isAlreadyCompleted (thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    return this.isComplete(thisMove)
  }

  /**
   * Default implementation of isComplete.
   *
   * Checks whether or not the bot hitting the target block is unavoidable.
   *
   * Does so via velocity direction check (heading towards the block)
   * and bounding box check (touching OR slightly above block).
   */
  protected isComplete (startMove: Move, endMove: Move = startMove, opts: CompleteOpts = {}): boolean {
  
    if (this.cI !== undefined) {
      if (!this.cI.allowExit) return false
    }

    const ticks = opts.ticks ?? 1

    const target = endMove.exitPos
    const offset = endMove.exitPos.minus(this.bot.entity.position)
    const dir = endMove.exitPos.minus(startMove.entryPos)

    // console.log(offset, dir)
    offset.translate(0, -offset.y, 0) // xz only
    dir.translate(0, -dir.y, 0) // xz only

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    const xzVelDir = xzVel.normalize()

    const dist = offset.norm()

    const ectx = EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot)
    const history= [ectx.position.clone()];
    for (let i = 0; i < ticks; i++) {
      ectx.state.control.set('jump', false) // we don't want to jump again.
      ectx.state.jumpQueued = false;
      this.bot.physicsUtil.engine.simulate(ectx, this.world)
      history.push(ectx.position.clone())
    }

    const pos = ectx.state.pos.clone()

    // console.log(ectx.state.pos, ectx.state.isCollidedHorizontally, ectx.state.isCollidedVertically);

    const normPos = getNormalizedPos(this.bot, pos)

    // const pos = this.bot.entity.position
    const bb0 = AABBUtils.getPlayerAABB({ position: normPos, width: 0.599, height: 1.8 })
    // bb0.extend(0, ticks === 0 ? -0.251 : -0.1, 0);
    // bb0.expand(-0.0001, 0, -0.0001);

    let bb1bl
    let bbCheckCond = false
    let weGood = false

    const aboveWater =
      !ectx.state.isInWater &&
      !ectx.state.onGround &&
      this.bot.pathfinder.world.getBlockInfo(this.bot.entity.position.floored().translate(0, -0.6, 0)).liquid


    if (aboveWater) {
      bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored())
      bbCheckCond = bb1bl.walkthrough
      const bb1s = AABB.fromBlockPos(bb1bl.position)
      weGood = bb1s.collides(bb0) && bbCheckCond // && !(this.bot.entity as any).isCollidedHorizontally;
    } else if (ectx.state.isInWater) {
      bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored())
      bbCheckCond = bb1bl.liquid
      const bb1s = AABB.fromBlock(bb1bl.position)
      weGood = bb1s.collides(bb0) && bbCheckCond // && !(this.bot.entity as any).isCollidedHorizontally;
      // console.log('water check', bb1bl.block?.type, bb1s, bb0, bbCheckCond)
    } else {
      bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored().translate(0, -1, 0))
      bbCheckCond = bb1bl.physical
      const bb1s = bb1bl.getBBs()
      weGood = bb1s.some((b) => b.collides(bb0)) && bbCheckCond && pos.y >= bb1bl.height // && !(this.bot.entity as any).isCollidedHorizontally;
      // console.log(
      //   "land check",
      //   endMove.exitPos,
      //   bb1bl.block?.name,
      //   bb1s,
      //   bb0,
      //   bbCheckCond,
      //   bb1s.some((b) => b.collides(bb0)),
      //   pos.y >= bb1bl.height,
      //   history
      // );
    }
    // const bbOff = new Vec3(0, ectx.state.isInWater ? 0 : -1, 0)

    const headingThatWay = xzVelDir.dot(dir.normalize()) > -2
    const similarDirection = offset.normalize().dot(dir.normalize()) > 0.5
    
    if (weGood) {
      // console.log('we good checl', xzVelDir.normalize().dot(dir.normalize()), offset, headingThatWay,  similarDirection,  ectx.state.isCollidedHorizontally, ectx.state.isCollidedVertically)
      if (similarDirection && headingThatWay) return !ectx.state.isCollidedHorizontally // in air check.
      else if (dist < 0.2) return true
      else {
        return true;
      }

      // console.log('finished!', this.bot.entity.position, endMove.exitPos, bbsVertTouching, similarDirection, headingThatWay, offset.y)
    }

    // console.log(
    //   "backup",
    //   this.bot.entity.position.xzDistanceTo(endMove.exitPos),
    //   this.bot.entity.position.y,
    //   endMove.exitPos.y,
    //   this.bot.entity.onGround,
    //   this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm()
    // );

    // default implementation of being at the center of the block.
    // Technically, this may be true when the bot overshoots, which is fine.
    return (
      this.bot.entity.position.xzDistanceTo(endMove.exitPos) < 0.2 &&
      this.bot.entity.position.y === endMove.exitPos.y &&
      this.bot.entity.onGround
    )
  }

  public isInitAligned (thisMove: Move, target: Vec3 = thisMove.entryPos): boolean {
    target = thisMove.entryPos
    const off0 = thisMove.exitPos.minus(this.bot.entity.position)
    const off1 = thisMove.exitPos.minus(target)

    if (this.bot.entity.position.y < thisMove.entryPos.y - 1) throw new CancelError('MovementExecutor: bot is too low.')

    log('isInitAligned: off0.dot(off1)=%d', off0.dot(off1))

    off0.translate(0, -off0.y, 0)
    off1.translate(0, -off1.y, 0)

    const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95

    const normPos = getNormalizedPos(this.bot)

    const bb0 = AABBUtils.getEntityAABBRaw({ position: normPos, width: 0.6, height: 1.8 })

    const bb1bl = this.getBlockInfo(target, 0, -1, 0)
    const bb1 = bb1bl.getBBs()
    if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position))
    const bb1good = bb1bl.physical || bb1bl.liquid

    const bb2bl = this.getBlockInfo(thisMove.exitPos.floored(), 0, -1, 0)
    const bb2 = bb2bl.getBBs()
    if (bb2.length === 0) bb2.push(AABB.fromBlock(bb2bl.position))
    const bb2good = bb2bl.physical || bb2bl.liquid

    if ((bb1.some((b) => b.collides(bb0)) && bb1good) || (bb2.some((b) => b.collides(bb0)) && bb2good)) {
      log('isInitAligned: yay check passed. similarDirection=%s, dist=%d', similarDirection, this.bot.entity.position.xzDistanceTo(target))
      if (similarDirection) return true
      else {
        if (this.bot.entity.position.xzDistanceTo(target) < 0.2) return true
        if (bb2.some((b) => b.collides(bb0)) && bb2good) return true
      }
    }

    return false
  }

  /**
   * Lazy code.
   */
  public safeToCancel (startMove: Move, endMove: Move = startMove): boolean {
    return this.bot.entity.onGround || ((this.bot.entity as any).isInWater as boolean)
  }

  /**
   * Provide information about the current move.
   *
   * Return breaks first as they will not interfere with placements,
   * whereas placements will almost always interfere with breaks (LOS failure).
   */
  async interactNeeded (ticks = 1): Promise<PlaceHandler | BreakHandler | undefined> {
    for (const breakTarget of this.currentMove.toBreak) {
      if (breakTarget !== this._cI && !breakTarget.done) {
        if (!breakTarget.needToPerform(this.bot)) continue
        const res = await breakTarget.performInfo(this.bot, ticks)
        log('interactNeeded: break ticks %d (raycasts: %s)', res.ticks, res.raycasts.length > 0)
        if (res.ticks < Infinity) return breakTarget
      }
    }

    for (const place of this.currentMove.toPlace) {
      if (place !== this._cI && !place.done) {
        if (!place.needToPerform(this.bot)) continue
        const res = await place.performInfo(this.bot, ticks)
        log('interactNeeded: place ticks %d (raycasts: %s)', res.ticks, res.raycasts.length > 0)
        if (res.ticks < Infinity) return place
      }
    }
  }

  /**
   * Generalized function to perform an interaction.
   */
  async performInteraction (interaction: PlaceHandler | BreakHandler, opts: InteractOpts = {}): Promise<void> {
    this._cI = interaction
    interaction.loadMove(this)
    if (interaction instanceof PlaceHandler) {
      await this.performPlace(interaction, opts)
    } else if (interaction instanceof BreakHandler) {
      await this.performBreak(interaction, opts)
    }
  }

  protected async performPlace (place: PlaceHandler, opts: InteractOpts = {}): Promise<void> {
    const item = place.getItem(this.bot)
    if (item == null) throw new CancelError('MovementExecutor: no item to place')
    log('performPlace: placing item %s', item.name)
    await place._perform(this.bot, item, opts)
    this._cI = undefined
  }

  protected async performBreak (breakTarget: BreakHandler, opts: InteractOpts = {}): Promise<void> {
    const block = breakTarget.getBlock(this.bot.pathfinder.world)
    if (block == null) throw new CancelError('MovementExecutor: no block to break')
    const item = breakTarget.getItem(this.bot, block)
    log('performBreak: breaking block %s', block.name)
    await breakTarget._perform(this.bot, item, opts)
    this._cI = undefined
  }

  /**
   * Utility function to have the bot look in the direction of the target, but only on the xz plane.
   */
  public async lookAtPathPos (vec3: Vec3, force = this.settings.forceLook): Promise<void> {
    return await this.lookAt(vec3.offset(0, -vec3.y + this.bot.entity.position.y + 1.62, 0), force)
  }

  public async lookAt (vec3: Vec3, force = this.settings.forceLook): Promise<void> {
    if (this.isLookingAt(vec3, 0.001)) return
    // log('lookAt: looking at %O (force=%s)', vec3, force)
    await this.bot.lookAt(vec3, force)
  }

  public isLookingAt (vec3: Vec3, limit = 0.01): boolean {
    if (!this.settings.careAboutLookAlignment) return true

    const bl = this.bot.blockAtCursor(256) as unknown as RayType | null
    if (bl == null) return false

    const eyePos = this.bot.entity.position.offset(0, 1.62, 0)
    return bl.intersect.minus(eyePos).normalize().dot(vec3.minus(eyePos).normalize()) > 1 - limit
  }

  public isLookingAtYaw (vec3: Vec3, limit = 0.01): boolean {
    if (!this.settings.careAboutLookAlignment) return true

    const inter = this.bot.util.getViewDir()
    const eyePos = this.bot.entity.position.offset(0, 1.62, 0)

    const pos1 = vec3.minus(eyePos)
    pos1.translate(0, -pos1.y, 0)

    return inter.normalize().dot(pos1.normalize()) > 1 - limit
  }

  protected resetState (): PlayerState {
    this.simCtx.state.update(this.bot)
    return this.simCtx.state
  }

  protected simUntil (...args: Parameters<BaseSimulator<PlayerState>['simulateUntil']>): ReturnType<BaseSimulator<PlayerState>['simulateUntil']> {
    this.simCtx.state.update(this.bot)
    return this.sim.simulateUntil(...args)
  }

  protected simUntilGrounded (controller: Controller, maxTicks = 1000): PlayerState {
    this.simCtx.state.update(this.bot)
    return this.sim.simulateUntil(
      (state) => state.onGround,
      () => {},
      controller,
      this.simCtx,
      this.world,
      maxTicks
    )
  }

  protected simJump ({ goal, controller }: { goal?: SimulationGoal, controller?: Controller } = {}, maxTicks = 1000): PlayerState {
    this.simCtx.state.update(this.bot)
    goal = goal ?? ((state) => state.onGround)
    controller =
      controller ??
      ((state) => {
        state.control.set('jump', true)
      })
    return this.sim.simulateUntil(goal, () => {}, controller, this.simCtx, this.world, maxTicks)
  }

  protected async postInitAlignToPath (
    startMove: Move,
    opts?: { handleBack?: boolean, lookAt?: Vec3, lookAtYaw?: Vec3, sprint?: boolean }
  ): Promise<void>
  protected async postInitAlignToPath (
    startMove: Move,
    endMove?: Move,
    opts?: { handleBack?: boolean, lookAt?: Vec3, lookAtYaw?: Vec3, sprint?: boolean }
  ): Promise<void>
  protected async postInitAlignToPath (startMove: Move, endMove?: any, opts?: any): Promise<void> {
    if (endMove === undefined) {
      endMove = startMove
      opts = {}
    } else if (endMove instanceof Move) {
      opts = opts ?? {}
    } else {
      opts = endMove
      endMove = startMove
    }

    let target = opts.lookAt ?? opts.lookAtYaw ?? endMove.exitPos
    // log('postInitAlignToPath: target=%O, opts=%O', target, opts)

    if (opts.lookAtYaw != null && opts.lookAt == null) {
      target = target.offset(0, -target.y + this.bot.entity.position.y + this.bot.entity.height, 0)
    }
    
    const sprint = opts.sprint ?? true

    if (target !== endMove.exitPos) {
      await this.lookAt(target)
      if (!this.isLookingAt(target, 0.01)) return
    } else {
      await this.lookAtPathPos(target)
      if (!this.isLookingAtYaw(target, 0.01)) {
        log('postInitAlignToPath: failed yaw check')
        return
      }
    }

    botStrafeMovement(this.bot, endMove.exitPos)
    botSmartMovement(this.bot, endMove.exitPos, sprint)
  }
}