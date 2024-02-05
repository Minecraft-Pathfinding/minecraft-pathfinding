import { Goal, MovementProvider, Path, Algorithm } from '../'
import { BinaryHeapOpenSet as Heap } from '../heap'
import { PathData, PathNode } from '../node'

function reconstructPath<Data extends PathData> (node: PathNode<Data>) {
  const path: Data[] = []
  while (node.parent != null) {
    path.push(node.data!)
    node = node.parent
  }
  return path.reverse()
}

export class AStar<Data extends PathData = PathData> implements Algorithm<Data> {
  startTime: number
  goal: Goal<Data>
  timeout: number
  tickTimeout: number
  differential: number
  movementProvider: MovementProvider<Data>

  closedDataSet: Set<string>
  openHeap: Heap<Data, PathNode<Data>>
  openDataMap: Map<string, PathNode<Data>>

  bestNode: PathNode<Data>
  maxCost: number

  constructor (start: Data, movements: MovementProvider<Data>, goal: Goal<Data>, timeout: number, tickTimeout = 40, searchRadius = -1, differential = 0) {
    this.startTime = performance.now()

    this.movementProvider = movements
    this.goal = goal
    this.timeout = timeout
    this.tickTimeout = tickTimeout
    this.differential = differential

    this.closedDataSet = new Set()
    this.openHeap = new Heap()
    this.openDataMap = new Map()

    const startNode = new PathNode<Data>().set(0, goal.heuristic(start), start)
    this.openHeap.push(startNode)
    this.openDataMap.set(startNode.data!.hash, startNode)
    this.bestNode = startNode

    this.maxCost = searchRadius < 0 ? -1 : startNode.h + searchRadius
  }

  protected addToClosedDataSet (node: PathNode<Data>) {
    this.closedDataSet.add(node.data!.hash)
  }

  protected heuristic (node: Data) {
    return this.goal.heuristic(node)
  }


  private lastAmt: number = 0;
  makeResult (status: string, node: PathNode<Data>): Path<Data, AStar<Data>> {
    console.log(
      status,
      performance.now() - this.startTime,
      node.g,
      this.closedDataSet.size,
      this.closedDataSet.size + this.openHeap.size(),
      reconstructPath(node).length,

      `${this.closedDataSet.size - this.lastAmt} nodes visited in this tick.`
      // reconstructPath(node)
    );

    this.lastAmt = this.closedDataSet.size;

    return {
      status,
      cost: node.g,
      calcTime: performance.now() - this.startTime,
      visitedNodes: this.closedDataSet.size,
      generatedNodes: this.closedDataSet.size + this.openHeap.size(),
      path: reconstructPath(node),
      context: this
    }
  }

  compute () {
    const computeStartTime = performance.now()

    if (!this.movementProvider.sanitize()) {
      throw new Error('Movement Provider was not properly configured!')
    }

    while (!this.openHeap.isEmpty()) {
      const time = performance.now()
      if (time - computeStartTime > this.tickTimeout) { // compute time per tick
        return this.makeResult('partial', this.bestNode)
      }
      if (this.timeout >= 0 && time - this.startTime > this.timeout) { // total compute time
        return this.makeResult('timeout', this.bestNode)
      }
      const node = this.openHeap.pop()
      if (this.goal.isEnd(node.data!)) {
        return this.makeResult('success', node)
      }
      // not done yet
      this.openDataMap.delete(node.data!.hash)

      // allow specific implementations to access visited and closed data.
      this.addToClosedDataSet(node)

      const neighbors = this.movementProvider.getNeighbors(node.data!)
      for (const neighborData of neighbors) {
        if (this.closedDataSet.has(neighborData.hash)) {
          continue // skip closed neighbors
        }
        const gFromThisNode = node.g + neighborData.cost
        let neighborNode = this.openDataMap.get(neighborData.hash)
        let update = false

        const heuristic = this.heuristic(neighborData)
        if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost) continue

        if (neighborNode === undefined) {
          // add neighbor to the open set
          neighborNode = new PathNode()
          // properties will be set later
          this.openDataMap.set(neighborData.hash, neighborNode)
        } else {
          if (neighborNode.g - gFromThisNode <= this.differential) {
            // skip this one because another route is faster
            continue
          }
          update = true
        }
        // found a new or better route.
        // update this neighbor with this node as its new parent
        neighborNode.set(gFromThisNode, heuristic, neighborData, node)
        // console.log(neighborNode.data!.x, neighborNode.data!.y, neighborNode.data!.z, neighborNode.g, neighborNode.h)
        if (neighborNode.h < this.bestNode.h) this.bestNode = neighborNode
        if (update) {
          this.openHeap.update(neighborNode)
        } else {
          this.openHeap.push(neighborNode)
        }
      }
    }
    // all the neighbors of every accessible node have been exhausted
    return this.makeResult('noPath', this.bestNode)
  }
}
