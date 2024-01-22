import { Bot } from "mineflayer";
import { AStar } from "./mineflayer-specific/algs";
import { goals } from "./mineflayer-specific/goals";
import { Vec3 } from "vec3";
import { Move } from "./mineflayer-specific/move";
import { Path, Algorithm } from "./abstract";
import { BlockInfo, CacheSyncWorld } from "./mineflayer-specific/world/cacheWorld";
import { CancelError } from "./mineflayer-specific/movements/exceptions";
import {
  BuildableMoveExecutor,
  BuildableMoveProvider,
  MovementHandler,
  MovementOptions,
  MovementProvider,
  MovementSetup,
  ExecutorMap,
} from "./mineflayer-specific/movements";
import { MovementExecutor } from "./mineflayer-specific/movements";
import { Diagonal, Forward, ForwardDropDown, ForwardJump, IdleMovement, StraightDown, StraightUp } from "./mineflayer-specific/movements";
import {
  DiagonalExecutor,
  ForwardDropDownExecutor,
  ForwardExecutor,
  ForwardJumpExecutor,
  StraightDownExecutor,
  StraightUpExecutor,
} from "./mineflayer-specific/movements";
import { DEFAULT_MOVEMENT_OPTS } from "./mineflayer-specific/movements";
import { DropDownOpt, StraightAheadOpt } from "./mineflayer-specific/post/optimizers";
import { BuildableOptimizer, OptimizationSetup, MovementOptimizer, OptimizationMap, Optimizer } from "./mineflayer-specific/post";

const EMPTY_VEC = new Vec3(0, 0, 0);

const test = [
  [Forward, ForwardExecutor],
  [ForwardJump, ForwardJumpExecutor],
  [ForwardDropDown, ForwardDropDownExecutor],
  [Diagonal, DiagonalExecutor],
  [StraightDown, StraightDownExecutor],
  [StraightUp, StraightUpExecutor],
] as [BuildableMoveProvider, BuildableMoveExecutor][];


// commented out for now.
const test1 = [
  // [Forward, StraightAheadOpt],
  // [Diagonal, StraightAheadOpt],
  // [ForwardDropDown, DropDownOpt],
] as [BuildableMoveProvider, BuildableOptimizer][];

const DEFAULT_SETUP = new Map(test);

const DEFAULT_OPTIMIZATION = new Map(test1);

export class ThePathfinder {
  astar: AStar | null;
  world: CacheSyncWorld;
  movements: ExecutorMap;
  optimizers: OptimizationMap;
  defaultSettings: MovementOptions;

  constructor(
    private readonly bot: Bot,
    movements?: MovementSetup,
    optimizers?: OptimizationSetup,
    settings: MovementOptions = DEFAULT_MOVEMENT_OPTS
  ) {
    this.world = new CacheSyncWorld(bot, this.bot.world);

    const test = new Map<BuildableMoveProvider, MovementExecutor>();
    for (const [providerType, executorType] of movements ?? DEFAULT_SETUP) {
      test.set(providerType, new executorType(bot, this.world, settings));
    }

    const test1 = new Map<BuildableMoveProvider, MovementOptimizer>();
    for (const [providerType, executorType] of optimizers ?? DEFAULT_OPTIMIZATION) {
      test1.set(providerType, new executorType(bot, this.world));
    }
    this.movements = test;
    this.optimizers = test1;
    this.defaultSettings = settings;
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

  dropMovment(provider: BuildableMoveProvider) {
    this.movements.delete(provider);
    // will keep in optimizers as that has no effect.
    // this.optimizers.delete(provider);
  }

  setExecutor(provider: BuildableMoveProvider, executor: BuildableMoveExecutor | MovementExecutor) {
    if (executor instanceof MovementExecutor) {
      this.movements.set(provider, executor);
    } else {
      this.movements.set(provider, new executor(this.bot, this.world, this.defaultSettings));
    }
  }

  setOptimizer(provider: BuildableMoveProvider, optimizer: BuildableOptimizer | MovementOptimizer) {
    if (optimizer instanceof MovementOptimizer) {
      this.optimizers.set(provider, optimizer);
    } else {
      this.optimizers.set(provider, new optimizer(this.bot, this.world));
    }
  }

  setDefaultOptions(settings: Partial<MovementOptions>) {
    this.defaultSettings = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings);
  }

  getPathTo(goal: goals.Goal, settings = this.defaultSettings) {
    return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal, settings);
  }

  getScaffoldCount() {
    return this.bot.inventory.items().reduce((acc, item) => (BlockInfo.scaffoldingBlockItems.has(item.type) ? item.count + acc : acc), 0);
  }

  async *getPathFromTo(startPos: Vec3, startVel: Vec3, goal: goals.Goal, settings = this.defaultSettings) {
    let { x, y, z } = startPos;
    x = Math.floor(x);
    y = Math.ceil(y);
    z = Math.floor(z);

    const moveHandler = MovementHandler.create(this.bot, this.world, this.movements, settings);
    moveHandler.loadGoal(goal);

    const start = Move.startMove(new IdleMovement(this.bot, this.world), startPos.clone(), startVel.clone(), this.getScaffoldCount());
    const astarContext = new AStar(start, moveHandler, goal, -1, 45, -1, -1e-6);

    let result = astarContext.compute();
    let ticked = false;

    yield { result, astarContext };

    const listener = () => {
      ticked = true;
    };
    this.bot.on("physicsTick", listener);

    while (result.status === "partial") {
      result = astarContext.compute();
      if (result.status === "success") {
        yield { result, astarContext };
        break;
      }
      yield { result, astarContext };

      // allow bot to function even while calculating.
      if (!ticked) {
        await this.bot.waitForTicks(1);
        ticked = false;
      }
    }
    this.bot.off("physicsTick", listener);
  }

  async getPathFromToRaw(startPos: Vec3, startVel: Vec3, goal: goals.Goal) {
    for await (const res of this.getPathFromTo(startPos, startVel, goal)) {
      if (res.result.status !== "success") {
        if (res.result.status === "noPath" || res.result.status === "timeout") return null;
      } else {
        return res.result;
      }
    }
    return null;
  }

  async goto(goal: goals.Goal) {
    for await (const res of this.getPathTo(goal)) {
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

    const optimizer = new Optimizer(this.bot, this.world, this.optimizers)

    optimizer.loadPath(pathInfo.path);

    const res = await optimizer.compute();

    const ret = {...pathInfo}

    ret["path"] = res
    return ret
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
    const movementHandler = path.context.movementProvider as MovementHandler;
    const movements = movementHandler.getMovements();

    const newPath = await this.postProcess(path);

    outer: while (currentIndex < newPath.path.length) {
      const move = newPath.path[currentIndex];
      const executor = movements.get(move.moveType.constructor as BuildableMoveProvider)!;
      if (!executor) throw new Error("No executor for movement type " + move.moveType.constructor.name);

      let tickCount = 0;

      // TODO: could move this to physicsTick to be performant, but meh who cares.

      await this.cleanupBot();
      console.log(`Performing ${move.moveType.constructor.name} to ${move.exitRounded(0)} (${move.toPlace.length} ${move.toBreak.length})`);

      if (move.moveType.isAlreadyCompleted(move, tickCount, goal)) {
        console.log("skipping");
        currentIndex++;
        continue;
      }

      try {
        while (!(await move.moveType.align(move, tickCount++, goal)) && tickCount < 999) {
          await this.bot.waitForTicks(1);
        }

        tickCount = 0;

        await executor.performInit(move, currentIndex, newPath.path);

        let adding = await executor.performPerTick(move, tickCount++, currentIndex, newPath.path);
        while (!adding && tickCount < 999) {
          await this.bot.waitForTicks(1);
          adding = await executor.performPerTick(move, tickCount++, currentIndex, newPath.path);
        }

        currentIndex += adding as number;
      } catch (err) {
        if (err instanceof CancelError) {
          console.log(newPath.path.flatMap((m, idx) => [m.moveType.constructor.name, idx, m.entryPos, m.exitPos]));
          await this.recovery(move, newPath, goal, entry);
          break outer;
        } else throw err;
      }
    }

    console.log("done!");
    await this.cleanupBot();
  }

  // TODO: implement recovery for any movement and goal.
  async recovery(move: Move, path: Path<Move, Algorithm<Move>>, goal: goals.Goal, entry = 0) {
    await this.cleanupBot();

    console.log("recovery", entry, goal.toVec());
    const ind = path.path.indexOf(move);
    if (ind === -1) {
      console.log("ind === -1");
      return; // done
    }

    let newGoal;

    const pos = this.bot.entity.position;
    let bad = false;
    let nextMove = path.path.sort((a, b) => a.entryPos.distanceTo(pos) - b.entryPos.distanceTo(pos))[0];
    if (path.path.indexOf(nextMove) === ind) {
      nextMove = path.path[ind + 1];
    } else if (path.path.indexOf(nextMove) < ind) {
      bad = true;
    }

    const no = !nextMove || entry > 0 || bad;
    if (no) {
      newGoal = goal;
    } else {
      newGoal = goals.GoalBlock.fromVec(nextMove.toVec());
    }

    const path1 = await this.getPathFromToRaw(this.bot.entity.position.floored(), EMPTY_VEC, newGoal);
    if (path1 === null) {
      console.log("path1 === null");
      return; // done
    } else if (no) {
      await this.perform(path1, goal, entry + 1);
    } else {
      await this.perform(path1, newGoal, entry + 1);
      path.path.splice(0, ind);
      await this.perform(path, goal, 0);
      console.log(path.path.length, "yayyy");
    }
  }

  async cleanupBot() {
    this.bot.clearControlStates();
  }

  cleanupAll() {
    console.log("clearing A*");
    this.cleanupBot();
    this.bot.chat(this.world.getCacheSize());
    this.world.clearCache();
  }
}