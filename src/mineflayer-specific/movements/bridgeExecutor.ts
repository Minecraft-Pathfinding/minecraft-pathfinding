import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Move } from '../move'
import { World } from '../world/worldInterface'
import { MovementExecutor } from './movementExecutor'
import { MovementOptions } from './movement'
import { PlaceHandler, BreakHandler } from './interactionUtils'
import { CancelError } from '../exceptions'
import * as goals from '../goals'

const debug = require('debug')
const log = debug('minecraft-pathfinding:BridgeExecutor')

const RAD75 = 75 * (Math.PI / 180)
const RAD_MAX_TURN = 0.4
const LERP_YAW = 0.65
const LERP_PITCH = 0.85
const EDGE_PROBE_DIST = 0.28
const PHASE_REACH_DIST = 0.6
const PLACE_COOLDOWN_MS = 110
const STALL_TIMEOUT_MS = 500

type PhaseType = 'walk' | 'bridge'

interface Phase {
  type: PhaseType
  start: Vec3
  target: Vec3
  dir: Vec3
  isDiagonal: boolean
}

export class BridgeExecutor extends MovementExecutor {
  private phases: Phase[] = []
  private phaseIdx = 0
  private placementCooldownUntilMs = 0
  private stallStartMs = 0

  constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings)
  }

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if (this._inWater()) {
      await super.align(thisMove, tickCount, goal)
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y)
      return this.isInitAligned(thisMove)
    }
    void this.postInitAlignToPath(thisMove)
    if (!this.bot.entity.onGround && this.bot.entity.position.y > thisMove.entryPos.y + 0.1) return false
    return this.isInitAligned(thisMove)
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.bot.clearControlStates()
    this.phaseIdx = 0
    this.placementCooldownUntilMs = 0
    this.stallStartMs = 0

    const entry = thisMove.entryPos
    const exit = thisMove.exitPos

    this.phases = this._buildPhases(entry, exit, thisMove.toPlace)
    log(`[BridgeExec] init: ${this.phases.length} phase(s), entry=${entry}, exit=${exit}`)

    await this.lookAtPathPos(exit)
  }

  async performPerTick (
    thisMove: Move,
    tickCount: number,
    currentIndex: number,
    path: Move[]
  ): Promise<boolean | number> {
    const bot = this.bot
    const pos = bot.entity.position
    const now = Date.now()

    if (this._inWater()) {
      if (pos.y < thisMove.exitPos.y) bot.setControlState('jump', true)
      void this.postInitAlignToPath(thisMove)
      return this._allPlaced(thisMove) && this.isComplete(thisMove)
    }

    if (!bot.entity.onGround && pos.y < Math.round(thisMove.entryPos.y) - 3) {
      throw new CancelError('BridgeExecutor: fell off path')
    }

    const xzVel = Math.sqrt(bot.entity.velocity.x ** 2 + bot.entity.velocity.z ** 2)
    const collidedH = (bot.entity as any).isCollidedHorizontally as boolean
    if (!bot.entity.onGround && (collidedH || xzVel < 0.01)) {
      if (this.stallStartMs === 0) this.stallStartMs = now
      if (now - this.stallStartMs > STALL_TIMEOUT_MS) throw new CancelError('BridgeExecutor: stalled')
    } else {
      this.stallStartMs = 0
    }

    await this._drainBreaks(thisMove)

    const phase = this.phases[this.phaseIdx]
    if (phase == null) {
      return this._allPlaced(thisMove) && this.isComplete(thisMove)
    }

    if (phase.type === 'walk') {
      this._execWalkPhase(phase)
      if (this._hasCrossedTarget(pos, phase)) {
        log(`[BridgeExec] walk phase ${this.phaseIdx} complete`)
        this.phaseIdx++
      }
      return false
    }

    this._applyYawPitch(phase.dir)

    const atEdge = this._atEdge(pos, phase.dir)
    const voidAhead = this._voidAhead(pos, phase.dir)

    bot.setControlState('sneak', atEdge && voidAhead)
    bot.setControlState('sprint', !atEdge && bot.food > 6)
    bot.setControlState('forward', true)
    bot.setControlState('jump', false)

    if (atEdge && voidAhead && now >= this.placementCooldownUntilMs) {
      const placed = this._attemptImmediatePlacement(thisMove)
      if (placed) {
        this.placementCooldownUntilMs = now + PLACE_COOLDOWN_MS
        bot.setControlState('sneak', false)
        log(`[BridgeExec] placed block, phase=${this.phaseIdx}, placed so far=${thisMove.toPlace.filter(p => p.done).length}`)
      }
    }

    if (this._hasCrossedTarget(pos, phase)) {
      log(`[BridgeExec] bridge phase ${this.phaseIdx} complete`)
      this.phaseIdx++
    }

    if (this.phaseIdx >= this.phases.length) {
      return this._allPlaced(thisMove) && this.isComplete(thisMove)
    }

    return false
  }

  override reset (): void {
    this._clearSuppressReset()
    super.reset()
  }

  private _buildPhases (entry: Vec3, exit: Vec3, toPlace: PlaceHandler[]): Phase[] {
    const dx = Math.round(exit.x - entry.x)
    const dz = Math.round(exit.z - entry.z)
    const absDx = Math.abs(dx)
    const absDz = Math.abs(dz)
    const signX = Math.sign(dx)
    const signZ = Math.sign(dz)

    const flEntry = entry.floored().offset(0.5, 0, 0.5)
    const flExit = exit.floored().offset(0.5, 0, 0.5)

    if (absDx === 0 && absDz === 0) {
      const dir = new Vec3(0, 0, 1)
      return [{ type: 'bridge', start: flEntry, target: flExit, dir, isDiagonal: false }]
    }

    if (absDx === 0 || absDz === 0) {
      const dir = new Vec3(signX, 0, signZ)
      return [{ type: 'bridge', start: flEntry, target: flExit, dir, isDiagonal: false }]
    }

    if (absDx === absDz) {
      const dir = new Vec3(signX, 0, signZ).normalize()
      return [{ type: 'bridge', start: flEntry, target: flExit, dir, isDiagonal: true }]
    }

    const minComp = Math.min(absDx, absDz)
    const maxComp = Math.max(absDx, absDz)
    const lateralSteps = maxComp - minComp

    const majorIsX = absDx >= absDz
    const cardDir = majorIsX ? new Vec3(signX, 0, 0) : new Vec3(0, 0, signZ)
    const diagDir = new Vec3(signX, 0, signZ).normalize()

    const needsBridgeSet = new Set<string>()
    for (const p of toPlace) {
      needsBridgeSet.add(`${Math.floor(p.x)},${Math.floor(p.z)}`)
    }

    if (this._prewalkFeasible(entry, cardDir, lateralSteps, needsBridgeSet)) {
      const prewalkEnd = flEntry.offset(cardDir.x * lateralSteps, 0, cardDir.z * lateralSteps)
      log(`[BridgeExec] strategy=prewalk-then-diagonal, lateralSteps=${lateralSteps}`)
      return [
        { type: 'walk', start: flEntry, target: prewalkEnd, dir: cardDir, isDiagonal: false },
        { type: 'bridge', start: prewalkEnd, target: flExit, dir: diagDir, isDiagonal: true }
      ]
    }

    const diagSteps = minComp
    const diagEnd = flEntry.offset(signX * diagSteps, 0, signZ * diagSteps)
    log(`[BridgeExec] strategy=diagonal-then-cardinal, diagSteps=${diagSteps}, cardSteps=${lateralSteps}`)
    return [
      { type: 'bridge', start: flEntry, target: diagEnd, dir: diagDir, isDiagonal: true },
      { type: 'bridge', start: diagEnd, target: flExit, dir: cardDir, isDiagonal: false }
    ]
  }

  private _prewalkFeasible (
    entry: Vec3,
    cardDir: Vec3,
    steps: number,
    needsBridgeSet: Set<string>
  ): boolean {
    for (let s = 1; s <= steps; s++) {
      const px = Math.floor(entry.x) + Math.round(cardDir.x * s)
      const pz = Math.floor(entry.z) + Math.round(cardDir.z * s)
      if (needsBridgeSet.has(`${px},${pz}`)) return false
      const ground = this.getBlockInfo({ x: px, y: entry.y, z: pz }, 0, -1, 0)
      if (!ground.physical && !ground.liquid) return false
    }
    return true
  }

  private _hasCrossedTarget (pos: Vec3, phase: Phase): boolean {
    const dir = phase.dir
    const toTarget = new Vec3(phase.target.x - phase.start.x, 0, phase.target.z - phase.start.z)
    const toBot = new Vec3(pos.x - phase.start.x, 0, pos.z - phase.start.z)
    const targetProj = toTarget.dot(dir)
    const botProj = toBot.dot(dir)
    return botProj >= targetProj - 0.12
  }

  private _execWalkPhase (phase: Phase): void {
    const bot = this.bot
    const target = phase.target
    const yaw = Math.atan2(-(target.x - bot.entity.position.x), -(target.z - bot.entity.position.z))
    this._lerpRotation(yaw, -0.2)
    bot.setControlState('forward', true)
    bot.setControlState('sprint', bot.food > 6)
    bot.setControlState('sneak', false)
    bot.setControlState('jump', false)
  }

  private _atEdge (pos: Vec3, dir: Vec3): boolean {
    const checkX = pos.x + dir.x * EDGE_PROBE_DIST
    const checkZ = pos.z + dir.z * EDGE_PROBE_DIST
    const support = this.getBlockInfo({ x: checkX, y: pos.y, z: checkZ }, 0, -1, 0)
    return !support.physical && !support.liquid
  }

  private _voidAhead (pos: Vec3, dir: Vec3): boolean {
    const ahead = this.getBlockInfo({ x: pos.x + dir.x * 0.6, y: pos.y, z: pos.z + dir.z * 0.6 }, 0, -1, 0)
    return !ahead.physical && !ahead.liquid
  }

  private _attemptImmediatePlacement (thisMove: Move): boolean {
    for (const place of thisMove.toPlace) {
      if (place.done) continue
      if (place.isPerforming) continue
      if (!(place instanceof PlaceHandler)) continue
      if (!place.needToPerform(this.bot)) continue

      const item = place.getItem(this.bot)
      if (item == null) continue

      if (place.getCurrentItem(this.bot) !== item) {
        void place.equipItem(this.bot, item)
        return false
      }

      void (this.bot as any).rightClick()
      ;(place as any)._done = true
      ;(place as any)._internalLock = false
      return true
    }
    return false
  }

  private async _drainBreaks (thisMove: Move): Promise<void> {
    for (const brk of thisMove.toBreak) {
      if (brk.done || brk.isPerforming) continue
      if (!(brk instanceof BreakHandler)) continue
      if (!brk.needToPerform(this.bot)) continue
      const block = brk.getBlock(this.world)
      const item = block != null ? brk.getItem(this.bot, block) : null
      void brk._perform(this.bot, item, {}).catch(() => {})
      return
    }
  }

  private _applyYawPitch (dir: Vec3): void {
    const targetYaw = Math.atan2(-dir.x, -dir.z)
    const targetPitch = -RAD75
    this._lerpRotation(targetYaw, targetPitch)
  }

  private _lerpRotation (targetYaw: number, targetPitch: number): void {
    const curYaw = this.bot.entity.yaw
    const curPitch = this.bot.entity.pitch

    const rawDelta = ((targetYaw - curYaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
    const clampedDelta = Math.abs(rawDelta) > RAD_MAX_TURN ? Math.sign(rawDelta) * RAD_MAX_TURN : rawDelta

    this.bot.entity.yaw = curYaw + clampedDelta * LERP_YAW
    this.bot.entity.pitch = curPitch + (targetPitch - curPitch) * LERP_PITCH
  }

  private _allPlaced (thisMove: Move): boolean {
    return thisMove.toPlace.every(p => p.done)
  }

  private _inWater (): boolean {
    if ((this.bot.entity as any).isInWater as boolean) return true
    if (this.bot.entity.onGround) return false
    return this.getBlockInfo(this.bot.entity.position, 0, -0.6, 0).liquid
  }

  private _clearSuppressReset (): void {
    const pf = (this.bot as any).pathfinder
    if (pf != null) pf.suppressPathReset = false
  }
}
