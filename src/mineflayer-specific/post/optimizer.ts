import { Bot } from "mineflayer";
import { BuildableOptimizer, OptimizationMap, OptimizationSetup } from ".";
import { Algorithm, Path } from "../../abstract";
import { PathData, PathNode } from "../../abstract/node";
import { BuildableMoveProvider, MovementProvider } from "../movements";
import { World } from "../world/worldInterface";
import { Move } from "../move";
import { BaseSimulator, EntityPhysics } from "@nxg-org/mineflayer-physics-util";

export abstract class MovementOptimizer {
  bot: Bot;
  world: World;
  sim: BaseSimulator;

  constructor(bot: Bot, world: World) {
    this.bot = bot;
    this.world = world;
    this.sim = new BaseSimulator(new EntityPhysics(bot.registry));
  }

  abstract identEndOpt(currentIndex: number, path: Move[]): number | Promise<number>;

  mergeMoves(startIndex: number, endIndex: number, path: readonly Move[]) {

    // console.log('merging', path[startIndex].moveType.constructor.name, path[endIndex].moveType.constructor.name, path.length)
      const startMove = path[startIndex];
      const endMove = path[endIndex];
  
      // console.log('start', startMove.x, startMove.y, startMove.z, startMove.entryPos, startMove.moveType.constructor.name)
      // console.log('end', endMove.x, endMove.y, endMove.z, endMove.exitPos, endMove.moveType.constructor.name)
      const toBreak = [...startMove.toBreak];
      const toPlace = [...startMove.toPlace];
      let costSum = 0;
  
      for (let i = startIndex + 1; i <= endIndex; i++) {
        const intermediateMove = path[i];
        toBreak.push(...intermediateMove.toBreak);
        toPlace.push(...intermediateMove.toPlace);
  
        // TODO: calculate semi-accurate cost by reversing C heuristic of algorithm,
        // and then calculating the cost of the path from the start to the end.
        costSum += intermediateMove.cost;
      }
  
      // console.log('fully merged', startMove.entryPos, endMove.exitPos, costSum)
      return new Move(
        startMove.x,
        startMove.y,
        startMove.z,
        toPlace,
        toBreak,
        endMove.remainingBlocks,
        endMove.cost - startMove.cost,
        startMove.moveType,
        startMove.entryPos,
        startMove.entryVel,
        endMove.exitPos,
        endMove.exitVel,
        startMove.parent
      );
  }
}

export class Optimizer {
  optMap: OptimizationMap;


  private pathCopy!: Move[];
  private currentIndex: number;

  constructor(bot: Bot, world: World, optMap: OptimizationMap) {
    this.currentIndex = 0;
    this.optMap = optMap;
  }

  loadPath(path: Move[]) {
    console.log('original path length', path.length)
    this.pathCopy = path;
    this.currentIndex = 0;
  }

  sanitize() {
    return !!this.pathCopy;
  }

  private mergeMoves(startIndex: number, endIndex: number, optimizer: MovementOptimizer) {

    const newMove = optimizer.mergeMoves(startIndex, endIndex, this.pathCopy);

    // console.log("from\n\n", this.pathCopy.map((m, i)=>[i,m.x,m.y,m.z, m.moveType.constructor.name]).join('\n'))
    this.pathCopy[startIndex] = newMove;
    this.pathCopy.splice(startIndex + 1, endIndex - startIndex);
    // console.log("to\n\n", this.pathCopy.map((m,i)=>[i,m.x,m.y,m.z, m.moveType.constructor.name]).join('\n'))
  }

  async compute() {

    if (!this.sanitize()) {
      throw new Error("Optimizer not sanitized");
    };

    while (this.currentIndex < this.pathCopy.length) {
      const move = this.pathCopy[this.currentIndex];
      const opt = this.optMap.get(move.moveType.constructor as BuildableMoveProvider);
      console.log(opt?.constructor.name, this.currentIndex)
      if (!opt) {
        this.currentIndex++;
        continue;
      }
      const newEnd = await opt.identEndOpt(this.currentIndex, this.pathCopy);

      console.log('found opt for:', opt?.constructor.name, this.currentIndex, ': here, newEnd', newEnd)
      if (newEnd !== this.currentIndex) {
        this.mergeMoves(this.currentIndex, newEnd, opt);
      }

      // we simply move onto next movement, which will be the next movement after the merged movement.
      this.currentIndex++;
    }

    console.log('optimized path length', this.pathCopy.length)
    return this.pathCopy;
  }

  makeResult(): Move[] {
    return this.pathCopy;
  }
}
