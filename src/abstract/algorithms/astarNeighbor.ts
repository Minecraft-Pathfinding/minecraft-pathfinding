import { Goal, MovementProvider, Path, Algorithm } from '../'
import { BinaryHeapOpenSet as Heap } from '../heap'
// import {MinHeap as Heap} from 'heap-typed'
import { CPathNode, PathData, PathNode } from '../node'

function reconstructPath<Data extends PathData> (node: PathNode<Data>): Data[] {
  const path: Data[] = []
  while (node.parent != null) {
    if (node.data == null) throw new Error('Node data is null!') // should never occur.
    path.push(node.data)
    node = node.parent
  }
  return path.reverse()
}

export class AStarNeighbor<Data extends PathData = PathData> implements Algorithm<Data> {
  startTime: number
  goal: Goal<Data>
  timeout: number
  tickTimeout: number
  differential: number
  movementProvider: MovementProvider<Data>

  closedDataSet: Set<string>
  openHeap: Heap<Data, PathNode<Data>> // Heap<<PathNode<Data>>
  openDataMap: Map<string, PathNode<Data>>

  bestNode: PathNode<Data>
  maxCost: number

  constructor (
    start: Data,
    movements: MovementProvider<Data>,
    goal: Goal<Data>,
    timeout: number,
    tickTimeout = 45,
    searchRadius = -1,
    differential = 0
  ) {
    this.startTime = performance.now()

    this.movementProvider = movements
    this.goal = goal
    this.timeout = timeout
    this.tickTimeout = tickTimeout
    this.differential = differential

    this.closedDataSet = new Set()
    this.openHeap = new Heap() // new Heap(undefined, {comparator: (a, b)=> a.f - b.f})
    this.openDataMap = new Map()

    const startNode = new PathNode<Data>().update(0, goal.heuristic(start), start)

    // dumb type check, thanks ts-standard.
    if (startNode.data == null) throw new Error('Start node data is null!')

    // this.openHeap.add(startNode)
    this.openHeap.push(startNode)
    this.openDataMap.set(startNode.data.hash, startNode)
    this.bestNode = startNode

    this.maxCost = searchRadius < 0 ? -1 : startNode.h + searchRadius
  }

  protected addToClosedDataSet (node: PathNode<Data>): void {
    // data is not null here. Adding a check is slow.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.closedDataSet.add(node.data!.hash)
  }

  protected heuristic (node: Data): number {
    return this.goal.heuristic(node)
  }

  // for debugging.
  private lastAmt: number = 0
  makeResult (status: string, node: PathNode<Data>): Path<Data, AStarNeighbor<Data>> {
    console.log(
      status,
      performance.now() - this.startTime,
      node.g,
      this.closedDataSet.size,
      this.closedDataSet.size + this.openHeap.size(),
      reconstructPath(node).length,

      `${this.closedDataSet.size - this.lastAmt} nodes visited in this tick.`,
      // reconstructPath(node)

      // used heap memory
      Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10,
      'MB'
    )

    this.lastAmt = this.closedDataSet.size

    return {
      status,
      cost: node.g,
      calcTime: performance.now() - this.startTime,
      visitedNodes: this.closedDataSet.size,
      generatedNodes: this.closedDataSet.size + this.openHeap.size(),
      movementProvider: this.movementProvider,
      path: reconstructPath(node),
      context: this
    }
  }

  private readonly callAmt = 0
  compute (): Path<Data, AStarNeighbor<Data>> {
    const computeStartTime = performance.now()

    if (!this.movementProvider.sanitize()) {
      throw new Error('Movement Provider was not properly configured!')
    }

    while (!this.openHeap.isEmpty()) {
      const time = performance.now()
      if (time - computeStartTime > this.tickTimeout) {
        // compute time per tick
        return this.makeResult('partial', this.bestNode)
      }
      if (this.timeout >= 0 && time - this.startTime > this.timeout) {
        // total compute time
        return this.makeResult('timeout', this.bestNode)
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
    return this.makeResult('noPath', this.bestNode)
  }

  private test (node: PathNode<Data>, maxDepth: number, depth = 0, seen = new Set()): void {
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

    // if (node.f < this.bestNode.f - 50) return;

    let oldBestCost = this.bestNode.f - node.f

    // allow specific implementations to access visited and closed data.
    this.addToClosedDataSet(node)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const neighbors = this.movementProvider.getNeighbors(node.data!, this.closedDataSet)
    for (const neighborData of neighbors) {
      if (this.closedDataSet.has(neighborData.hash)) {
        continue // skip closed neighbors
      }

      //   if (seen.has(neighborData.hash)) {
      //     // console.log('seen!')
      //     continue;
      //   }

      //   seen.add(neighborData.hash)

      //   console.log('called with:', node.data?.hash, neighborData.hash, seen.size, depth)

      const gFromThisNode = node.g + neighborData.cost
      const pastNeighbor = this.openDataMap.get(neighborData.hash)

      const heuristic = this.heuristic(neighborData)
      if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost) continue

      if (pastNeighbor === undefined) {
        // add neighbor to the open set
        const neighbor = new CPathNode(gFromThisNode, heuristic, neighborData, node)
        if (neighbor.h < this.bestNode.h) this.bestNode = neighbor
        if (neighbor.f - node.f < oldBestCost) {
          oldBestCost = neighbor.f - node.f
          // bestLocal = neighbor;
          // oldBestCost = pastNeighborNode.f;
          this.test(neighbor, maxDepth, depth + 1, seen)
        }

        this.openDataMap.set(neighborData.hash, neighbor)
        this.openHeap.push(neighbor)
      } else if (gFromThisNode - pastNeighbor.g < this.differential) {
        pastNeighbor.update(gFromThisNode, heuristic, neighborData, node)
        this.openHeap.update(pastNeighbor)
        if (pastNeighbor.h < this.bestNode.h) this.bestNode = pastNeighbor
        if (pastNeighbor.f - node.f < oldBestCost) {
          oldBestCost = pastNeighbor.f - node.f
          this.test(pastNeighbor, maxDepth, depth + 1, seen)
          // bestLocal = pastNeighborNode;
        }
      } else continue
    }

    // if (bestLocal && depth < maxDepth) {
    //     this.test(bestLocal, maxDepth, depth + 1);
    // }
  }
}
