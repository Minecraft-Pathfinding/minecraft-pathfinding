import { BaseSimulator, ControlStateHandler, EPhysicsCtx, EntityState } from "@nxg-org/mineflayer-physics-util";
import { Bot } from "mineflayer";
import { World } from "../world/worldInterface";
import { Vec3 } from "vec3";
import { Move } from "../move";
import { AABBUtils } from "@nxg-org/mineflayer-util-plugin";
import { RayType } from "./interactionUtils";
import { BlockInfo } from "../world/cacheWorld";

type JumpInfo = { jumpTick: number; sprintTick: number };

export async function findStraightLine(thisMove: Move, currentIndex: number, path: Move[], bot: Bot, world: World, hitW = 0.61, uW = 0.61) {
  let lastMove = thisMove;
  let nextMove = path[++currentIndex];

  if (nextMove === undefined) return --currentIndex;

  const orgY = thisMove.entryPos.y;

  const bb = AABBUtils.getEntityAABBRaw({ position: bot.entity.position, width: hitW, height: 1.8 });
  const verts = bb.expand(-0.001, -0.1, -0.001).toVertices();
  const verts1 = [
    bot.entity.position.offset(-uW / 2, -0.6, -uW / 2),
    bot.entity.position.offset(uW / 2, -0.6, -uW / 2),
    bot.entity.position.offset(uW / 2, -0.6, uW / 2),
    bot.entity.position.offset(-uW / 2, -0.6, uW / 2),
  ];

  const pos0 = bot.entity.position;

  while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
    if (nextMove === undefined) {
      console.log('ret cuz no next')
      return --currentIndex;
    }
    for (const vert of verts) {
      const offset = vert.minus(bot.entity.position);
      const test1 = nextMove.exitPos.offset(0, -nextMove.exitPos.y, 0);
      const test = vert.plus(test1);
      const dist = lastMove.exitPos.distanceTo(bot.entity.position) + 1;
      const raycast0 = (await bot.world.raycast(
        vert,
        test.minus(vert).normalize(),
        dist,
        (block) => !BlockInfo.replaceables.has(block.type) && !BlockInfo.liquids.has(block.type) && block.shapes.length > 0
      )) as unknown as RayType;
      const valid0 = !raycast0 || raycast0.position.distanceTo(pos0) > dist;
      if (!valid0) {
        console.log('ret cuz block')

        console.log('offset', offset)
        console.log('vert', vert)
        console.log('bot.entity.position', bot.entity.position)
        console.log('test1', test1)
        console.log('test', test)
        console.log('raycast0', raycast0)
        console.log('test.minus(vert).normalize()', test.minus(vert).normalize())
        console.log('raycast0.position.distanceTo(pos0)', raycast0.position.distanceTo(pos0))
        console.log('dist', dist)
        return --currentIndex;
      }
    }

    let counter = verts1.length;
    for (const vert2 of verts1) {
      const offset = vert2.minus(bot.entity.position);
      const test1 = nextMove.exitPos.offset(0, 0, 0);
      const test = test1.plus(offset);
      const dist = lastMove.exitPos.distanceTo(bot.entity.position) + 1;
      const raycast0 = (await bot.world.raycast(
        vert2,
        test.minus(vert2).normalize(),
        dist,
        (block) => BlockInfo.replaceables.has(block.type) || BlockInfo.liquids.has(block.type) || block.shapes.length === 0
      )) as unknown as RayType;

      // print all variables in below console.log, but with labels
      // if (raycast0) console.log('\n\n', counter, offset, vert2, bot.entity.position, nextMove.exitPos, test1, test, raycast0, test.minus(vert2).normalize(), raycast0.position.distanceTo(pos0), dist,  vert2)
      

      const valid0 = !raycast0 || raycast0.position.distanceTo(pos0) > dist;
      if (!valid0) {
        
        counter--;
      }
    }

    if (counter === 0) {
      console.log('ret cuz air')
      return --currentIndex;
    }

    lastMove = nextMove;
    nextMove = path[++currentIndex];
    if (!nextMove) {
      console.log('ret cuz no next')
      return --currentIndex;
    }
  }

  console.log('ret cuz break')
  return --currentIndex;
}

export class JumpCalculator {
  readonly engine: BaseSimulator;
  readonly bot: Bot;
  ctx: EPhysicsCtx;
  readonly world: World;

  constructor(sim: BaseSimulator, bot: Bot, world: World, ctx: EPhysicsCtx) {
    this.engine = sim;
    this.bot = bot;
    this.ctx = ctx;
    this.world = world;
  }

  public findJumpPoint(goal: Vec3, maxTicks = 20): JumpInfo | null {
    if (this.checkImmediateSprintJump(goal)) {
      console.log("lfg");
      return { jumpTick: 0, sprintTick: 0 };
    }

    let firstTick = 0;
    let secondTick = 1;

    // if less than zero, then we need to sprint before jumping.
    // we didn't cover enough distance to jump immediately.
    // if vel was up and we collided, we moved too far forward, so only sprint after jumping.
    let sprintAfterJump = this.ctx.state.vel.y > 0;

    console.log(this.ctx.state.pos, this.ctx.state.vel, goal);
    while (firstTick < 12) {
      while (secondTick < 12) {
        const res = this.checkSprintJump(goal, firstTick, secondTick, sprintAfterJump);
        if (res)
          return sprintAfterJump
            ? { jumpTick: firstTick, sprintTick: firstTick + secondTick }
            : { jumpTick: firstTick + secondTick, sprintTick: firstTick };
        secondTick++;
      }
      secondTick = 0;
      firstTick++;
    }
    return null;
  }

  protected resetState() {
    this.ctx = EPhysicsCtx.FROM_BOT(this.engine.ctx, this.bot);
    this.ctx.state.age = 0;
    this.ctx.state.control = ControlStateHandler.DEFAULT();
    this.ctx.state.pos.set(this.bot.entity.position.x, this.bot.entity.position.y, this.bot.entity.position.z);
    this.ctx.state.vel.set(this.bot.entity.velocity.x, this.bot.entity.velocity.y, this.bot.entity.velocity.z);
    return this.ctx.state;
  }

  protected stateLookAt(state: EntityState, point: Vec3) {
    const delta = point.minus(state.pos.offset(0, state.height - 0.18, 0));
    const yaw = Math.atan2(-delta.x, -delta.z);
    const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
    const pitch = Math.atan2(delta.y, groundDistance);
    state.yaw = yaw;
    state.pitch = pitch;
  }

  protected checkImmediateSprintJump(goal: Vec3) {
    const state = this.resetState();
    this.stateLookAt(state, goal);
    this.simJump(state);
    // console.log('immediate jump', state.pos, state.vel, goal)
    if (state.isCollidedHorizontally) return false;
    if (state.onGround && state.pos.y === goal.y) return true;
    return false;
  }

  protected checkSprintJump(goal: Vec3, firstTicks = 0, secondTicks = 0, sprintAfterJump = false) {
    const state = this.resetState();
    this.stateLookAt(state, goal);
    this.simJumpAdvanced(state, {
      firstTicks,
      secondTicks,
      sprintAfterJump,
      maxTicks: 20,
    });
    // console.log('sim jump',firstTicks, secondTicks, sprintAfterJump, state.pos, state.control, state.age, goal, state.isCollidedHorizontally, state.onGround)
    if (state.isCollidedHorizontally) return false;
    if (state.onGround && state.pos.y === goal.y) return true;
    return false;
  }

  protected simJump(state: EntityState, maxTicks = 20) {
    state.control.set("forward", true);
    state.control.set("jump", true);
    state.control.set("sprint", true);
    this.engine.simulateUntil(
      (state, ticks) => ticks > 0 && (state.onGround || state.isCollidedHorizontally),
      () => {},
      () => {},
      this.ctx,
      this.world,
      maxTicks
    );
    return state;
  }

  protected simJumpAdvanced(
    state: EntityState,
    opts: {
      firstTicks?: number;
      secondTicks?: number;
      sprintAfterJump?: boolean;
      maxTicks?: number;
    } = {}
  ) {
    let { firstTicks, secondTicks, sprintAfterJump, maxTicks } = opts;
    firstTicks = firstTicks ?? 0;
    secondTicks = secondTicks ?? 0;
    sprintAfterJump = sprintAfterJump ?? false;
    maxTicks = maxTicks ?? 20;

    // console.log("in sim:", firstTicks, secondTicks, sprintAfterJump, maxTicks, state.control)
    this.engine.simulateUntil(
      (state, ticks) => {
        const boundary = sprintAfterJump ? firstTicks! + secondTicks! : firstTicks!;
        // console.log(firstTicks, secondTicks, 'checking goal', ticks, state.control.get('jump'), state.onGround, state.isCollidedVertically, state.isCollidedHorizontally, state.pos)
        return (state.control.get("jump") && state.onGround && ticks > boundary) || state.isCollidedHorizontally;
      },
      () => {},
      (state, ticks) => {
        state.control.set("forward", false);
        state.control.set("jump", false);
        state.control.set("sprint", false);
        if (ticks >= firstTicks!) {
          if (sprintAfterJump) state.control.set("jump", true);
          else {
            state.control.set("sprint", true);
            state.control.set("forward", true);
          }
          if (ticks >= firstTicks! + secondTicks!) {
            if (sprintAfterJump) {
              state.control.set("sprint", true);
              state.control.set("forward", true);
            } else {
              state.control.set("jump", true);
            }
          }
        }
        // console.log('sim jump',firstTicks, secondTicks, sprintAfterJump, ticks, state.pos, state.control)
      },
      this.ctx,
      this.world,
      maxTicks
    );

    return state;
  }
}
