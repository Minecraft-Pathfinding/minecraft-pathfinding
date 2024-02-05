import { Bot } from "mineflayer";
import { Move } from "../move";
import { goals } from "../goals";
import { World } from "../world/worldInterface";
import { DEFAULT_MOVEMENT_OPTS, Movement, MovementOptions } from "./movement";

import { MovementProvider as AMovementProvider } from "../../abstract";
import { ExecutorMap } from ".";
import { Vec3 } from "vec3";
import { Block, Vec3Properties } from "../../types";
import { BlockInfo } from "../world/cacheWorld";

/**
 * Movement provider.
 *
 * Provides movements to the pathfinder.
 */
export abstract class MovementProvider extends Movement {
  orgPos!: Vec3;
  toClear!: Set<number>;

  public constructor(bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings);
  }

  abstract movementDirs: Vec3[];

  private boundaries!: [x: number, y: number, z: number];
  private halfway!: [x: number, y: number, z: number];

  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   */
  abstract provideMovements(start: Move, storage: Move[], goal: goals.Goal): void;

  private localData: (BlockInfo | null)[] = [];

  loadLocalData(orgPos: Vec3, boundaries: [x: number, y: number, z: number], arr: (BlockInfo | null)[], clear: Set<number>) {
    this.orgPos = orgPos;
    this.localData = arr;
    this.boundaries = boundaries;
    this.halfway = [Math.floor(boundaries[0] / 2), Math.floor(boundaries[1] / 2), Math.floor(boundaries[2] / 2)];
    this.toClear = clear;
    // console.log(this.halfway)
  }

  _getBlockInfo(pos: Vec3Properties, dx: number, dz: number, dy: number): BlockInfo {
    pos = {
      x: Math.floor(pos.x),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z),
    };

    const wantedDx = pos.x - this.orgPos.x + dx + this.halfway[0];

    // if (wantedDx < 0 || wantedDx >= this.boundaries[0]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    const wantedDz = pos.z - this.orgPos.z + dz + this.halfway[1];

    // if (wantedDz < 0 || wantedDz >= this.boundaries[2]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    const wantedDy = pos.y - this.orgPos.y + dy + this.halfway[2];

    // if (wantedDy < 0 || wantedDy >= this.boundaries[2]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    if (
      wantedDx < 0 ||
      wantedDx >= this.boundaries[0] ||
      wantedDy < 0 ||
      wantedDy >= this.boundaries[2] ||
      wantedDz < 0 ||
      wantedDz >= this.boundaries[1]
    ) {
      // console.log('hey', idx, this.localData[idx])
      return super.getBlockInfo(pos, dx, dy, dz);
      // console.log('out of bounds', pos, this.orgPos, wantedDx, wantedDy, wantedDz, this.boundaries)
    }

    const idx = wantedDx * this.boundaries[2] * this.boundaries[1] + wantedDz * this.boundaries[1] + wantedDy;

    // const data = this.localData[wantedDx][wantedDy][wantedDz];
    const data = this.localData[idx];

    if (data !== null) {
      // const target = new Vec3(wantedDx - this.halfway[0], wantedDy - this.halfway[2], wantedDz - this.halfway[1]).plus(this.orgPos);
      // if (!data.position.equals(target) && data.position.x !== 0 && data.position.y !== 0 && data.position.z !== 0) {
      //   console.log(
      //     "crap",
      //     data.position,
      //     target,
      //     wantedDx,
      //     wantedDy,
      //     wantedDz,
      //     this.halfway,
      //     this.orgPos,
      //     pos,
      //     dx,
      //     dy,
      //     dz,
      //     this.boundaries,
      //     this.localData[idx]
      //   );
      // }
      return data;
    }

    const ret = super.getBlockInfo(pos, dx, dy, dz);

    // this.localData[wantedDx][wantedDy][wantedDz] = ret;
    this.localData[idx] = ret;

    const packed = wantedDx << 16 + wantedDy << 8 + wantedDz;

    this.toClear.add(packed);
    return ret;
  }
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
    ).initLocalData();
  }

  getMovements(): ExecutorMap {
    return this.movementMap;
  }

  sanitize(): boolean {
    return !!this.goal;
  }

  loadGoal(goal: goals.Goal) {
    this.goal = goal;
  }

  private boundaries: [x: number, y: number, z: number] = [5, 5, 5];
  private maxBound = this.boundaries[0] * this.boundaries[2] * this.boundaries[1];
  private toClear: Set<number> = new Set();
  private localData: (BlockInfo | null)[] = [];

  initLocalData() {
    // this.resetLocalData();
    this.localData = new Array(this.maxBound).fill(null, 0, this.maxBound);

    // this.localData = new Array(this.boundaries[0])
    //   .fill(null)
    //   .map(() => new Array(this.boundaries[2]).fill(null).map(() => new Array(this.boundaries[1]).fill(null)));

    return this;
  }

  resetLocalData() {
    // for (const key of this.toClear) {
    //   this.localData[key] = null;
    // }
    // this.toClear.clear();

    for (let i = 0; i < this.maxBound; i++) {
      this.localData[i] = null;
    }
    // this.localData.fill(null, 0, this.maxBound);

    // for (let i = 0; i < this.boundaries[0]; i++) {
    //   for (let j = 0; j < this.boundaries[2]; j++) {
    //     for (let k = 0; k < this.boundaries[1]; k++) {
    //       this.localData[i][j][k] = null;
    //     }
    //   }
    // }

    // this.localData = new Array(this.boundaries[0])
    //   .fill(null)
    //   .map(() => new Array(this.boundaries[2]).fill(null).map(() => new Array(this.boundaries[1]).fill(null)));
  }

  // Do not reassign localData, must do shift in place.

  private swapArray = new Array(this.maxBound).fill(null);
  private swapSet = new Set<number>();

  shiftLocalData(orgPos: Vec3, newPos: Vec3) {
    const diff = orgPos.minus(newPos); //newPos.minus(orgPos);

    // this.swapArray.fill(null);
    // for (let i = 0; i < this.maxBound; i++) {
    //   this.swapArray[i] = null;
    // }

    this.swapSet.clear();

    for (const ind of this.toClear) {
      // this.swapArray[ind] = null;

      // unpack ind
      const z = ind & 0xff;
      const rest = ind >> 8;
      const y = rest & 0xff;
      const x = rest >> 8;
      

      // const z = Math.floor(ind / (this.boundaries[0] * this.boundaries[1]));
      // const rest = ind % (this.boundaries[0] * this.boundaries[1]);
      // const y = Math.floor(rest / this.boundaries[0]);
      // const x = rest % this.boundaries[0];
      // const y = Math.floor((ind % (this.boundaries[0] * this.boundaries[1])) / this.boundaries[0]);
      // const x = (ind % (this.boundaries[0] * this.boundaries[1])) % this.boundaries[0];
      // lengthX * lengthY)) % lengthX
      const newX = x + diff.x;
      const newY = y + diff.y;
      const newZ = z + diff.z;

      if (newX >= 0 && newX < this.boundaries[0] && newY >= 0 && newY < this.boundaries[1] && newZ >= 0 && newZ < this.boundaries[2]) {
        // const idx = x * this.boundaries[2] * this.boundaries[1] + z * this.boundaries[1] + y;
        const newIdx = newX * this.boundaries[2] * this.boundaries[1] + newZ * this.boundaries[1] + newY;

        this.swapArray[newIdx] = this.localData[ind];
        this.localData[ind] = null;
        this.swapSet.add(newIdx);
      }
    }

    // for (const idx of this.swapSet) {
    //   this.localData[idx] = this.swapArray[idx];
    // }

    // convert 1D index to 3D index

    // for (let x = 0; x < this.boundaries[0]; x++) {
    //   for (let z = 0; z < this.boundaries[1]; z++) {
    //     for (let y = 0; y < this.boundaries[2]; y++) {

    //       const newX = x + diff.x;
    //       const newY = y + diff.y;
    //       const newZ = z + diff.z;

    //       if (newX >= 0 && newX < this.boundaries[0] && newY >= 0 && newY < this.boundaries[1] && newZ >= 0 && newZ < this.boundaries[2]) {
    //         const idx = x * this.boundaries[2] * this.boundaries[1] + z * this.boundaries[1] + y;
    //         const newIdx = newX * this.boundaries[2] * this.boundaries[1] + newZ * this.boundaries[1] + newY;

    //         this.swapArray[newIdx] = this.localData[idx];
    //       }
    //     }
    //   }
    // }

    // generate 3D array for debugging

    // const test = new Array(this.boundaries[0]).fill(null).map(() => new Array(this.boundaries[2]).fill(null).map(() => new Array(this.boundaries[1]).fill(null)));

    // const test1 = new Array(this.boundaries[0]).fill(null).map(() => new Array(this.boundaries[2]).fill(null).map(() => new Array(this.boundaries[1]).fill(null)));
    // for (let x = 0; x < this.boundaries[0]; x++) {
    //   for (let z = 0; z < this.boundaries[2]; z++) {
    //     for (let y = 0; y < this.boundaries[1]; y++) {
    //       const idx = x * this.boundaries[2] * this.boundaries[1] + z * this.boundaries[1] + y;
    //       test[x][z][y] = `${x},${y},${z} -> ${this.localData[idx]}`
    //       // test[idx] = newLocalData[idx];

    //     }}}

    //     for (let x = 0; x < this.boundaries[0]; x++) {
    //       for (let z = 0; z < this.boundaries[2]; z++) {
    //         for (let y = 0; y < this.boundaries[1]; y++) {
    //           const idx = x * this.boundaries[2] * this.boundaries[1] + z * this.boundaries[1] + y;
    //           test1[x][z][y] = `${x},${y},${z} -> ${newLocalData[idx]}`
    //           // test[idx] = newLocalData[idx];

    //         }}}

    //         console.log('shift', diff)
    //   console.log('org')
    // console.log(test)
    // console.log('new')
    // console.log(test1)

    for (let i = 0; i < this.maxBound; i++) {
      // if (this.swapArray[i] !== null)
      this.localData[i] = this.swapArray[i];
    }
  }

  private lastPos?: Vec3;
  getNeighbors(currentMove: Move): Move[] {
    const moves: Move[] = [];

    const pos = currentMove.exitPos.floored();
    this.shiftLocalData(this.lastPos ?? pos, pos);
    this.lastPos = pos;

    // const arr = new Array(this.maxBound).fill(null);

    for (const newMove of this.recognizedMovements) {
      newMove.loadMove(currentMove);
      newMove.loadLocalData(pos, this.boundaries, this.localData, this.toClear);
      newMove.provideMovements(currentMove, moves, this.goal);
    }

    // this.resetLocalData(); // same speed, but less memory efficient.

    // console.log(moves.length, moves.map(m=>m.moveType.constructor.name))

    return moves;

    // for differences less than 1 block, we only supply best movement to said block.

    if (moves.length === 0) return moves;

    const visited = new Set();
    for (const move of moves) {
      visited.add(move.hash);
    }

    // console.log(visited)

    const ret = [];
    for (const visit of visited) {
      const tmp = moves.filter((m) => m.hash === visit);
      const wantedCost = stableSort1(tmp, (a, b) => a.cost - b.cost)[0].cost;
      const wanted = tmp.filter((m) => m.cost === wantedCost).sort((a, b) => this.goal.heuristic(a) - this.goal.heuristic(b))[0]!;
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
