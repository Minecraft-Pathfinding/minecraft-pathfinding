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
  ParkourForward,
  ParkourForwardExecutor,
} from "./mineflayer-specific/movements";
import { MovementExecutor } from "./mineflayer-specific/movements";
import { Diagonal, Forward, ForwardDropDown, ForwardJump, IdleMovement, StraightDown, StraightUp } from "./mineflayer-specific/movements";
import {
  ForwardDropDownExecutor,
  ForwardExecutor,
  ForwardJumpExecutor,
  StraightDownExecutor,
  StraightUpExecutor,
} from "./mineflayer-specific/movements";
import { DEFAULT_MOVEMENT_OPTS } from "./mineflayer-specific/movements";
import { DropDownOpt, ForwardJumpUpOpt, StraightAheadOpt } from "./mineflayer-specific/post/optimizers";
import { BuildableOptimizer, OptimizationSetup, MovementOptimizer, OptimizationMap, Optimizer } from "./mineflayer-specific/post";
import { Performer } from "./abstract/performer";
import { ContinuesPathProducer } from "./mineflayer-specific/pathProducers/continuesPathProducer";
import { PartialPathProducer } from "./mineflayer-specific/pathProducers/partialPathProducer";

const EMPTY_VEC = new Vec3(0, 0, 0);

const test = [
  [Forward, ForwardExecutor],
  [ForwardJump, ForwardJumpExecutor],
  [ForwardDropDown, ForwardDropDownExecutor],
  [Diagonal, ForwardExecutor],
  [StraightDown, StraightDownExecutor],
  [StraightUp, StraightUpExecutor],
  [ParkourForward, ParkourForwardExecutor]
] as [BuildableMoveProvider, BuildableMoveExecutor][];

test.reverse()

// commented out for now.
const test1 = [
  [Forward, StraightAheadOpt],
  [Diagonal, StraightAheadOpt],
  [ForwardDropDown, DropDownOpt],
  [ForwardJump, ForwardJumpUpOpt],
] as [BuildableMoveProvider, BuildableOptimizer][];

// const test1 = new Map<BuildableMoveProvider, BuildableOptimizer>([
const DEFAULT_SETUP = new Map(test);

const DEFAULT_OPTIMIZATION = new Map(test1);

/**
 * Eventually, I want this entirely off-thread.
 *
 * That will be a while, but remember to code this with that in mind.
 */
export class ThePathfinder {
  astar: AStar | null;
  world: CacheSyncWorld;
  movements: ExecutorMap;
  optimizers: OptimizationMap;
  defaultSettings: MovementOptions;

  private _executing = false;
  private shouldExecute = false;

  public get executing(): boolean {
    return this._executing;
  }

  public set executing(value: boolean) {
    this.shouldExecute = value;
    this._executing = value;
  }

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

  async cancel() {
    this.shouldExecute = false;
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
    for (const [_, executor] of this.movements) {
      executor.settings = this.defaultSettings;
    }
  }

  getPathTo(goal: goals.Goal, settings = this.defaultSettings) {
    return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal, settings);
  }

  getScaffoldCount() {
    return this.bot.inventory.items().reduce((acc, item) => (BlockInfo.scaffoldingBlockItems.has(item.type) ? item.count + acc : acc), 0);
  }

  async *getPathFromTo(startPos: Vec3, startVel: Vec3, goal: goals.Goal, settings = this.defaultSettings) {
    const move = Move.startMove(new IdleMovement(this.bot, this.world), startPos.clone(), startVel.clone(), this.getScaffoldCount());
    // technically introducing a bug here, where resetting the pathingUtil fucks up.
    this.bot.pathingUtil.refresh();
    const foo = new ContinuesPathProducer(move, goal, settings, this.bot, this.world, this.movements)
    // const foo = new PartialPathProducer(move, goal, settings, this.bot, this.world, this.movements)
    let { result, astarContext } = foo.advance();

    yield { result, astarContext };

    let ticked = false;
    const listener = () => {
      ticked = true;
    };
    this.bot.on("physicsTick", listener);

    while (result.status === "partial") {
      let { result: result2, astarContext } = foo.advance();
      result = result2;
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
    if (this.executing) throw new Error("Already executing!");
    this.executing = true;

    for await (const res of this.getPathTo(goal)) {
      if (res.result.status !== "success") {
        if (res.result.status === "noPath" || res.result.status === "timeout") break;
      } else {

        const newPath = await this.postProcess(res.result);
        await this.perform(newPath, goal);
      }
    }
    console.log("clear states goddamnit");
    this.cleanupAll();
  }

  private async postProcess(pathInfo: Path<Move, Algorithm<Move>>): Promise<Path<Move, Algorithm<Move>>> {
    // aggressive optimization.
    // Identify all nodes that are able to be straight-lined to each other.
    // Do so by comparing movement types && their respective y values.

    const optimizer = new Optimizer(this.bot, this.world, this.optimizers);

    optimizer.loadPath(pathInfo.path);

    const res = await optimizer.compute();

    const ret = { ...pathInfo };

    ret["path"] = res;
    return ret;
  }

  /**
   * Do not mind the absolutely horrendous code here right now.
   * It will be fixed, just very busy right now.
   * @param path
   * @param goal
   * @param entry
   */
  async perform(path: Path<Move, Algorithm<Move>>, goal: goals.Goal, entry = 0) {
    if (entry > 0) throw new Error("Too many failures, exiting performing.");
    if (!this.shouldExecute) {
      this.cleanupAll();
      return;
    }

    let currentIndex = 0;
    const movementHandler = path.context.movementProvider as MovementHandler;
    const movements = movementHandler.getMovements();

    outer: while (currentIndex < path.path.length) {
      if (!this.shouldExecute) {
        this.cleanupAll();
        return;
      }

      const move = path.path[currentIndex];
      const executor = movements.get(move.moveType.constructor as BuildableMoveProvider)!;
      if (!executor) throw new Error("No executor for movement type " + move.moveType.constructor.name);

      let tickCount = 0;

      // TODO: could move this to physicsTick to be performant, but meh who cares.

      await this.cleanupBot();
      console.log(
        `Performing ${move.moveType.constructor.name} from ${move.entryPos} to ${move.exitPos} (${move.toPlace.length} ${move.toBreak.length}) at pos: ${this.bot.entity.position}`
      );

      executor.loadMove(move);

      if (executor.isAlreadyCompleted(move, tickCount, goal)) {
        console.log("skipping");
        currentIndex++;
        continue;
      }

      try {
        while (!(await executor.align(move, tickCount++, goal)) && tickCount < 999) {
          await this.bot.waitForTicks(1);
        }

        tickCount = 0;

        await executor.performInit(move, currentIndex, path.path);

        let adding = await executor.performPerTick(move, tickCount++, currentIndex, path.path);
        while (!adding && tickCount < 999) {
          if (!this.shouldExecute) {
            this.cleanupAll();
            return;
          }
          await this.bot.waitForTicks(1);
          adding = await executor.performPerTick(move, tickCount++, currentIndex, path.path);
        }

        currentIndex += adding as number;
      } catch (err) {
        if (err instanceof CancelError) {
          console.log('CANCEL ERROR', this.bot.entity.position, this.bot.entity.velocity, goal, move.entryPos, move.exitPos, move.moveType.constructor.name, currentIndex, path.path.length, tickCount, err);
          console.log(path.path.flatMap((m, idx) => [m.moveType.constructor.name, idx, m.entryPos, m.exitPos]));
          await this.recovery(move, path, goal, entry);
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

    console.log("recovery", entry, goal);
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

    const path1 = await this.getPathFromToRaw(this.bot.entity.position, EMPTY_VEC, newGoal);
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
    // await this.bot.waitForTicks(1);
  }

  cleanupAll() {
    console.log("clearing A*");
    this.cleanupBot();
    this.bot.chat(this.world.getCacheSize());
    this.world.clearCache();
    this.executing = false;
  }
}
