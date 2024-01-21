import { Goal, MovementProvider } from '../abstract'
import { AStar as AAStar } from '../abstract/algorithms/astar'
import { Move } from './move'
import { PathNode } from './node'

export class AStar extends AAStar<Move> {
  visitedChunks: Set<string>

  constructor (start: Move, movements: MovementProvider<Move>, goal: Goal<Move>, timeout: number, tickTimeout = 40, searchRadius = -1, differential = 0) {
    super(start, movements, goal, timeout, tickTimeout, searchRadius, differential)
    this.visitedChunks = new Set()
  }

  protected addToClosedDataSet (node: PathNode) {
    this.closedDataSet.add(node.data!.hash)
    this.visitedChunks.add(`${node.data!.x >> 4},${node.data!.z >> 4}`)
  }
}

