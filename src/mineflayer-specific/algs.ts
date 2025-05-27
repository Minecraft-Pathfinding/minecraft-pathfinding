import { Goal, MovementProvider, Path as APath } from '../abstract'
import { AStarBackOff as AAStarBackOff } from '../abstract/algorithms/astar'
import { CPathNode } from '../abstract/node'
import { PathStatus } from '../types'
import { Move } from './move'
import { PathNode } from './node'

export interface Path extends APath<Move, AStar> {}
export interface OptPath extends Path {
  optPath: Move[]
}

export interface PathProducer {
  // constructor(start: Data, goal: goals.Goal, settings: Settings): PathProducer

  getCurrentPath: () => Move[]
  getAstarContext: () => AStar | undefined
  advance: () => { result: Path, astarContext: AStar }
}

export class AStar extends AAStarBackOff<Move> {
  visitedChunks: Set<string>

  mostRecentNode: PathNode = this.bestNode // also known as start
  constructor (
    start: Move,
    movements: MovementProvider<Move>,
    goal: Goal<Move>,
    timeout: number,
    tickTimeout = 40,
    searchRadius = -1,
    differential = 0
  ) {
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

    this.mostRecentNode = node
  }

  public override compute (): Path {
    // slightly slower, but yknow compliant with typescript bitching.
    return {
      ...super.compute(),
      context: this
    }
  }
}

export class AStarNeighbor extends AStar {
  makeResult (status: PathStatus, node: PathNode): Path {
    return {
      ...super.makeResult(status, node),
      context: this
    }
  }

  compute (): Path {
    const computeStartTime = performance.now()

    if (!this.movementProvider.sanitize()) {
      throw new Error('Movement Provider was not properly configured!')
    }

    while (!this.openHeap.isEmpty()) {
      if ((++this.nodeConsiderCount & this.checkInterval) === 0) {
        const time = performance.now()
        if (time - computeStartTime > this.tickTimeout) {
          // compute time per tick
          return this.makeResult('partial', this.getActualBestNode())
        }
        if (this.timeout >= 0 && time - this.startTime > this.timeout) {
          // total compute time
          return this.makeResult('timeout', this.getActualBestNode())
        }
      }
      // const node = this.openHeap.poll()!
      const node = this.openHeap.pop()

      // again, cannot afford another if-statement.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (this.goal.isEnd(node.data!)) {
        return this.makeResult('success', node)
      }
      // not done yet
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.openDataMap.delete(node.data!.hash)

      this.test(node, 1)
      //   this.test(this.bestNode, 1)

      //   if (this.callAmt++ % 50 === 0) {
      //     this.test(this.bestNode, 3)
      //   }
    }
    // all the neighbors of every accessible node have been exhausted
    return this.makeResult('noPath', this.getActualBestNode())
  }

  private test (node: PathNode, maxDepth: number, depth = 0, seen = new Set()): void {
    if (depth > maxDepth) return

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (this.closedDataSet.has(node.data!.hash)) {
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (seen.has(node.data!.hash)) {
      // console.log('seen!')
      return
    }

    const test = node
    let bestLocal = test
    // if (node.f < this.bestNode.f - 50) return;

    // allow specific implementations to access visited and closed data.
    this.addToClosedDataSet(node)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const neighbors = this.movementProvider.getNeighbors(node.data!, this.closedDataSet)
    for (const neighborData of neighbors) {
      if (this.closedDataSet.has(neighborData.hash)) {
        continue // skip closed neighbors
      }

      // if (seen.has(neighborData.hash)) {
      //   // console.log('seen!')
      //   continue;
      // }

      // seen.add(neighborData.hash)

      // console.trace('called with:', node.data?.hash, neighborData.hash, seen.size, depth)

      const gFromThisNode = node.g + neighborData.cost
      const pastNeighbor = this.openDataMap.get(neighborData.hash)

      const heuristic = this.heuristic(neighborData)
      if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost) continue

      if (pastNeighbor === undefined) {
        // add neighbor to the open set
        const neighbor = new CPathNode(gFromThisNode, heuristic, neighborData, node)
        this.assignBestNodes(neighbor)
        // if (neighbor.h < this.bestNode.h) this.bestNode = neighbor
        if (neighbor.h < test.h) {
          bestLocal = neighbor
          // bestLocal = neighbor;
          // oldBestCost = pastNeighborNode.f;
          // this.test(neighbor, maxDepth, depth + 1, seen)
        }

        this.openDataMap.set(neighborData.hash, neighbor)
        this.openHeap.push(neighbor)
      } else if (gFromThisNode - pastNeighbor.g < this.differential) {
        pastNeighbor.update(gFromThisNode, heuristic, neighborData, node)
        this.assignBestNodes(pastNeighbor)
        this.openHeap.update(pastNeighbor)
        // if (pastNeighbor.h < this.bestNode.h) this.bestNode = pastNeighbor
        if (pastNeighbor.h < test.h) {
          bestLocal = pastNeighbor
          // this.test(pastNeighbor, maxDepth, depth + 1, seen)
          // bestLocal = pastNeighborNode;
        }
      }
    }
    if (bestLocal !== test) {
      this.test(bestLocal, maxDepth, depth + 1, seen)
    }
  }
}
