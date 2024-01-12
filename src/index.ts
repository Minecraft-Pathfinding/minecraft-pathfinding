import { Bot } from "mineflayer";
import { MovementHandler, ForwardMovement, IdleMovement, ForwardJumpMovement } from "./mineflayer-specific/movements";
import { AStar } from "./mineflayer-specific/algs";
import { goals } from "./mineflayer-specific/goals";
import { Vec3 } from "vec3";
import { Move } from "./mineflayer-specific/move";
import { Path, PathingAlg } from "./abstract";

const EMPTY_VEC = new Vec3(0, 0, 0);
export class ThePathfinder {
  astar: AStar | null;
  movements: MovementHandler;

  currentlyExecuting?: Path<Move, AStar>;

  constructor(private bot: Bot) {
    this.movements = new MovementHandler(bot, [ForwardJumpMovement]);
    this.astar = null;
  }

  getPathTo(goal: goals.Goal) {
    return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal);
  }

  async *getPathFromTo(startPos: Vec3, startVel: Vec3, goal: goals.Goal) {
    let { x, y, z } = startPos;
    x = Math.floor(x);
    y = Math.ceil(y);
    z = Math.floor(z);

    this.movements.loadGoal(goal);

    const start = new Move(x, y, z, startPos, startVel, startPos.clone(), startVel.clone(), 0, new IdleMovement(this.bot));
    const astarContext = new AStar(start, this.movements, goal, 20000, 40);
    let result = astarContext.compute();

    yield { result, astarContext };
    while (result.status === "partial") {
      result = astarContext.compute();
      if (result.status === "success") {
        yield { result, astarContext };
        break;
      }
      yield { result, astarContext };
      if (astarContext.tickTimeout < 50) await this.bot.waitForTicks(1);
    }
  }

  async goto(goal: goals.Goal) {
    for await (const res of this.getPathTo(goal)) {
      console.log(
        res.result.status,
        res.result.calcTime,
        res.result.cost,
        res.result.visitedNodes,
        res.result.generatedNodes,
        res.result.path.length
      );
      if (res.result.status !== "success") {
        if (res.result.status === "noPath" || res.result.status === "timeout") break;
      } else {
        await this.perform(res.result, goal);
      }
    }
    console.log("clear states goddamnit")
    this.bot.clearControlStates();
  }

  async perform(path: Path<Move, PathingAlg<Move>>, goal: goals.Goal) {
    let currentIndex = 0;
    let handle = null;
    while (currentIndex < path.path.length) {
      this.bot.clearControlStates();
      const move = path.path[currentIndex++];
      try {
        await move.moveType.perform(move, goal);
      } catch (err) {
        handle = move;
        break;
      }
    }
    if (handle !== null) {
      await this.recovery(handle, path!, goal);
    }
    this.bot.clearControlStates();
  }

  async recovery(move: Move, path: Path<Move, PathingAlg<Move>>, goal: goals.Goal) {
    // TODO: implement recovery
    console.log("recovery");
    const ind = path.path.indexOf(move);
    if (ind === -1) {
      console.log('ind === -1')
      return this.bot.clearControlStates(); // done
    }

    const nextMove = path.path[ind + 1]; 
    if (!nextMove) {
      console.log('!nextMove')
      this.bot.clearControlStates();
      return  // done
    }

    const newGoal = goals.GoalBlock.fromVec(nextMove.toVec());

    delete this.currentlyExecuting;
    const data = this.getPathFromTo(move.toVec(), EMPTY_VEC, newGoal);
    let ret;

    while (!(ret = await data.next()).done) {
      const res = ret.value;
      console.log(
        res.result.status,
        res.result.calcTime,
        res.result.cost,
        res.result.visitedNodes,
        res.result.generatedNodes,
        res.result.path.length
      );
      if (res.result.status !== "success") {
        if (res.result.status === "noPath" || res.result.status === "timeout") {
          console.log('noPath || timeout')
          break;
        }
      } else {
        path.path.splice(0, ind, ...res.result.path);
        await this.perform(path, goal);
      }
    }
    console.log('done')
    this.bot.clearControlStates();
  }
}

export { goals } from "./mineflayer-specific/goals";

export function createPlugin(settings: any) {
  return function (bot: Bot) {
    bot.pathfinder = new ThePathfinder(bot);
  };
}

declare module "mineflayer" {
  interface Bot {
    pathfinder: ThePathfinder;
  }
}
