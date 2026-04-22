import { AABB } from '@nxg-org/mineflayer-util-plugin'
import { ControlStateHandler } from '@nxg-org/mineflayer-physics-util'
import { Vec3 } from 'vec3'
import { goals, Move } from '../../../src'
import { CancelError } from '../../../src/mineflayer-specific/exceptions'
import { botSmartMovement, botStrafeMovement } from '../../../src/mineflayer-specific/movements/controls'
import { CompleteOpts, MovementExecutor } from '../../../src/mineflayer-specific/movements/movementExecutor'
import { ParkourJumpHelper, getUnderlyingBBs } from '../../../src/mineflayer-specific/movements/movementUtils'
import { World } from '../../../src/mineflayer-specific/world/worldInterface'
import { MovementOptions } from '../../../src/mineflayer-specific/movements'

export interface AroundCornerExecutorSettings {
  aroundCornerWaitForVelocitySettle?: boolean
}

/**
 * Around-the-corner diagonal executor.
 *
 * This is intentionally parkour-like rather than ladder-like:
 * - it uses a normal jump state machine
 * - it aims at the landing block, not a ladder-backed fallback
 * - ladder metadata is only used to refine the aim when the provider found one
 */
export class AroundCornerDiagonalExecutor extends MovementExecutor {
  private readonly jumpHelper: ParkourJumpHelper = new ParkourJumpHelper(this.bot, this.world)

  private executing = false
  private lockedYaw: number | null = null
  private backingUp = false
  private backupSettling = false
  private backupAttempted = false
  private backupTarget: Vec3 | null = null
  private _lookAtInFlight: Promise<void> | null = null
  private _pendingLookTarget: Vec3 | null = null

  protected static readonly APPROACH_YAW_EPS: number = 0.12
  private readonly waitForVelocitySettle: boolean

  constructor(bot: import('mineflayer').Bot, world: World, settings: Partial<MovementOptions> & AroundCornerExecutorSettings = {}) {
    super(bot, world, settings)
    this.waitForVelocitySettle = settings.aroundCornerWaitForVelocitySettle ?? true
  }

  protected isComplete(startMove: Move, endMove?: Move, opts: CompleteOpts = {}): boolean {
    return super.isComplete(startMove, endMove, opts)
  }

  override reset(): void {
    this.executing = false
    this.lockedYaw = null
    this.backingUp = false
    this.backupSettling = false
    this.backupAttempted = false
    this.backupTarget = null
    this._lookAtInFlight = null
    this._pendingLookTarget = null
    super.reset()
  }

  protected _debugLog(..._args: unknown[]): void {
    // Kept quiet for now.
  }

  protected _lockCurrentYaw(targetYaw: number): void {
    this.lockedYaw = targetYaw
  }

  protected _clearLockedYaw(): void {
    this.lockedYaw = null
  }

  protected _applyLockedYaw(): void {
    if (this.lockedYaw != null) {
      this.bot.entity.yaw = this.lockedYaw
    }
  }

  protected _getTargetBlock(thisMove: Move): Vec3 {
    return thisMove.exitPos.offset(0, -1, 0)
  }

  protected _getLadderSupport(thisMove: Move): Vec3 | null {
    const support = thisMove.metadata?.ladderSupport
    if (support == null) return null
    if (support instanceof Vec3) return support
    if (typeof support.x === 'number' && typeof support.y === 'number' && typeof support.z === 'number') {
      return new Vec3(support.x, support.y, support.z)
    }
    return null
  }

  protected _getTargetEyeVec(thisMove: Move): Vec3 {
    const target = this._getTargetBlock(thisMove)
    const ladderSupport = this._getLadderSupport(thisMove)

    if (ladderSupport != null) {
      const ladderInfo = this.getBlockInfoRaw(ladderSupport)
      const ladderFace = this._getTouchingLadderFace(ladderInfo.getBBs(), AABB.fromBlockPos(target))
      if (ladderFace != null) return ladderFace
    }

    return this.jumpHelper.findGoalVertex(AABB.fromBlockPos(target))
  }

  protected _getTouchingLadderFace(ladderBBs: AABB[], supportBB: AABB): Vec3 | null {
    for (const ladderBB of ladderBBs) {
      if (!ladderBB.collides(supportBB)) continue

      const contact = ladderBB.intersect(supportBB)
      return contact.getCenter()
    }

    return null
  }

  protected _getUnderlyingBbs(thisMove: Move): AABB[] {
    const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6)
    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos.offset(0, -1, 0)))
    }
    return bbs
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
    return this._yawDeltaAbs(this._desiredYawTo(target)) <= AroundCornerDiagonalExecutor.APPROACH_YAW_EPS
  }

  protected _queueLookAtSync(target: Vec3): Promise<void> {
    this._pendingLookTarget = target.offset(0, this.bot.entity.position.y - target.y, 0)

    if (this._lookAtInFlight != null) return this._lookAtInFlight

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

  protected _clearBackupState(): void {
    this.backingUp = false
    this.backupSettling = false
    this.backupTarget = null
  }

  protected _getBackupTarget(thisMove: Move): Vec3 | null {
    const targetEyeVec = this._getTargetEyeVec(thisMove)
    const pos = thisMove.entryPos
    return this.jumpHelper.findViableBackupVertex(this._getTargetBlock(thisMove), targetEyeVec, pos)
  }

  protected _shouldSneakDuringBackup(thisMove: Move, target: Vec3): boolean {
    if (this.bot.entity.position.xzDistanceTo(target) < 0.1) return true

    const controls = ControlStateHandler.COPY_BOT(this.bot).set('sneak', false).set('jump', false)
    const ectx = this.simForward({ ticks: 2, controls })
    return ectx.state.pos.y < this.bot.entity.position.y && !ectx.state.onGround
  }

  protected _applyBackupControls(thisMove: Move, target: Vec3): void {
    this._lockCurrentYaw(this._desiredYawTo(target))
    void this._queueLookAtSync(target)
    this.bot.clearControlStates()
    botSmartMovement(this.bot, target, true)
    botStrafeMovement(this.bot, target, true)
    this.bot.setControlState('sneak', this._shouldSneakDuringBackup(thisMove, target))
  }

  protected _startBackup(thisMove: Move): boolean {
    this.backupTarget ??= this._getBackupTarget(thisMove)
    if (this.backupTarget == null) return false

    this.backingUp = true
    this.backupAttempted = true
    this._applyBackupControls(thisMove, this.backupTarget)
    return true
  }

  protected _advanceBackup(thisMove: Move): 'backing' | 'recheck' | 'jump' | 'failed' {
    this.backupTarget ??= this._getBackupTarget(thisMove)
    if (this.backupTarget == null) return 'failed'

    const jumpState = this._getJumpState(thisMove)
    if (jumpState.canJumpFromEdge) {
      this._clearBackupState()
      this._clearLockedYaw()
      this.bot.clearControlStates()
      return 'jump'
    }

    const dist = this.bot.entity.position.xzDistanceTo(this.backupTarget)
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)

    if (dist > 0.08) {
      this.backupSettling = false
      this._applyBackupControls(thisMove, this.backupTarget)
      return 'backing'
    }

    this.backupSettling = true
    this.bot.clearControlStates()
    this.bot.setControlState('sneak', this._shouldSneakDuringBackup(thisMove, this.backupTarget))

    if (this.waitForVelocitySettle && xzVel.norm() > 0.05) {
      return 'backing'
    }

    this._clearBackupState()
    this._clearLockedYaw()
    this.bot.clearControlStates()
    return 'recheck'
  }

  protected _getJumpState(thisMove: Move): {
    target: Vec3
    targetEyeVec: Vec3
    canDirectJump: boolean
    canJumpFromEdge: boolean
    fallOffEdge: boolean
  } {
    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(thisMove)
    const bbs = this._getUnderlyingBbs(thisMove)

    return {
      target,
      targetEyeVec,
      canDirectJump: this.jumpHelper.simForwardMove(target, targetEyeVec),
      canJumpFromEdge: this.jumpHelper.simJumpFromEdge(bbs, target),
      fallOffEdge: thisMove.entryPos.y > thisMove.exitPos.y && this.jumpHelper.simFallOffEdge(target)
    }
  }

  protected _clearApproachControls(): void {
    this.bot.setControlState('forward', false)
    this.bot.setControlState('back', false)
    this.bot.setControlState('left', false)
    this.bot.setControlState('right', false)
    this.bot.setControlState('jump', false)
    this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', false)
  }

  protected _applyExecutionControls(_thisMove: Move, _target: Vec3): void {
    this._applyLockedYaw()
    this.bot.clearControlStates()

    const ectx = this.simForward({ ticks: 1 })
    const ladderCollideJump = ectx.state.isCollidedHorizontally
    const jump = ladderCollideJump || (ectx.position.y < this.bot.entity.position.y && !ectx.state.onGround)

    this.bot.setControlState('forward', true)
    this.bot.setControlState('sprint', true)
    this.bot.setControlState('back', false)
    this.bot.setControlState('jump', jump)
    this.bot.setControlState('sneak', false)
  }

  protected _startExecution(target: Vec3, thisMove: Move): void {
    this.executing = true
    this._lockCurrentYaw(this._desiredYawTo(target))
    this._applyExecutionControls(thisMove, target)
  }

  override async align(thisMove: Move, _tickCount: number, _goal: goals.Goal): Promise<boolean> {
    this.executing = false
    this._clearLockedYaw()

    while (true) {
      if (this.tooLowCheck(thisMove)) {
        const botY = this.getTooLowCheckY()
        throw new CancelError(`y level: too low! ${botY}, ${thisMove.entryPos.y} ${thisMove.exitPos.y}`)
      }

      if (this.backingUp) {
        const backupState = this._advanceBackup(thisMove)
        if (backupState === 'backing') return false
        if (backupState === 'jump') continue
      }

      const jumpState = this._getJumpState(thisMove)
      const { targetEyeVec, canDirectJump, canJumpFromEdge, fallOffEdge } = jumpState

      void this._queueLookAtSync(targetEyeVec)

      if (canDirectJump || fallOffEdge) {
        if (!this._isYawAlignedForApproach(targetEyeVec)) {
          this._clearApproachControls()
          return false
        }

        this._clearBackupState()
        this._startExecution(targetEyeVec, thisMove)
        return true
      }

      if (canJumpFromEdge) {
        if (!this._isYawAlignedForApproach(targetEyeVec)) {
          this._clearApproachControls()
          return false
        }

        this._clearBackupState()
        this._startExecution(targetEyeVec, thisMove)
        return true
      }

      if (this.backupAttempted) {
        this._clearBackupState()
        this._startExecution(targetEyeVec, thisMove)
        return true
      }

      if (this.bot.entity.onGround) {
        this.bot.clearControlStates()
      }

      if (this._startBackup(thisMove)) return false

      this._startExecution(targetEyeVec, thisMove)
      return true
    }
  }

  override async performInit(thisMove: Move, _currentIndex: number, _path: Move[]): Promise<void> {
    this._clearLockedYaw()
    this._clearBackupState()
    this.backupAttempted = false
  }

  override performPerTick(thisMove: Move, _tickCount: number, _currentIndex: number, _path: Move[]): boolean | Promise<boolean> {
    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(thisMove)

    if (this.backingUp) {
      const backupState = this._advanceBackup(thisMove)
      if (backupState === 'backing') return false
      if (backupState === 'jump') {
        this._startExecution(targetEyeVec, thisMove)
        return false
      }

      this._startExecution(targetEyeVec, thisMove)
      return false
    }

    if (this.executing) {
      this._lockCurrentYaw(this._desiredYawTo(targetEyeVec))
      this._applyExecutionControls(thisMove, targetEyeVec)
      return this.isComplete(thisMove)
    }

    const jumpState = this._getJumpState(thisMove)
    const { canDirectJump, canJumpFromEdge, fallOffEdge } = jumpState

    void this._queueLookAtSync(targetEyeVec)

    if (canDirectJump || fallOffEdge || canJumpFromEdge) {
      if (!this._isYawAlignedForApproach(targetEyeVec)) {
        this._clearApproachControls()
        return false
      }

      this._clearBackupState()
      this._startExecution(targetEyeVec, thisMove)
      return false
    }

    if (this.backupAttempted) {
      this._clearBackupState()
      this._startExecution(targetEyeVec, thisMove)
      return false
    }

    if (this._startBackup(thisMove)) return false

    this._startExecution(targetEyeVec, thisMove)
    return false
  }
}
