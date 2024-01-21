import { Bot } from "mineflayer";
import { OptimizationMap } from ".";
import { Algorithm, Path } from "../../abstract";
import { PathData, PathNode } from "../../abstract/node";
import { BuildableMoveProvider, MovementProvider } from "../movements";
import { World } from "../world/worldInterface";
import { Move } from "../move";

export abstract class MovementOptimizer<Data extends PathData> {
  bot: Bot;
  world: World;
  orgRes: Path<Data, Algorithm<Data>>;

  constructor(bot: Bot, world: World, orgPath: Path<Data, Algorithm<Data>>) {
    this.bot = bot;
    this.world = world;
    this.orgRes = orgPath;
  }

  public get path() {
    return this.orgRes.path;
  }

  abstract identEndOpt(currentIndex: number): number | Promise<number>;
}

type BuildableOptimizer<Data extends PathData> = new (
  bot: Bot,
  world: World,
  orgRes: Path<Data, Algorithm<Data>>
) => MovementOptimizer<Data>;

export class Optimizer {
  orgPath: Path<Move, Algorithm<Move>>;
  optMap: Map<BuildableMoveProvider, MovementOptimizer<Move>>;

  private pathCopy: Path<Move, Algorithm<Move>>;
  private currentIndex: number;

  constructor(bot: Bot, world: World, orgPath: Path<Move, Algorithm<Move>>, optMap: Map<BuildableMoveProvider, BuildableOptimizer<Move>>) {
    this.orgPath = orgPath;
    this.pathCopy = orgPath; // TODO: Copy path.
    this.currentIndex = 0;

    const test = new Map();

    for (const [provider, optimizer] of optMap.entries()) {
      test.set(provider, new optimizer(bot, world, orgPath));
    }

    this.optMap = test;
  }


  private mergeMoves(startIndex: number, endIndex: number) {
    const startMove = this.pathCopy.path[startIndex];
    const endMove = this.pathCopy.path[endIndex];

    const toBreak = [];
    const toPlace = [];
    let costSum = 0;

    for (let i = startIndex + 1; i < endIndex; i++) {
      const intermediateMove = this.pathCopy.path[i];
      toBreak.push(...intermediateMove.toBreak);
      toPlace.push(...intermediateMove.toPlace);

      // TODO: calculate semi-accurate cost by reversing C heuristic of algorithm,
      // and then calculating the cost of the path from the start to the end.
      costSum += intermediateMove.cost;
    }

    const newMove = new Move(
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

    this.pathCopy.path[startIndex] = newMove;
    this.pathCopy.path.splice(startIndex + 1, endIndex - startIndex);
  }

  async compute() {
    while (this.currentIndex < this.pathCopy.path.length) {
      const move = this.orgPath.path[this.currentIndex];
      const opt = this.optMap.get(move.moveType.constructor as BuildableMoveProvider);
      if (!opt) continue;
      const newEnd = await opt.identEndOpt(this.currentIndex);
      if (newEnd !== this.currentIndex) {
        this.mergeMoves(this.currentIndex, newEnd);
      }

      // we simply move onto next movement, which will be the next movement after the merged movement.
      this.currentIndex++;
    }
  }

  makeResult(status: string, node: PathNode<Move>): Path<Move, Algorithm<Move>> {
    return null as any;
    // return this.orgRes.context.makeResult(status, node);
  }
}
