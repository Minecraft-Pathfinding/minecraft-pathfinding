import {
  BaseSimulator,
  ControlStateHandler,
  EPhysicsCtx,
  EntityPhysics,
  EntityState,
  SimulationGoal
} from '@nxg-org/mineflayer-physics-util'
import { Bot } from 'mineflayer'
import { World } from '../world/worldInterface'
import v, { Vec3 } from 'vec3'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { JumpSim } from './simulators/jumpSim'
import { Block } from '../../types'
import type { PCChunk } from 'prismarine-chunk'

interface JumpInfo {
  jumpTick: number
  sprintTick: number
}

export function stateLookAt (state: EntityState, point: Vec3): void {
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

  const ret = []
  for (const block of blocks) {
    for (const bb0 of block.getBBs()) {
      if (bb0.collides(bb) || !colliding) {
        ret.push(bb0)
      }
    }
  }

  return ret
}

// type FallReason = 'coyote' | 'yChange' | 'none'

export function leavingBlockLevel (bot: Bot, world: World, ticks = 1): boolean {
  const bbs = getUnderlyingBBs(world, bot.entity.position, 0.6)

  const minY = bbs.reduce((acc, bb) => Math.min(acc, bb.minY), Infinity)

  const ctx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot)

  for (let i = 0; i < ticks; i++) {
    bot.physicsUtil.engine.simulate(ctx, world)
  }

  const bbs1 = getUnderlyingBBs(world, ctx.state.pos, 0.6)

  const minY1 = bbs1.reduce((acc, bb) => Math.min(acc, bb.minY), Infinity)

  const bad = ctx.state.pos.y < bot.entity.position.y

  // if (bot.entity.position.y > 63.5) { console.log('state pos:', ctx.state.pos, bbs, bbs1, minY, minY1) }
  if ((minY === Infinity || minY1 === Infinity) && bad) {
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
  readonly engine: BaseSimulator
  readonly bot: Bot
  ctx: EPhysicsCtx
  readonly world: World

  constructor (sim: BaseSimulator, bot: Bot, world: World, ctx: EPhysicsCtx) {
    this.engine = sim
    this.bot = bot
    this.ctx = ctx
    this.world = world
  }

  public findJumpPoint (goal: Vec3, maxTicks = 20): JumpInfo | null {
    if (this.checkImmediateSprintJump(goal)) {
      return { jumpTick: 0, sprintTick: 0 }
    }

    let firstTick = 0
    let secondTick = 1

    // if less than zero, then we need to sprint before jumping.
    // we didn't cover enough distance to jump immediately.
    // if vel was up and we collided, we moved too far forward, so only sprint after jumping.
    const sprintAfterJump = this.ctx.state.vel.y > 0

    // console.log(this.ctx.state.pos, this.ctx.state.vel, goal, sprintAfterJump)
    while (firstTick < 12) {
      while (secondTick < 12) {
        const res = this.checkSprintJump(goal, firstTick, secondTick, sprintAfterJump)
        if (res) {
          return sprintAfterJump
            ? { jumpTick: firstTick, sprintTick: firstTick + secondTick }
            : { jumpTick: firstTick + secondTick, sprintTick: firstTick }
        }
        secondTick++
      }
      secondTick = 0
      firstTick++
    }
    return null
  }

  protected resetState (): EntityState {
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

  protected checkSprintJump (goal: Vec3, firstTicks = 0, secondTicks = 0, sprintAfterJump = false): boolean {
    const state = this.resetState()
    stateLookAt(state, goal)
    this.simJumpAdvanced(state, {
      firstTicks,
      secondTicks,
      sprintAfterJump,
      maxTicks: 20
    })
    // console.log('sim jump',firstTicks, secondTicks, sprintAfterJump, state.pos, state.control, state.age, goal, state.isCollidedHorizontally, state.onGround)
    if (state.isCollidedHorizontally) return false
    if (state.onGround && state.pos.y === goal.y) return true
    return false
  }

  protected simJump (state: EntityState, maxTicks = 20): EntityState {
    state.control.set('forward', true)
    state.control.set('jump', true)
    state.control.set('sprint', true)
    this.engine.simulateUntil(
      (state, ticks) => ticks > 0 && (state.onGround || state.isCollidedHorizontally),
      () => {},
      () => {},
      this.ctx,
      this.world,
      maxTicks
    )
    return state
  }

  protected simJumpAdvanced (
    state: EntityState,
    opts: {
      firstTicks?: number
      secondTicks?: number
      sprintAfterJump?: boolean
      maxTicks?: number
    } = {}
  ): EntityState {
    // goddamnit ts-standard.
    const { firstTicks, secondTicks, sprintAfterJump, maxTicks } = opts
    const ft = firstTicks ?? 0
    const st = secondTicks ?? 0
    const sj = sprintAfterJump ?? false
    const mt = maxTicks ?? 20

    // console.log("in sim:", firstTicks, secondTicks, sprintAfterJump, maxTicks, state.control)
    this.engine.simulateUntil(
      (state, ticks) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const boundary = sj ? ft + st : ft

        // console.log(firstTicks, secondTicks, 'checking goal', ticks, state.control.get('jump'), state.onGround, state.isCollidedVertically, state.isCollidedHorizontally, state.pos)
        return (state.control.get('jump') && state.onGround && ticks > boundary) || state.isCollidedHorizontally
      },
      () => {},
      (state, ticks) => {
        state.control.set('forward', false)
        state.control.set('jump', false)
        state.control.set('sprint', false)

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
  private readonly sim: JumpSim
  private readonly bot: Bot
  private readonly world: World

  constructor (bot: Bot, world: World) {
    this.bot = bot
    this.sim = new JumpSim(new EntityPhysics(bot.registry), world)
    this.world = world
  }

  public findGoalVertex (goal: AABB): Vec3 {
    // get top vertex that is closest to target.

    const pos = this.bot.entity.position

    const closerX = goal.minX - pos.x < pos.x - goal.maxX ? goal.minX : goal.maxX
    const closerZ = goal.minZ - pos.z < pos.z - goal.maxZ ? goal.minZ : goal.maxZ

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

  findBackupVertex (bbs: AABB[], goalVert: Vec3, orgPos: Vec3 = this.bot.entity.position): Vec3 {
    const dir = goalVert.minus(this.bot.entity.position)
    dir.translate(0, -dir.y, 0)
    dir.normalize()

    // const test = this.bot.entity.position.floored().offset(0, -1, 0)

    const start = this.bot.entity.position.clone()
    start.y = Math.round(start.y)

    // console.log(this.bot.entity.position, start, bbs);
    const intersects = []

    // const bbs = this.getUnderlyingBBs(start, 0.6)

    start.translate(0, -0.251, 0)
    for (const bb of bbs) {
      const intersect = bb.intersectsRay(start, dir)
      if (intersect != null) intersects.push(intersect)
    }

    intersects.sort((a, b) => b.distanceTo(start) - a.distanceTo(start))
    const intersect = intersects[0] as Vec3 | undefined
    if (intersect == null) {
      // console.log(bbs, this.bot.entity.position, start, dir, goalVert)
      throw Error('no intersect')
    }
    // if (!intersect) return null;

    const dir2 = intersect.minus(start)

    let scale = 1.25

    // eslint-disable-next-line no-labels
    outer: while (scale >= 0.6) {
      const wanted = dir2.scaled(scale).plus(start)

      const width = 0.6
      const height = 1.8
      const testBB = AABBUtils.getPlayerAABB({ position: wanted.offset(0, 0.252, 0), width, height })

      const cursor = new Vec3(0, 0, 0)
      for (let x = testBB.minX; x <= testBB.maxX; x += width / 2) {
        for (let y = testBB.minY; y <= testBB.maxY; y += height / 2) {
          for (let z = testBB.minZ; z <= testBB.maxZ; z += width / 2) {
            cursor.set(x, y, z)
            // console.log(cursor)
            const bl = this.world.getBlockInfo(cursor)
            if (bl.physical && bl.getBBs().some((b) => b.collides(testBB))) {
              // console.log('scale', scale, 'failed')
              scale -= 0.03

              // eslint-disable-next-line no-labels
              continue outer
            }
          }
        }
      }

      // console.log('scale', scale, 'success', wanted, intersect)
      // if (this.world.getBlockInfo(wanted).physical) {
      return wanted
      // }

      // for (const vert of testBB.toVertices()) {

      //   if (this.world.getBlockInfo(vert).getBBs().some(b=>!b.collides(testBB))) {
      //     scale -= 0.03;
      //     continue outer
      //   }
      // }
    }

    // if (this.world.getBlockInfo(wanted).physical) return intersect

    return intersect

    // return start.minus(dir.scaled(intersect.distanceTo(start) * 1.3));
  }

  public simJumpFromEdge (srcBBs: AABB[], goal: Vec3): boolean {
    // const bbs = this.getUnderlyingBBs(this.bot.entity.position, 0.6);
    // console.log(bbs)

    // const goalVert = this.findGoalVertex(AABB.fromBlockPos(goal))

    const goalCenter = goal.floored().offset(0.5, 0, 0.5)
    const goalBBs = this.world.getBlockInfo(goal).getBBs()

    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)

    const state = this.sim.simulateJumpFromEdgeOfBlock(ctx, srcBBs, goalCenter, goalBBs, true, 40)

    // console.log('sim jump from edge', state.age, state.pos, goalVert, state.onGround, state.isCollidedHorizontally, state.control, state.isInWater)
    const reached = JumpSim.getReachedAABB(goalBBs)
    return reached(state, 0) as boolean
  }

  public simFallOffEdge (goal: Vec3): boolean {
    // const goalVert = this.findGoalVertex(AABB.fromBlockPos(goal))

    // console.log('sim jump goals', goal, goalVert)
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)

    const goalCenter = goal.floored().offset(0.5, 0, 0.5)
    const goalBBs = this.world.getBlockInfo(goal).getBBs()

    ctx.state.control = ControlStateHandler.DEFAULT()
    stateLookAt(ctx.state, goal)
    ctx.state.control.set('forward', true)
    ctx.state.control.set('jump', false)
    ctx.state.control.set('sprint', true)

    // const orgPos = this.bot.entity.position.clone()

    const reached0 = JumpSim.getReachedAABB(goalBBs)

    let lastXZVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    const reached: SimulationGoal = (state, ticks) => {
      const xzVel = state.vel.offset(0, -state.vel.y, 0)
      const good = lastXZVel.norm() - xzVel.norm() < 0.01
      lastXZVel = xzVel
      return good && state.onGround && reached0(state, ticks)
    }
    const state = this.sim.simulateUntil(
      reached,
      () => {},
      (state) => {
        stateLookAt(state, goalCenter)
      },
      ctx,
      this.world,
      45
    )
    // console.log(reached(state, 0), reached0(state, 0), reached0(state, 1), state.age, orgPos, state.pos, goal, state.onGround, state.isCollidedHorizontally, state.control);
    return reached(state, ctx.state.age) as boolean
  }

  public simForwardMove (goal: Vec3, jump = true, ...constraints: SimulationGoal[]): boolean {
    // const goalVert = this.findGoalVertex(AABB.fromBlockPos(goal))

    // console.log('sim jump goals', goal, goalVert)
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    // const goalCenter = goal.floored().offset(0.5, 0, 0.5)

    const goalBBs = this.world.getBlockInfo(goal).getBBs()

    ctx.state.control = ControlStateHandler.DEFAULT()
    stateLookAt(ctx.state, goal)
    ctx.state.control.set('forward', true)
    ctx.state.control.set('jump', jump)
    ctx.state.control.set('sprint', true)

    // const orgPos = this.bot.entity.position.clone()

    let reached = JumpSim.getReachedAABB(goalBBs)
    if (constraints.length > 0) {
      const old = reached
      reached = (state, ticks) => {
        for (const constraint of constraints) {
          if (!(constraint(state, ticks) as boolean)) return false
        }
        return old(state, ticks)
      }
    }

    // const state = this.sim.simulateSmartAim(goalCenter, ctx, true, true, 0, 40);
    const state = this.sim.simulateUntilOnGround(ctx, 45, reached)

    // console.log(
    //   "sim jump immediately",
    //   state.age,
    //   orgPos,
    //   state.pos,
    //   AABB.fromBlockPos(goal),
    //   state.onGround,
    //   state.isCollidedHorizontally,
    //   state.control
    // );

    const testwtf = reached(state, 0) as boolean

    // console.log('sim jump TEST', testwtf)

    return testwtf
  }

  public simBackupJump (goal: Vec3): boolean {
    const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6)

    const goalBBs = this.world.getBlockInfo(goal).getBBs()

    let goalVert
    if (goalBBs.length === 1) {
      goalVert = this.findGoalVertex(goalBBs[0])
    } else {
      goalVert = this.findGoalVertex(AABB.fromBlockPos(goal))
    }

    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)

    ctx.state.control = ControlStateHandler.DEFAULT()
    const reached = JumpSim.getReachedAABB(goalBBs)

    const lazyFix = this.findBackupVertex(bbs, goal)

    this.sim.simulateBackUpBeforeJump(ctx, lazyFix, true, true, 40)
    const state = this.sim.simulateJumpFromEdgeOfBlock(ctx, bbs, goalVert, goalBBs, true, 40)

    return reached(state, 0) as boolean
  }
}
