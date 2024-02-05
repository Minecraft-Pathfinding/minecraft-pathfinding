import { Vec3 } from "vec3";
import { Path, MovementProvider as AMovementProvider, PathNode, Algorithm } from "../../abstract";
import { Move } from "../move";
import { Movement, MovementProvider } from "../movements";
import { MovementReplacement } from "./replacement";

export class ReplacementHandler implements AMovementProvider<Move> {
  constructor(private orgMove: Move, private replacement: MovementProvider) {}

  static createFromSingle(move: Move, replacement: MovementProvider) {
    return new ReplacementHandler(move, replacement);
  }

  sanitize(): boolean {
    return true;
    // throw new Error("Method not implemented.");
  }
  getNeighbors(org: Move): Move[] {
    throw new Error("Method not implemented.");
  }
}

export class SimpleJumpSprintReplacement extends Movement implements MovementReplacement {
  movementProvider!: ReplacementHandler;

  startPosition!: Vec3;
  endPosition!: Vec3;

  canReplace(move: Move): boolean {
    const sameY = move.entryPos.y === move.exitPos.y;
    const distance = move.entryPos.distanceTo(move.exitPos);

    return sameY && distance > 6;
  }
  initialize(move: Move) {
    this.startPosition = move.entryPos;
    this.endPosition = move.exitPos;

    // this.movementProvider = ReplacementHandler.createFromSingle(move, this);
  }
  compute(): Path<Move, MovementReplacement> | null {
    throw new Error("Method not implemented.");
  }

  makeResult(status: string, node: PathNode<Move>): Path<Move, Algorithm<Move>> {
    return {
      calcTime: 0,
      context: this,
      cost: 0,
      generatedNodes: 0,
      path: [],
      status: "noPath",
      visitedNodes: 0,
    };
  }
}
