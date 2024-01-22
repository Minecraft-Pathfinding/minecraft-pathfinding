import { Bot } from "mineflayer";
import { Move } from "../move";
import { goals } from "../goals";
import { World } from "../world/worldInterface";
import { DEFAULT_MOVEMENT_OPTS, Movement, MovementOptions } from "./movement";

import { MovementProvider as AMovementProvider } from "../../abstract";
import { ExecutorMap } from ".";

/**
 * Movement provider.
 *
 * Provides movements to the pathfinder.
 */
export abstract class MovementProvider extends Movement {
  public constructor(bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings);
  }

  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   */
  abstract provideMovements(start: Move, storage: Move[], goal: goals.Goal): void;
}

export class MovementHandler implements AMovementProvider<Move> {
  movementMap: ExecutorMap;
  recognizedMovements: MovementProvider[];
  goal!: goals.Goal;
  world: World;

  constructor(bot: Bot, world: World, recMovement: MovementProvider[], movementMap: ExecutorMap) {
    this.world = world;
    this.recognizedMovements = recMovement;
    this.movementMap = movementMap;
  }

  static create(bot: Bot, world: World, recMovement: ExecutorMap, settings: Partial<MovementOptions> = {}): MovementHandler {
    const opts = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings);
    return new MovementHandler(
      bot,
      world,
      [...recMovement.keys()].map((m) => new m(bot, world, opts)),
      recMovement
    );
  }

  getMovements(): ExecutorMap {
      return this.movementMap
  }

  sanitize(): boolean {
    return !!this.goal;
  }

  loadGoal(goal: goals.Goal) {
    this.goal = goal;
  }

  getNeighbors(currentMove: Move): Move[] {
    const moves: Move[] = [];

    for (const newMove of this.recognizedMovements) {
      newMove.loadMove(currentMove);
      newMove.provideMovements(currentMove, moves, this.goal);
    }

    return moves;

    // for differences less than 1 block, we only supply best movement to said block.

    if (moves.length === 0) return moves;

    const visited = new Set();
    for (const move of moves) {
      visited.add(move.hash);
    }

    // console.log(visited)

    const goalVec = this.goal.toVec();
    const ret = [];
    for (const visit of visited) {
      const tmp = moves.filter((m) => m.hash === visit);
      const wantedCost = stableSort1(tmp, (a, b) => a.cost - b.cost)[0].cost;
      const wanted = tmp
        .filter((m) => m.cost === wantedCost)
        .sort((a, b) => a.exitPos.distanceTo(goalVec) - b.exitPos.distanceTo(goalVec))[0]!;
      ret.push(wanted);
    }

    // for (const move of moves) {
    //   (move as any).cost = Math.round(move.cost);
    // }

    return ret;
  }
}

type Comparator<T> = (a: T, b: T) => number;

const defaultCmp: Comparator<any> = (a, b) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

function stableSort1<T>(arr: T[], cmp: Comparator<T> = defaultCmp): T[] {
  const stabilized = arr.map((el, index) => [el, index] as [T, number]);
  const stableCmp: Comparator<[T, number]> = (a, b) => {
    const order = cmp(a[0], b[0]);
    if (order != 0) return order;
    return a[1] - b[1];
  };

  stabilized.sort(stableCmp);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = stabilized[i][0];
  }

  return arr;
}
