import { Vec3 } from "vec3";
import { SimMovement } from "../movements";
import * as controls from "../controls";
import { BaseSimulator, EPhysicsCtx, EntityState, SimulationGoal } from "@nxg-org/mineflayer-physics-util";
import { Bot } from "mineflayer";
import { goals } from "../goals";
import { Move } from "../move";
import { emptyVec } from "@nxg-org/mineflayer-physics-util/dist/physics/settings";
import { CancelError } from "./exceptions";

function setState(simCtx: EPhysicsCtx, pos: Vec3, vel: Vec3) {
  simCtx.state.age = 0;
  simCtx.state.pos.set(pos.x, pos.y, pos.z);
  simCtx.state.vel.set(vel.x, vel.y, vel.z);
}

export class ForwardJumpMovement extends SimMovement {
  controlAim(nextPoint: Vec3) {
    // const zero = controls.getControllerSmartMovement(nextPoint, true);
    const one = controls.getControllerStrafeAim(nextPoint);
    let aimed = false;
    return (state: EntityState, ticks: number) => {
      if (!aimed) {
        const dx = nextPoint.x - state.pos.x;
        const dz = nextPoint.z - state.pos.z;
        state.yaw = Math.atan2(-dx, -dz);
        aimed = true;
      }

      if (state.isCollidedHorizontally) {
        state.control.set("jump", true);
        state.control.set("forward", false);
        // state.control.set("back", true);
        state.control.set("sprint", false);
      } else {
        if (state.vel.offset(0, -state.vel.y, 0).norm() > 0.15) state.control.set("jump", true);
        // state.control.set("back", false);
        state.control.set("forward", true);
        state.control.set("sprint", true);
      }

      // zero(state, ticks);
      one(state, ticks);
    };
  }

  botAim(bot: Bot, nextMove: Vec3, goal: goals.Goal) {
    // const zero = controls.getBotSmartMovement(bot, nextMove, true);
    const one = controls.getBotStrafeAim(bot, nextMove);
    let aimed = false;
    return () => {
      if (!aimed) {
        const dx = nextMove.x - bot.entity.position.x;
        const dz = nextMove.z - bot.entity.position.z;
        bot.entity.yaw = Math.atan2(-dx, -dz);
        aimed = true;
      }

      if ((bot.entity as any).isCollidedHorizontally) {
        bot.setControlState("jump", true);
        bot.setControlState("forward", false);
        bot.setControlState("back", true);
        bot.setControlState("sprint", false);
      } else {
        // console.log(bot.entity.velocity.offset(0, -bot.entity.velocity.y,0).norm())
        if (bot.entity.velocity.offset(0, -bot.entity.velocity.y, 0).norm() > 0.15) bot.setControlState("jump", true);
        bot.setControlState("back", false);
        bot.setControlState("forward", true);
        bot.setControlState("sprint", true);
      }
      // zero();
      one();
    };
  }

  // right should be positiive,
  // left should be negative.

  getReached(goal: goals.Goal, nextPos: Vec3, start: Move) {
    const vecGoal = goal.toVec();
    return (state: EntityState, age: number) => {
      if (!state.isCollidedVertically) return false;
      return vecGoal.minus(state.pos).norm() <= vecGoal.minus(nextPos).norm(); // && state.pos.minus(start.entryPos).norm() < 0.5
    };
  }

  botReach(bot: Bot, move: Move, goal: goals.Goal) {
    const vecGoal = goal.toVec();
    return () => {
      if (!bot.entity.onGround) return false;
      return vecGoal.minus(bot.entity.position).norm() <= vecGoal.minus(move.exitPos).norm();
    };
  }

  provideMovements(start: Move, storage: Move[], goal: goals.Goal): void {
    for (const dir of SimMovement.jumpDirs) {
      setState(this.stateCtx, start.exitPos, emptyVec);
      this.stateCtx.state.clearControlStates();

      const nextGoal = new Vec3(start.x + dir.x, start.y + dir.y, start.z + dir.z);
      const stopOnVertCollision: SimulationGoal = (state, ticks) => {
        return state.control.get("jump") && state.isCollidedVertically;
      };
      const reach = this.getReached(goal, start.exitPos, start);

      // console.log(start.exitPos)
      const state = this.simulateUntil(
        BaseSimulator.buildAnyGoal(stopOnVertCollision),
        () => {},
        this.controlAim(nextGoal),
        this.stateCtx,
        this.bot.world,
        30
      );

      const diff = state.pos.minus(start.exitPos).norm();

      // console.log(state.pos, nextGoal, diff)
      if (diff === 0) return;
      const cost = Math.round(state.age * 1);

      // if (stopOnHoriCollision(state, state.age)) {
      //   return;
      // }

      if (reach(state, state.age)) {
        // console.log("GI",state.pos, state.isCollidedVertically, cost)
        storage.push(Move.fromPreviousState(cost, state, start, this));
      }
    }
  }

  align = (thisMove: Move, tickCount: number, goal: goals.Goal) => {
    return this.bot.entity.onGround;
  };

  performPerTick = (move: Move, tickCount: number, goal: goals.Goal): boolean => {
    if (tickCount > 40) throw new CancelError("ForwardJumpMovement", "Took too long to reach goal");

    const botAim = this.botAim(this.bot, move.exitPos, goal);
    const botReach = this.botReach(this.bot, move, goal);
    botAim();
    return botReach();
  };

  performInit = async (move: Move, goal: goals.Goal): Promise<void> => {
    await this.bot.lookAt(new Vec3(move.exitPos.x, move.exitPos.y, move.exitPos.z), true);

    const dx = move.exitPos.x - this.bot.entity.position.x;
    const dz = move.exitPos.z - this.bot.entity.position.z;
    const wantedYaw = Math.atan2(-dx, -dz);
    this.bot.entity.yaw = wantedYaw;
  };
}
