import { Goal, MovementProvider } from "../abstract";
import { AStar as AAStar} from "../abstract/algorithms/astar";
import { Move } from "./move";
import { PathNode } from "./node";


export class AStar extends AAStar<Move> {
  visitedChunks: Set<string>;

  constructor(start: Move, movements: MovementProvider<Move>, goal: Goal<Move>, timeout: number, tickTimeout = 40, searchRadius = -1) {
    super(start, movements, goal, timeout, tickTimeout, searchRadius);
    this.visitedChunks = new Set();
  }

  protected addToClosedDataSet(node: PathNode) {
    this.closedDataSet.add(node.data!.hash);
    this.visitedChunks.add(`${node.data!.x >> 4},${node.data!.z >> 4}`);
  }
}

export class StepBackAStar extends AStar {
  constructor(start: Move, movements: MovementProvider<Move>, goal: Goal<Move>, timeout: number, tickTimeout = 40, searchRadius = -1) {
    super(start, movements, goal, timeout, tickTimeout, searchRadius);
  }

  protected addToClosedDataSet(node: PathNode) {
    this.closedDataSet.add(node.data!.hash);
    this.visitedChunks.add(`${node.data!.x >> 4},${node.data!.z >> 4}`);
  }

  protected heuristic(node: Move) {
    // return 0;
    return this.goal.heuristic(node);
  }
}
