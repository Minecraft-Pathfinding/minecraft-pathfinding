import {
  BaseSimulator,
  BotcraftPhysics,
  ControlStateHandler,
  EPhysicsCtx,
  IEntityState,
  PlayerState,
  SimulationGoal
} from '@nxg-org/mineflayer-physics-util'
import { Bot } from 'mineflayer'
import { World } from '../world/worldInterface'
import v, { Vec3 } from 'vec3'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { JumpSim } from './simulators/jumpSim'
import type { Block } from '../../types'
import type { PCChunk } from 'prismarine-chunk'

interface JumpInfo {
  jumpTick: number
  sprintTick: number
  backTick: number
}

export function stateLookAt (state: IEntityState, point: Vec3): void {
  const delta = point.minus(state.pos.offset(0, state.height - 0.18, 0))
  const yaw = Math.atan2(-delta.x, -delta.z)
  const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z)
  const pitch = Math.atan2(delta.y, groundDistance)
  state.yaw = yaw
  state.pitch = pitch
}

export function isBlockTypeInChunks (info: Block | number, ...chunks: PCChunk[]): boolean {
  info = info instanceof Number ? info : (info as Block).stateId ?? -1

  for (const chunk of chunks) {
    for (const section of chunk.sections) {
      // console.log(section)

      // typing here is incorrect for PCChunk. Palette may be undefined.
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (section.palette) for (const id of section.palette) if (info === id) return true
    }
  }
  return false
}

export function getUnderlyingBBs (world: World, pos: Vec3, width: number, colliding = true): AABB[] {
  const verts = [
    pos.offset(-width / 2, -0.6, -width / 2),
    pos.offset(-width / 2, -0.6, width / 2),
    pos.offset(width / 2, -0.6, -width / 2),
    pos.offset(width / 2, -0.6, width / 2)
  ]

  // if (pos.y > 63.5) console.log(verts);

  // console.log('checking verts', verts, 'for blocks')
  const bb = AABBUtils.getPlayerAABB({ position: pos, width, height: 0.1 }) // whatever
  const blocks = new Set(verts.map((v) => world.getBlockInfo(v)))

  // console.log('BLOCKS', blocks, 'VERTS', verts)

  const ret = []
  for (const block of blocks) {
    // console.log(block.block?.name, block.getBBs())
    for (const bb0 of block.getBBs()) {
      // console.log(bb0.collides(bb) || !colliding, bb0.collides(bb), !colliding)
      if (bb0.collides(bb) || !colliding) {
        ret.push(bb0)
      }
    }
  }

  return ret
}

// type FallReason = 'coyote' | 'yChange' | 'none'

export function leavingBlockLevel (bot: Bot, world: World, ticks = 1, ectx?: EPhysicsCtx): boolean {
  const bbs = getUnderlyingBBs(world, bot.entity.position, 0.6)

  const minY = bbs.reduce((acc, bb) => Math.min(acc, bb.minY), Infinity)
  let ctx
  if (ectx != null) ctx = ectx
  else ctx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot)
  for (let i = 0; i < ticks; i++) {
    bot.physicsUtil.engine.simulate(ctx, world)
  }

  const bbs1 = getUnderlyingBBs(world, ctx.state.pos, 0.6)

  const minY1 = bbs1.reduce((acc, bb) => Math.min(acc, bb.minY), Infinity)

  const bad = ctx.state.pos.y < bot.entity.position.y

  // console.trace(minY, minY1, bot.entity.position, ctx.state.pos)
  if ((minY === Infinity || minY1 === Infinity) || bad) {
    return true
  }
  return minY1 < minY
  // console.log(minY, minY1)

  // const pBB = AABBUtils.getPlayerAABB({ position: ctx.state.pos, width: 0.6, height: 1.8 })
  // for (const bb of bbs) {
  //   if (pBB.collides(bb)) return false
  // }

  // return true
}

export class JumpCalculator {
  readonly engine: BaseSimulator<PlayerState>
  readonly bot: Bot
  ctx: EPhysicsCtx<PlayerState>
  readonly world: World

  constructor (sim: BaseSimulator<PlayerState>, bot: Bot, world: World, ctx: EPhysicsCtx<PlayerState>) {
    this.engine = sim
    this.bot = bot
    this.ctx = ctx
    this.world = world
  }

  public findJumpPoint (goal: Vec3, maxTicks = 20): JumpInfo | null {
    if (this.checkImmediateSprintJump(goal)) {
      return { jumpTick: 0, sprintTick: 0, backTick: Infinity }
    }

    let firstTick = 0
    let secondTick = 1

    // if less than zero, then we need to sprint before jumping.
    // we didn't cover enough distance to jump immediately.
    // if vel was up and we collided, we moved too far forward, so only sprint after jumping.
    const sprintAfterJump = this.ctx.state.vel.y > 0

    // console.log(this.ctx.state.pos, this.ctx.state.vel, goal, sprintAfterJump)
    while (firstTick < 12) {
      while (secondTick < 12 - firstTick) {
        const res = this.checkSprintJump(goal, firstTick, secondTick, sprintAfterJump)
        if (res) {
          return sprintAfterJump
            ? { jumpTick: firstTick, sprintTick: firstTick + secondTick, backTick: Infinity }
            : { jumpTick: firstTick + secondTick, sprintTick: firstTick, backTick: Infinity }
        }
        secondTick++
      }
      secondTick = 0
      firstTick++
    }

    let backTick = 1
    let sprintTick = 0
    while (backTick < 4) {
      while (sprintTick < 4 - backTick) {
        const res = this.checkSprintJump(goal, 0, sprintTick + backTick, true, backTick)
        if (res) {
          return { jumpTick: 0, sprintTick: sprintTick + backTick, backTick }
        }
        sprintTick++
      }
      sprintTick = 0
      backTick++
    }

    return null
  }

  protected resetState (): PlayerState {
    this.ctx = EPhysicsCtx.FROM_BOT(this.engine.ctx, this.bot)
    this.ctx.state.age = 0
    this.ctx.state.control = ControlStateHandler.DEFAULT()
    this.ctx.state.pos.set(this.bot.entity.position.x, this.bot.entity.position.y, this.bot.entity.position.z)
    this.ctx.state.vel.set(this.bot.entity.velocity.x, this.bot.entity.velocity.y, this.bot.entity.velocity.z)
    return this.ctx.state
  }

  protected checkImmediateSprintJump (goal: Vec3): boolean {
    const state = this.resetState()
    stateLookAt(state, goal)
    this.simJump(state)
    // console.log('immediate jump', state.pos, state.vel, goal)
    if (state.isCollidedHorizontally) return false
    if (state.onGround && state.pos.y === goal.y) return true
    return false
  }

  protected checkSprintJump (goal: Vec3, firstTicks = 0, secondTicks = 0, sprintAfterJump = false, backTicks = Infinity): boolean {
    const state = this.resetState()
    stateLookAt(state, goal)
    this.simJumpAdvanced(state, goal, {
      firstTicks,
      secondTicks,
      backTicks,
      sprintAfterJump,
      maxTicks: 20
    })
    // console.log(
    //   'sim jump',
    //   firstTicks,
    //   secondTicks,
    //   sprintAfterJump,
    //   backTicks,
    //   state.pos,
    //   state.control,
    //   state.age,
    //   goal,
    //   state.isCollidedHorizontally,
    //   state.isCollidedHorizontally,
    //   state.onGround
    // )
    if (state.isCollidedHorizontally) return false
    if (state.onGround && state.pos.y === goal.y) return true
    return false
  }

  protected simJump (state: PlayerState, maxTicks = 20): PlayerState {
    state.control.set('forward', true)
    state.control.set('jump', true)
    state.control.set('sprint', true)
    this.engine.simulateUntil(
      (state, ticks) => ticks > 0 && (state.onGround || state.isCollidedHorizontally),
      () => { },
      () => { },
      this.ctx,
      this.world,
      maxTicks
    )
    return state
  }

  protected simJumpAdvanced (
    state: PlayerState,
    goal: Vec3,
    opts: {
      firstTicks?: number
      secondTicks?: number
      backTicks?: number
      sprintAfterJump?: boolean
      maxTicks?: number
    } = {}
  ): PlayerState {
    // goddamnit ts-standard.
    const { firstTicks, secondTicks, backTicks, sprintAfterJump, maxTicks } = opts
    const ft = firstTicks ?? 0
    const st = secondTicks ?? 0
    const bt = backTicks ?? Infinity
    const sj = sprintAfterJump ?? false
    const mt = maxTicks ?? 20

    // console.log("in sim:", firstTicks, secondTicks, sprintAfterJump, maxTicks, state.control)
    this.engine.simulateUntil(
      (state, ticks) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const boundary = sj ? ft + st : ft
        // const xzVel = state.vel.offset(0, -state.vel.y, 0)
        // console.log(ticks, firstTicks, secondTicks, backTicks)
        // console.log('checking goal', state.control.get('jump'), state.control.get('forward'), state.control.get('back'), state.control.get('sprint'))
        // console.log(state.onGround, state.isCollidedHorizontally, state.isCollidedVertically, state.pos)
        // console.log(state.vel, xzVel.norm(), xzVel)
        return (state.control.get('jump') && state.onGround && ticks > boundary) || (ticks > 0 && state.isCollidedHorizontally)
      },
      () => { },
      (state, ticks) => {
        stateLookAt(state, goal)
        state.control.set('back', false)
        state.control.set('forward', false)
        state.control.set('jump', false)
        state.control.set('sprint', false)

        if (bt !== Infinity && ticks < bt) {
          state.control.set('back', true)
          state.control.set('jump', true)
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (ticks >= ft) {
          if (sj) state.control.set('jump', true)
          else {
            state.control.set('sprint', true)
            state.control.set('forward', true)
          }

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          if (ticks >= ft + st) {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (sj) {
              state.control.set('sprint', true)
              state.control.set('forward', true)
            } else {
              state.control.set('jump', true)
            }
          }
        }
        // console.log('sim jump',firstTicks, secondTicks, sprintAfterJump, ticks, state.pos, state.control)
      },
      this.ctx,
      this.world,
      mt
    )

    return state
  }
}

export class ParkourJumpHelper {
  public readonly sim: JumpSim
  private readonly bot: Bot
  private readonly world: World

  constructor (bot: Bot, world: World) {
    this.bot = bot
    this.sim = new JumpSim(new BotcraftPhysics(bot.registry), world)
    this.world = world
  }

  private _buildBackupCandidates (bbs: AABB[], goalVert: Vec3, orgPos: Vec3): Vec3[] {
    const candidates = new Map<string, Vec3>()

    for (const bb of bbs) {
      for (const vert of bb.toVertices()) {
        const offsetX = Math.sign(vert.x - goalVert.x) * 0.3
        const offsetZ = Math.sign(vert.z - goalVert.z) * 0.3
        const candidate = this._snapSharedAxesToFaceCenter(vert.clone().offset(offsetX, 0, offsetZ), goalVert)
        candidates.set(`${candidate.x},${candidate.y},${candidate.z}`, candidate)
      }
    }

    return [...candidates.values()].sort((a, b) => {
      const aOrgDist = a.xzDistanceTo(orgPos)
      const bOrgDist = b.xzDistanceTo(orgPos)
      if (Math.abs(aOrgDist - bOrgDist) > 1e-6) return aOrgDist - bOrgDist

      const aGoalDist = a.distanceTo(goalVert)
      const bGoalDist = b.distanceTo(goalVert)
      if (Math.abs(aGoalDist - bGoalDist) > 1e-6) return bGoalDist - aGoalDist

      return 0
    })
  }

  public findGoalVertex (goal: AABB): Vec3 {
    // get top vertex that is closest to target.

    const pos = this.bot.entity.position

    // When `goal.minX - pos.x < pos.x - goal.maxX` the bot is past the block's
    // centre on the X axis, meaning maxX is the nearer face — NOT minX.
    // The original code had the two branches swapped (always picked the far
    // corner), causing the bot to aim at the wrong vertex and fail the
    // yaw-alignment check before every diagonal parkour jump.
    const closerX = goal.minX - pos.x < pos.x - goal.maxX ? goal.maxX : goal.minX
    const closerZ = goal.minZ - pos.z < pos.z - goal.maxZ ? goal.maxZ : goal.minZ

    // 3 closest vectors to source position
    const verts = [
      v(closerX, goal.maxY, closerZ),
      v(closerX, goal.maxY, goal.minZ),
      v(closerX, goal.maxY, goal.maxZ),
      v(goal.minX, goal.maxY, closerZ),
      v(goal.maxX, goal.maxY, closerZ)
    ]

    // if position of bot and position of goal are less than 1 block on any axis away, push a vector that is a straight line to it.
    // for example: bot pos is 0.7,0,0 and goal is 0,0,0 to 1,0,1, then push 0.7,0,0

    if (goal.minX - pos.x < 1 && pos.x - goal.maxX < 1) {
      verts.push(v(goal.maxX - pos.x + goal.minX, goal.maxY, goal.minZ))
      verts.push(v(goal.maxX - pos.x + goal.minX, goal.maxY, goal.maxZ))
    }

    if (goal.minZ - pos.z < 1 && pos.z - goal.maxZ < 1) {
      verts.push(v(goal.minX, goal.maxY, goal.maxZ - pos.z + goal.minZ))
      verts.push(v(goal.maxX, goal.maxY, goal.maxZ - pos.z + goal.minZ))
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
    const candidates = this._buildBackupCandidates(bbs, goalVert, orgPos)
    return candidates[0] ?? orgPos.clone()
  }

  public findViableBackupVertex (goal: Vec3, eyeTarget?: Vec3, orgPos: Vec3 = this.bot.entity.position): Vec3 | null {
    const bbs = getUnderlyingBBs(this.world, orgPos, 0.6)
    const goalVert = eyeTarget ?? this.findGoalVertex(AABB.fromBlockPos(goal))

    for (const candidate of this._buildBackupCandidates(bbs, goalVert, orgPos)) {
      if (this.simBackupJump(goal, goalVert, candidate, orgPos)) {
        return candidate
      }
    }

    return null
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

  public simJumpFromEdge (srcBBs: AABB[], goal: Vec3, eyeTarget?: Vec3): boolean {
    // const bbs = this.getUnderlyingBBs(this.bot.entity.position, 0.6);
    // console.log(bbs)

    const goalVert = eyeTarget ?? this.findGoalVertex(AABB.fromBlockPos(goal))

    const goalBBs = this.world.getBlockInfo(goal).getBBs()

    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)

    const state = this.sim.simulateJumpFromEdgeOfBlock(ctx, srcBBs, goalVert, goalBBs, true, 40)

    // console.log('sim jump from edge', state.age, state.pos, goalVert, state.onGround, state.isCollidedHorizontally, state.control, state.isInWater)
    const reached = JumpSim.getReachedAABB(goalBBs)
    return reached(state, 0) as boolean
  }

  public simFallOffEdge (goal: Vec3, target?: Vec3): boolean {
    const goalVert = this.findGoalVertex(AABB.fromBlockPos(goal))

    // console.log('sim jump goals', goal, goalVert)
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)

    const goalBBs = this.world.getBlockInfo(goal).getBBs()

    ctx.state.control = ControlStateHandler.DEFAULT()
    if (target != null) stateLookAt(ctx.state, target)
    ctx.state.control.set('forward', true)
    ctx.state.control.set('jump', false)
    ctx.state.control.set('sprint', true)

    const orgPos = this.bot.entity.position.clone()

    const reached0 = JumpSim.getReachedAABB(goalBBs)
    const reached: SimulationGoal = (state, ticks) => state.onGround && reached0(state, ticks)
    // console.log('fall off edge init', orgPos)
    const state = this.sim.simulateUntil(
      reached,
      () => { },
      (state) => {
        if (state.pos.y === orgPos.y) {
          // console.log('fall off edge check', state.age, state.pos)
        }
        stateLookAt(state, goalVert)
      },
      ctx,
      this.world,
      45
    )

    // console.log(reached(state, 0), reached0(state, 0), reached0(state, 1), state.age, orgPos, state.pos, goal, state.onGround, state.isCollidedHorizontally, state.control);
    return reached0(state, 0) as boolean
  }

  public simForwardMove (goal: Vec3, eyeTarget?: Vec3, jump = true, ...constraints: SimulationGoal[]): boolean {
    // console.log('sim jump goals', goal, goalVert)
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    // const goalCenter = goal.floored().offset(0.5, 0, 0.5)

    const goalBBs = this.world.getBlockInfo(goal).getBBs()

    const target = eyeTarget ?? goal

    // const orgPos = this.bot.entity.position.clone()

    const g = JumpSim.getReachedAABB(goalBBs)
    let reached: SimulationGoal = (state, ticks) => {
      // if (state.pos.y >= orgPos.y)
      // console.log('sim check', state.age, state.pos)
      return g(state, ticks)
    }

    if (constraints.length > 0) {
      const old = reached
      reached = (state, ticks) => {
        for (const constraint of constraints) {
          if (!(constraint(state, ticks) as boolean)) return false
        }
        return old(state, ticks)
      }
    }

    const state = this.sim.simulateUntil(
      reached,
      JumpSim.getCleanupPosition(target),
      JumpSim.buildFullController(
        JumpSim.getControllerStraightAim(target),
        JumpSim.getControllerStrafeAim(target, true),
        JumpSim.getControllerSmartMovement(target, true),
        (state, ticks) => {
          state.control.sneak = false
          state.control.set('jump', jump && ticks === 0)
        }
      ),
      ctx,
      this.world,
      45
    )

    const testwtf = reached(state, 0) as boolean
    return testwtf
  }

  public simBackupJump (goal: Vec3, eyeTarget?: Vec3, backupTarget?: Vec3, orgPos: Vec3 = this.bot.entity.position): boolean {
    const bbs = getUnderlyingBBs(this.world, orgPos, 0.6)

    const goalBBs = this.world.getBlockInfo(goal).getBBs()
    const goalVert = eyeTarget ?? this.findGoalVertex(AABB.fromBlockPos(goal))
    const lazyFix = backupTarget ?? this.findBackupVertex(bbs, goalVert)

    const reached = JumpSim.getReachedAABB(goalBBs)

    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)

    this.sim.simulateBackUpBeforeJump(ctx, lazyFix, true, true, 40)
    const state = this.sim.simulateJumpFromEdgeOfBlock(ctx, bbs, goalVert, goalBBs, true, 40)
    return reached(state, 0) as boolean
  }
}
