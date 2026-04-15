import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Move } from '../../../src/mineflayer-specific/move'
import { World } from '../../../src/mineflayer-specific/world/worldInterface'
import { MovementExecutor } from '../../../src/mineflayer-specific/movements/movementExecutor'
import { MovementOptions } from '../../../src/mineflayer-specific/movements/movement'
import { BreakHandler, PlaceHandler } from '../../../src/mineflayer-specific/movements/interactionUtils'
import { BlockInfo } from '../../../src/mineflayer-specific/world/cacheWorld'
import { CancelError } from '../../../src/mineflayer-specific/exceptions'
import * as goals from '../../../src/mineflayer-specific/goals'
import { randFloat, randRangeMs, shortestYawDelta, OptimalLineTracker, RAD2DEG } from './BridgeUtils'
import { BridgeConfig, DEFAULT_BRIDGE_CONFIG } from './BridgeConfig'
import { BridgeModeBase, ModeTickResult, TickContext } from './modes/BridgeModeBase'
import { NormalMode } from './modes/NormalMode'
import { GodBridgeMode } from './modes/GodBridgeMode'
import { BreezilyMode } from './modes/BreezilyMode'
import { PathSplicer } from './PathSplicer'
import { BuildableMoveExecutor } from '../../../src/mineflayer-specific/movements'
import { getViewDir } from '../../../src/utils'

export class BridgeExecutor extends MovementExecutor {
  private static readonly MIN_YAW_DELTA_RAD = 0.0003

  private readonly bridgeConfig: BridgeConfig
  private readonly mode: BridgeModeBase
  private readonly lineTracker = new OptimalLineTracker()

  private placedThisMove = 0
  private placementCooldownUntilMs = 0
  private nextPlacementDelayMs = 0
  private _nextMouseClickMs = 0
  private elevated = false
  private elevatedJumpCooldownUntilMs = 0
  private splicedEndIndex = 0
  private stallStartMs = 0
  private _lerpYaw = 0.4
  private _lerpPitch = 0.45
  private _forceStopMovementThisTick = false

  constructor(bot: Bot, world: World, settings: Partial<MovementOptions> = {}, cfg: Partial<BridgeConfig> = {}) {
    super(bot, world, settings)

    this.bridgeConfig = {
      ...DEFAULT_BRIDGE_CONFIG,
      ...cfg,
      rotation: { ...DEFAULT_BRIDGE_CONFIG.rotation, ...cfg.rotation },
      normal: { ...DEFAULT_BRIDGE_CONFIG.normal, ...cfg.normal },
      godbridge: { ...DEFAULT_BRIDGE_CONFIG.godbridge, ...cfg.godbridge },
      breezily: { ...DEFAULT_BRIDGE_CONFIG.breezily, ...cfg.breezily }
    }

    switch (this.bridgeConfig.mode) {
      case 'godbridge':
        this.mode = new GodBridgeMode(bot, world, this.bridgeConfig)
        break
      case 'breezily':
        this.mode = new BreezilyMode(bot, world, this.bridgeConfig)
        break
      default:
        this.mode = new NormalMode(bot, world, this.bridgeConfig)
    }
  }

  static withConfig(cfg: Partial<BridgeConfig> = {}): BuildableMoveExecutor {
    return class BridgeExecutorConfigured extends BridgeExecutor {
      constructor(bot: Bot, world: World, settings: Partial<MovementOptions>) {
        super(bot, world, settings, cfg)
      }
    }
  }

  override async align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    const pos = this.bot.entity.position
    const aligned = this.isInitAligned(thisMove)

    if (this._isInWater()) {
      await super.align(thisMove, tickCount, goal)
      this.bot.setControlState('jump', pos.y < thisMove.entryPos.y)
      return this.isInitAligned(thisMove)
    }

   
    void this.postInitAlignToPath(thisMove)

    if (!this.bot.entity.onGround && pos.y > thisMove.entryPos.y + 0.1) return false
    return aligned
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.bot.clearControlStates()

    this.placedThisMove = 0
    this.placementCooldownUntilMs = 0
    this.stallStartMs = 0
    this.nextPlacementDelayMs = randRangeMs(this.bridgeConfig.placementDelayMs)
    this._nextMouseClickMs = 0
    this._refreshLerp()
    this.lineTracker.reset()
    this._forceStopMovementThisTick = false

    const pf = (this.bot as any).pathfinder
    if (pf != null) pf.suppressPathReset = true

    if (this._isInWater()) {
      await this.postInitAlignToPath(thisMove)
      return
    }

    this.elevated = this._shouldElevate()
    this.elevatedJumpCooldownUntilMs = 0
    this.splicedEndIndex = PathSplicer.computeSpliceEnd(this.bot, this.world, currentIndex, path)

    const splicedTarget = path[this.splicedEndIndex] ?? thisMove
    this.lineTracker.seedPath(thisMove.entryPos, splicedTarget.exitPos)

    const ctx = this._makeCtx(thisMove, currentIndex, path)
    this.mode.onMoveStart(ctx)

    await this.lookAtPathPos(thisMove.exitPos)
  }

  async performPerTick(
    thisMove: Move,
    tickCount: number,
    currentIndex: number,
    path: Move[]
  ): Promise<boolean | number> {
    const bot = this.bot
    const pos = bot.entity.position
    const now = Date.now()

    this._forceStopMovementThisTick = false

    if (this._isInWater()) {
      if (pos.y < thisMove.exitPos.y) bot.setControlState('jump', true)
      void this.postInitAlignToPath(thisMove)
      if (this.isComplete(thisMove)) {
        this.mode.onMoveEnd()
        return true
      }
      return false
    }

    if (!bot.entity.onGround && pos.y < Math.round(thisMove.entryPos.y) - 3) {
      throw new CancelError('BridgeExecutor: fell off path')
    }

    const xzSpeed = Math.sqrt(bot.entity.velocity.x ** 2 + bot.entity.velocity.z ** 2)
    const collidedH = (bot.entity as any).isCollidedHorizontally as boolean
    if (!bot.entity.onGround && (collidedH || xzSpeed < 0.01)) {
      if (this.stallStartMs === 0) this.stallStartMs = now
      if (now - this.stallStartMs > this.bridgeConfig.stallTimeoutMs) {
        throw new CancelError('BridgeExecutor: stalled horizontally')
      }
    } else {
      this.stallStartMs = 0
    }

    const wantedBlockPlacements = this._getPendingPlacements(path, currentIndex)
      .map((p) => p.blockInfo.position)

    const ctx = this._makeCtx(thisMove, currentIndex, path)
    const modeResult = this.mode.onTick(ctx, wantedBlockPlacements)

    this._applyRotation(thisMove, modeResult.targetYaw, modeResult.targetPitch)

    if (modeResult.allowPlace && now >= this.placementCooldownUntilMs && now >= this._nextMouseClickMs) {
      const placed = await this._attemptMousePlacement(path, currentIndex)
      if (placed != null) {
        this.placedThisMove++
        this.placementCooldownUntilMs = now + this.nextPlacementDelayMs
        this.nextPlacementDelayMs = randRangeMs(this.bridgeConfig.placementDelayMs)
        this._nextMouseClickMs = now + (1000 / (4 + Math.random() * 2))
        this._forceStopMovementThisTick = true

        const updatedCtx = this._makeCtx(thisMove, currentIndex, path)
        this.mode.onBlockPlaced(updatedCtx)
        this._refreshLerp()

        this.lineTracker.trackPlacement(placed.blockInfo.position)
      }
    }

    await this._attemptBreak(thisMove)

    this._applyMovement(thisMove, modeResult, now)

    {
      const p = bot.entity.position
      const vel = bot.entity.velocity
      const xzSpd = Math.sqrt(vel.x ** 2 + vel.z ** 2).toFixed(3)
      const yawDeg = (bot.entity.yaw * RAD2DEG).toFixed(1)
      const pitchDeg = (bot.entity.pitch * RAD2DEG).toFixed(1)
      const sneak = bot.getControlState('sneak')
      const jump = bot.getControlState('jump')
      const fwd = bot.getControlState('forward')
      const back = bot.getControlState('back')
      const left = bot.getControlState('left')
      const right = bot.getControlState('right')
      const sprint = bot.getControlState('sprint')
      console.log(
        `[bridge tick] t=${tickCount} pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) ` +
        `yaw=${yawDeg}° pitch=${pitchDeg}° ` +
        `sneak=${sneak} jump=${jump} sprint=${sprint} fwd=${fwd} back=${back} left=${left} right=${right} ` +
        `onGnd=${bot.entity.onGround} xzSpd=${xzSpd} ` +
        `placed=${this.placedThisMove} allowPlace=${modeResult.allowPlace} ` +
        `total to place=${this.toPlaceLen()}` +
        ` vel=(${vel.x.toFixed(3)},${vel.y.toFixed(3)},${vel.z.toFixed(3)})`
      )
    }

    const targetMove = path[this.splicedEndIndex] ?? thisMove

    if (this._hasOvershot(thisMove, targetMove)) {
      console.log(
        `[bridge dbg] overshoot detected — forcing completion ` +
        `pos=(${bot.entity.position.x.toFixed(2)},${bot.entity.position.y.toFixed(2)},${bot.entity.position.z.toFixed(2)}) ` +
        `target=(${targetMove.exitPos.x.toFixed(2)},${targetMove.exitPos.y.toFixed(2)},${targetMove.exitPos.z.toFixed(2)})`
      )
      this.mode.onMoveEnd()
      this._clearSuppressPathReset()
      return true
    }

    const execComplete = this._isExecutionComplete(thisMove, targetMove, path, currentIndex)
    if (execComplete) {
      const delta = this.splicedEndIndex - currentIndex
      this.mode.onMoveEnd()
      this._clearSuppressPathReset()
      return delta > 0 ? delta : true
    }

    return false
  }

  override reset(): void {
    this._clearSuppressPathReset()
    super.reset()
  }

  private _clearSuppressPathReset(): void {
    const pf = (this.bot as any).pathfinder
    if (pf != null) pf.suppressPathReset = false
  }

  private _refreshLerp(): void {
    const [minY, maxY] = this.bridgeConfig.rotation.lerpYaw
    const [minP, maxP] = this.bridgeConfig.rotation.lerpPitch
    this._lerpYaw = randFloat(minY, maxY)
    this._lerpPitch = randFloat(minP, maxP)
  }

  private _getPendingPlacements(path: Move[], startIndex: number): PlaceHandler[] {
    const placements: PlaceHandler[] = []

    for (let i = startIndex; i <= this.splicedEndIndex; i++) {
      const move = path[i]
      if (move == null) break

      for (const place of move.toPlace) {
        if (!(place instanceof PlaceHandler)) continue
        if (place.done) continue
        if (place.isPerforming) continue
        if (!place.needToPerform(this.bot)) continue
        placements.push(place)
      }
    }

    return placements
  }

  private _getNextPlaceCandidate(path: Move[], startIndex: number): PlaceHandler | null {
    for (let i = startIndex; i <= this.splicedEndIndex; i++) {
      const move = path[i]
      if (move == null) break

      for (const place of move.toPlace) {
        if (!(place instanceof PlaceHandler)) continue
        if (place.done) continue
        if (place.isPerforming) continue
        if (!place.needToPerform(this.bot)) continue
        return place
      }
    }

    return null
  }

  private _isExecutionComplete(
    thisMove: Move,
    targetMove: Move,
    path: Move[],
    currentIndex: number
  ): boolean {
    if (this.toBreakLen() > 0) return false

    for (let i = currentIndex; i <= this.splicedEndIndex; i++) {
      const move = path[i]
      if (move == null) break

      for (const place of move.toPlace) {
        if (!place.done) return false
      }
    }

    return this.isComplete(thisMove, targetMove)
  }

  private _isInWater(): boolean {
    if ((this.bot.entity as any).isInWater as boolean) return true
    if (this.bot.entity.onGround) return false
    return this.getBlockInfo(this.bot.entity.position, 0, -0.6, 0).liquid
  }

  private _shouldElevate(): boolean {
    const goal = this.bot.pathfinder?.currentGoal
    if (goal == null) return false

    const x = (goal as any).x ?? (goal as any).entity?.position?.x
    const z = (goal as any).z ?? (goal as any).entity?.position?.z
    if (x == null || z == null) return false

    const pos = this.bot.entity.position
    const xzDist = Math.sqrt((pos.x - x) ** 2 + (pos.z - z) ** 2)
    if (xzDist <= this.bridgeConfig.elevatedBridgeThreshold) return false

    const goalY = (goal as any).y ?? (goal as any).entity?.position?.y
    if (goalY == null) return false
    return goalY - pos.y > 1
  }

  private _applyRotation(
    move: Move,
    targetYaw: number | null,
    targetPitch: number | null
  ): void {
    const yaw = targetYaw ?? this._defaultYaw(move)
    const pitch = targetPitch ?? this._defaultPitch()

    const currentYaw = this.bot.entity.yaw
    const currentPitch = this.bot.entity.pitch

    let dyaw = shortestYawDelta(currentYaw, yaw)

    const maxTurn = this.bridgeConfig.rotation.maxTurnRadPerTick
    if (Math.abs(dyaw) > maxTurn) {
      dyaw = Math.sign(dyaw) * maxTurn
    }

    const rawStep = dyaw * this._lerpYaw
    const step = Math.abs(dyaw) <= BridgeExecutor.MIN_YAW_DELTA_RAD
      ? dyaw
      : (Math.abs(rawStep) < BridgeExecutor.MIN_YAW_DELTA_RAD
        ? Math.sign(rawStep !== 0 ? rawStep : 1) * BridgeExecutor.MIN_YAW_DELTA_RAD
        : rawStep)

    console.log(yaw * RAD2DEG, targetYaw ? targetYaw * RAD2DEG : null)
    this.bot.entity.yaw = currentYaw + step
    this.bot.entity.pitch = currentPitch + (pitch - currentPitch) * this._lerpPitch
  }

  private _defaultYaw(move: Move): number {
    const pos = this.bot.entity.position
    return Math.atan2(-(move.exitPos.x - pos.x), -(move.exitPos.z - pos.z))
  }

  private _defaultPitch(): number {
    return -(70 * (Math.PI / 180))
  }

  private async _attemptMousePlacement(path: Move[], startIndex: number): Promise<PlaceHandler | null> {
    const place = this._getNextPlaceCandidate(path, startIndex)
    if (place == null) {
      console.log('nothing to place.')
      return null
    }

    const item = place.getItem(this.bot)
    if (item == null) return null

    if (place.getCurrentItem(this.bot) !== item) {
      void place.equipItem(this.bot, item)
      return null;
    }

    void (this.bot as any).rightClick()

      ; (place as any)._done = true
      ; (place as any)._internalLock = false

    return place
  }

  private async _attemptBreak(move: Move): Promise<void> {
    for (const breakHandler of move.toBreak) {
      if (breakHandler.done) continue
      if (breakHandler.isPerforming) continue
      if (!(breakHandler instanceof BreakHandler)) continue
      if (!breakHandler.needToPerform(this.bot)) continue

      const block = breakHandler.getBlock(this.world)
      const item = block != null ? breakHandler.getItem(this.bot, block) : null

      void breakHandler._perform(this.bot, item, {}).catch(() => { })
      return
    }
  }

  private _applyMovement(
    move: Move,
    modeResult: ModeTickResult,
    nowMs: number
  ): void {
    const bot = this.bot

    if (this._forceStopMovementThisTick) {
      bot.setControlState('forward', false)
      bot.setControlState('back', false)
      bot.setControlState('left', false)
      bot.setControlState('right', false)
      bot.setControlState('sprint', false)
      bot.setControlState('sneak', true)
      bot.setControlState('jump', false)
      return
    }

    const needsElevatedJump = this.elevated &&
      nowMs >= this.elevatedJumpCooldownUntilMs &&
      bot.entity.onGround

    const finalJump = modeResult.wantJump || needsElevatedJump
    const finalSneak = modeResult.wantSneak && !finalJump

    if (needsElevatedJump) {
      this.elevatedJumpCooldownUntilMs = nowMs + randFloat(400, 550)
    }

    bot.setControlState('sneak', finalSneak)
    bot.setControlState('jump', false)
    bot.setControlState('sprint', modeResult.wantSprint && !finalSneak)

    if (modeResult.movementOverride != null) {
      const ov = modeResult.movementOverride
      if (ov.norm() < 0.01) {
        bot.setControlState('forward', false)
        bot.setControlState('back', false)
        bot.setControlState('left', false)
        bot.setControlState('right', false)
      } else {
        this._applyDirectionalVector(ov, modeResult.useStrafe)
      }
    } else {
      if (modeResult.targetYaw != null || modeResult.targetPitch != null) {
        console.log(
          'applying lookAt in movement override with targetYaw or targetPitch: ',
          modeResult.targetYaw! * RAD2DEG,
          modeResult.targetPitch! * RAD2DEG
        )

        const yaw = modeResult.targetYaw ?? bot.entity.yaw
        const pitch = modeResult.targetPitch ?? bot.entity.pitch

        const dir = getViewDir({ yaw, pitch }).plus(this.bot.entity.position.offset(0, 1.62, 0))

        void this.postInitAlignToPath(move, { sprint: modeResult.wantSprint && !finalSneak, lookAt: dir })
        return
      } else {
        void this.postInitAlignToPath(move, { sprint: modeResult.wantSprint && !finalSneak })
        return
      }
    }
  }

  private _applyDirectionalVector(vec: Vec3, useStrafe = true): void {

    const bot = this.bot
    const yaw = bot.entity.yaw
    const cosYaw = Math.cos(yaw)
    const sinYaw = Math.sin(yaw)

    const fwdDot = -sinYaw * vec.x - cosYaw * vec.z
    const rightDot = -cosYaw * vec.x + sinYaw * vec.z

    const EPS = 1e-2

    console.log('applying vector:', vec, rightDot, fwdDot)

    bot.setControlState('forward', fwdDot > EPS)
    bot.setControlState('back', fwdDot < -EPS)

    if (useStrafe) {
      bot.setControlState('right', rightDot < -EPS)
      bot.setControlState('left', rightDot > EPS)
    } else {
      bot.setControlState('right', false)
      bot.setControlState('left', false)
    }


  }

  /**
   * Returns true when the bot has traveled more than 1.5 blocks past the
   * target move's exit position in the direction of the planned path.
   *
   * This catches the case where diagonal strafe causes sideways drift so
   * severe that the AABB-based isComplete() can never fire.
   */
  private _hasOvershot(startMove: Move, targetMove: Move): boolean {
    const pos = this.bot.entity.position
    const dir = new Vec3(
      targetMove.exitPos.x - startMove.entryPos.x,
      0,
      targetMove.exitPos.z - startMove.entryPos.z
    )
    if (dir.norm() < 0.001) return false
    const dirN = dir.normalize()

    const toBot = new Vec3(
      pos.x - targetMove.exitPos.x,
      0,
      pos.z - targetMove.exitPos.z
    )
    return toBot.dot(dirN) > 1.5
  }

  private _makeCtx(
    move: Move,
    currentIndex: number,
    path: Move[]
  ): TickContext {
    return {
      move,
      nowMs: Date.now(),
      path,
      pathIndex: currentIndex,
      lineTracker: this.lineTracker,
      placedThisMove: this.placedThisMove,
      totalBlockCount: this._countBlocks()
    }
  }

  private _countBlocks(): number {
    let count = 0
    for (let i = 0; i < 9; i++) {
      const slot = this.bot.inventory.slots[36 + i]
      if (slot != null && slot.count > 0 && BlockInfo.scaffoldingBlockItems.has(slot.type)) {
        count += slot.count
      }
    }
    return count
  }
}