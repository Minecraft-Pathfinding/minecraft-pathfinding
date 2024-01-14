import { Bot } from "mineflayer";
import { MovementHandler, ForwardMovement, IdleMovement, ForwardJumpMovement } from "./mineflayer-specific/movements";
import { AStar } from "./mineflayer-specific/algs";
import { goals } from "./mineflayer-specific/goals";
import { Vec3 } from "vec3";
import { Move } from "./mineflayer-specific/move";
import { Path, Algorithm } from "./abstract";
import { CacheSyncWorld } from "./mineflayer-specific/world/cacheWorld";
import type { World as WorldType } from "./mineflayer-specific/world/worldInterface";
import { CancelError } from "./mineflayer-specific/movements/exceptions";

const EMPTY_VEC = new Vec3(0, 0, 0);






export class ThePathfinder {
  astar: AStar | null;
  movements: MovementHandler;
  currentlyExecuting?: Path<Move, Algorithm<Move>>;
  world: CacheSyncWorld;

  constructor(private bot: Bot) {
    this.world = new CacheSyncWorld(bot, this.bot.world);
    this.movements = new MovementHandler(bot, this.world, [ForwardJumpMovement]);
    this.astar = null;
  }

  getCacheSize() {
    return this.world.getCacheSize();
  }

  setCacheEnabled(enabled: boolean) {
    this.world.setEnabled(enabled);
  }

  isCacheEnabled() {
    return this.world.enabled;
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

    const start = new Move(x, y, z, startPos, startVel, startPos.clone(), startVel.clone(), 0, new IdleMovement(this.bot, this.world));
    const astarContext = new AStar(start, this.movements, goal, -1, 45, -1,  0);
    
    let result = astarContext.compute();
    let ticked = false;


    yield { result, astarContext };

    const listener = () => { ticked = true; }
    this.bot.on('physicsTick', listener)


    while (result.status === "partial") {
      result = astarContext.compute();
      if (result.status === "success") {
        yield { result, astarContext };
        break;
      }
      yield { result, astarContext };
    
      // allow bot to function even while calculating.
      if (ticked === false) {
        await this.bot.waitForTicks(1);
        ticked = false;
      }
    }
    this.bot.off('physicsTick', listener)
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
    console.log("clear states goddamnit");
    this.cleanupAll();
  }

  private async postProcess(pathInfo: Path<Move, Algorithm<Move>>) {
    // aggressive optimization.
    // Identify all nodes that are able to be straight-lined to each other.
    // Do so by comparing movement types && their respective y values.
  }

  private findPartialConnection(root: Move, pathInfo: Move[]) {
    const index = pathInfo.indexOf(root);
    const yLvl = root.y;
    const type = root.moveType;
    for (let i = index; i < pathInfo.length; i++) {
      const node = pathInfo[i];
      if (node.moveType instanceof type.constructor) {
      }
    }
  }

  /**
   * Do not mind the absolutely horrendous code here right now.
   * It will be fixed, just very busy right now.
   * @param path
   * @param goal
   * @param entry
   */
  async perform(path: Path<Move, Algorithm<Move>>, goal: goals.Goal, entry = 0) {
    if (entry > 10) throw new Error("Too many failures, exiting performing.");

    let currentIndex = 0;

    outer: while (currentIndex < path.path.length) {
      this.cleanupBot();
      const move = path.path[currentIndex++];

      let tickCount = 0;

      // TODO: could move this to physicsTick to be performant, but meh who cares.

      try {
        while (!(await move.moveType.align(move, tickCount++, goal))) {
          await this.bot.waitForTicks(1);
        }

        await move.moveType.performInit(move, goal);
        while (!(await move.moveType.performPerTick(move, tickCount++, goal)) && tickCount < 999) {
          await this.bot.waitForTicks(1);
        }

      } catch (err) {
        if (err instanceof CancelError) {
          await this.recovery(move, path, goal, entry);
          break outer;
        } else throw err;
      }
      this.cleanupBot();
    }
  }

  // TODO: implement recovery for any movement and goal.
  async recovery(move: Move, path: Path<Move, Algorithm<Move>>, goal: goals.Goal, entry = 0) {
    this.cleanupBot();

    console.log("recovery", entry, goal.toVec());
    const ind = path.path.indexOf(move);
    if (ind === -1) {
      console.log("ind === -1");
      return; // done
    }

    let newGoal;
    let pathStart;
    const nextMove = path.path[ind + 1];
    if (!nextMove || entry > 0) {
      newGoal = goal;
      pathStart = move.toVec();
    } else {
      newGoal = goals.GoalBlock.fromVec(nextMove.toVec());
      pathStart = move.toVec();
    }

    delete this.currentlyExecuting;
    const data = this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, newGoal);
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
          console.log("noPath || timeout");
          break;
        }
      } else if (res.result.path.length === 0) {
        console.log("no further moves needed");
        path.path.splice(0, ind + 1);
        await this.perform(path, goal, entry + 1);
      } else {
        path.path.splice(0, ind + 1, ...res.result.path);
        await this.perform(path, goal, entry + 1);
      }
    }
  }

  cleanupBot() {
    this.bot.clearControlStates();
  }

  cleanupAll() {
    console.log('clearing A*')
    this.cleanupBot()
    this.bot.chat(this.world.getCacheSize())
    this.world.clearCache();
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




