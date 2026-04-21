import { Bot } from 'mineflayer'
import { AABB } from '@nxg-org/mineflayer-util-plugin'
import { BotcraftPhysics, ControlStateHandler, EPhysicsCtx, SimulationGoal } from '@nxg-org/mineflayer-physics-util'
import { Vec3 } from 'vec3'
import { getUnderlyingBBs } from '../../../src/mineflayer-specific/movements/movementUtils'
import { JumpSim } from '../../../src/mineflayer-specific/movements/simulators/jumpSim'
import { World } from '../../../src/mineflayer-specific/world/worldInterface'
import { applyNeoLook } from './neo-rotate-utils'

export interface NeoJumpHelperOptions {
  maxYawStepRadPerTick?: number
}

/**
 * Neo jump helper.
 *
 * This keeps the same general API shape as the parkour helper, but the jump
 * simulation now rotates the camera gradually per tick instead of snapping
 * straight to the target.
 */
export class NeoJumpHelper {
  public readonly sim: JumpSim

  private readonly bot: Bot
  private readonly world: World
  private readonly maxYawStepRadPerTick: number

  constructor (bot: Bot, world: World, opts: NeoJumpHelperOptions = {}) {
    this.bot = bot
    this.world = world
    this.sim = new JumpSim(new BotcraftPhysics(bot.registry), world)
    this.maxYawStepRadPerTick = opts.maxYawStepRadPerTick ?? (Math.PI / 12)
  }

  public findGoalVertex (goal: AABB): Vec3 {
    const pos = this.bot.entity.position
    const closerX = goal.minX - pos.x < pos.x - goal.maxX ? goal.maxX : goal.minX
    const closerZ = goal.minZ - pos.z < pos.z - goal.maxZ ? goal.maxZ : goal.minZ

    const verts = [
      new Vec3(closerX, goal.maxY, closerZ),
      new Vec3(closerX, goal.maxY, goal.minZ),
      new Vec3(closerX, goal.maxY, goal.maxZ),
      new Vec3(goal.minX, goal.maxY, closerZ),
      new Vec3(goal.maxX, goal.maxY, closerZ)
    ]

    if (goal.minX - pos.x < 1 && pos.x - goal.maxX < 1) {
      verts.push(new Vec3(goal.maxX - pos.x + goal.minX, goal.maxY, goal.minZ))
      verts.push(new Vec3(goal.maxX - pos.x + goal.minX, goal.maxY, goal.maxZ))
    }

    if (goal.minZ - pos.z < 1 && pos.z - goal.maxZ < 1) {
      verts.push(new Vec3(goal.minX, goal.maxY, goal.maxZ - pos.z + goal.minZ))
      verts.push(new Vec3(goal.maxX, goal.maxY, goal.maxZ - pos.z + goal.minZ))
    }

    let minDist = Infinity
    let minVert = verts[0]
    for (const vert of verts) {
      const dist = vert.distanceTo(pos)
      if (dist < minDist) {
        minDist = dist
        minVert = vert
      }
    }

    return minVert
  }

  public findBackupVertex (bbs: AABB[], goalVert: Vec3, orgPos: Vec3 = this.bot.entity.position): Vec3 {
    const verts = bbs.flatMap((bb) => bb.toVertices())
    if (verts.length === 0) return orgPos.clone()

    let bestVert = verts[0]
    let bestDist = bestVert.distanceTo(goalVert)
    let bestOrgDist = bestVert.distanceTo(orgPos)

    for (const vert of verts.slice(1)) {
      const dist = vert.distanceTo(goalVert)
      const orgDist = vert.distanceTo(orgPos)

      if (dist > bestDist + 1e-6) {
        bestVert = vert
        bestDist = dist
        bestOrgDist = orgDist
        continue
      }

      if (Math.abs(dist - bestDist) <= 1e-6 && orgDist < bestOrgDist) {
        bestVert = vert
        bestOrgDist = orgDist
      }
    }

    const offsetX = Math.sign(bestVert.x - goalVert.x) * 0.3
    const offsetZ = Math.sign(bestVert.z - goalVert.z) * 0.3
    return this._snapSharedAxesToFaceCenter(bestVert.clone().offset(offsetX, 0, offsetZ), goalVert)
  }

  private _snapSharedAxesToFaceCenter (backupVert: Vec3, goalVert: Vec3): Vec3 {
    const result = backupVert.clone()

    if (Math.abs(result.x - goalVert.x) <= 1e-6) {
      result.x = Math.floor(goalVert.x) + 0.5
    }

    if (Math.abs(result.z - goalVert.z) <= 1e-6) {
      result.z = Math.floor(goalVert.z) + 0.5
    }

    return result
  }

  private _makeAimController (target: Vec3) {
    return (state: any) => {
      applyNeoLook(state, target, this.maxYawStepRadPerTick)
    }
  }

  private _makeMovementController (goal: Vec3, sprint: boolean, jump: boolean, jumpAfter = 0) {
    return (state: any, ticks: number) => {
      state.control.set('sneak', false)
      state.control.set('jump', state.onGround && jump && ticks >= jumpAfter)
      state.control.set('sprint', sprint)
      state.control.set('forward', true)
    }
  }

  private _simulateNeoMove (
    goal: Vec3,
    eyeTarget?: Vec3,
    jump = true,
    ...constraints: SimulationGoal[]
  ): boolean {
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    const goalBBs = this.world.getBlockInfo(goal).getBBs()
    const target = eyeTarget ?? goal

    const reachedGoal = JumpSim.getReachedAABB(goalBBs)
    let reached: SimulationGoal = (state, ticks) => reachedGoal(state, ticks)

    if (constraints.length > 0) {
      const prevReached = reached
      reached = (state, ticks) => constraints.every((constraint) => constraint(state, ticks) as boolean) && prevReached(state, ticks)
    }

    const state = this.sim.simulateUntil(
      reached,
      JumpSim.getCleanupPosition(target),
      JumpSim.buildFullController(
        this._makeAimController(target),
        JumpSim.getControllerStrafeAim(target, true),
        JumpSim.getControllerSmartMovement(target, true),
        this._makeMovementController(target, true, jump)
      ),
      ctx,
      this.world,
      45
    )

    return reached(state, 0) as boolean
  }

  public simForwardMove (goal: Vec3, eyeTarget?: Vec3, jump = true, ...constraints: SimulationGoal[]): boolean {
    return this._simulateNeoMove(goal, eyeTarget, jump, ...constraints)
  }

  public simJumpFromEdge (srcBBs: AABB[], goal: Vec3, eyeTarget?: Vec3): boolean {
    const goalVert = eyeTarget ?? this.findGoalVertex(AABB.fromBlockPos(goal))
    const goalBBs = this.world.getBlockInfo(goal).getBBs()
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)

    const state = this.sim.simulateUntil(
      JumpSim.getReachedAABB(goalBBs),
      JumpSim.getCleanupPosition(goalVert),
      JumpSim.buildFullController(
        this._makeAimController(goalVert),
        JumpSim.getControllerStrafeAim(goalVert, true),
        JumpSim.getControllerSmartMovement(goalVert, true),
        (state, ticks) => {
          state.control.sneak = false
          state.control.set('jump', false)
          state.control.set('sprint', true)
          state.control.set('forward', true)

          const playerBB = state.getBB()
          playerBB.expand(0, 1e-6, 0)
          if (ticks > 0 && srcBBs.every((src) => !src.intersects(playerBB))) {
            state.control.jump = true
          }
        }
      ),
      ctx,
      this.world,
      40
    )

    return JumpSim.getReachedAABB(goalBBs)(state, 0) as boolean
  }

  public simFallOffEdge (goal: Vec3, target?: Vec3): boolean {
    const goalVert = this.findGoalVertex(AABB.fromBlockPos(goal))
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    const goalBBs = this.world.getBlockInfo(goal).getBBs()

    ctx.state.control = ControlStateHandler.DEFAULT()
    if (target) applyNeoLook(ctx.state, target, this.maxYawStepRadPerTick)
    ctx.state.control.set('forward', true)
    ctx.state.control.set('jump', false)
    ctx.state.control.set('sprint', true)

    const reached0 = JumpSim.getReachedAABB(goalBBs)
    const reached: SimulationGoal = (state, ticks) => state.onGround && reached0(state, ticks)

    const state = this.sim.simulateUntil(
      reached,
      JumpSim.getCleanupPosition(goalVert),
      (state, ticks) => {
        applyNeoLook(state, goalVert, this.maxYawStepRadPerTick)
        state.control.set('forward', true)
        state.control.set('sprint', true)
        state.control.set('jump', false)
      },
      ctx,
      this.world,
      45
    )

    return reached0(state, 0) as boolean
  }

  public simBackupJump (goal: Vec3, eyeTarget?: Vec3, backupTarget?: Vec3, orgPos: Vec3 = this.bot.entity.position): boolean {
    const bbs = getUnderlyingBBs(this.world, orgPos, 0.6)
    const goalBBs = this.world.getBlockInfo(goal).getBBs()
    const goalVert = eyeTarget ?? this.findGoalVertex(AABB.fromBlockPos(goal))
    const lazyFix = backupTarget ?? this.findBackupVertex(bbs, goalVert)
    const reached = JumpSim.getReachedAABB(goalBBs)
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)

    this.sim.simulateBackUpBeforeJump(ctx, lazyFix, true, true, 40)
    const state = this.sim.simulateUntil(
      reached,
      JumpSim.getCleanupPosition(goalVert),
      JumpSim.buildFullController(
        this._makeAimController(goalVert),
        JumpSim.getControllerStrafeAim(goalVert, true),
        JumpSim.getControllerSmartMovement(goalVert, true),
        this._makeMovementController(goalVert, true, true)
      ),
      ctx,
      this.world,
      40
    )
    return reached(state, 0) as boolean
  }
}

export { NeoJumpHelper as ParkourJumpHelper }
