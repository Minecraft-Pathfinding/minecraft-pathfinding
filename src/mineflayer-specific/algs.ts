import { Goal, MovementProvider, Path as APath } from '../abstract'
import { AStar as AAStar } from '../abstract/algorithms/astar'
import { Move } from './move'
import { PathNode } from './node'

export interface Path extends APath<Move, AStar> {
}

export interface PathProducer {
  // constructor(start: Data, goal: goals.Goal, settings: Settings): PathProducer

  getAstarContext: () => AStar | undefined
  advance: () => { result: Path, astarContext: AStar }
}

export class AStar extends AAStar<Move> {
  visitedChunks: Set<string>

  constructor (start: Move, movements: MovementProvider<Move>, goal: Goal<Move>, timeout: number, tickTimeout = 45, searchRadius = -1, differential = 0) {
    super(start, movements, goal, timeout, tickTimeout, searchRadius, differential)
    this.visitedChunks = new Set()
  }

  protected addToClosedDataSet (node: PathNode): void {
    // Checking with if statement is slow.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.closedDataSet.add(node.data!.hash)

    // Checking with if statement is slow.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.visitedChunks.add(`${node.data!.x >> 4},${node.data!.z >> 4}`)
  }

  public override compute (): Path {
    // slightly slower, but yknow compliant with typescript bitching.
    return {
      ...super.compute(),
      context: this
    }
  }
}
