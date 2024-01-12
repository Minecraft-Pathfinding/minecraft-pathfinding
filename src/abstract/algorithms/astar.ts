import { Goal, MovementProvider, Path } from "../"
import { BinaryHeapOpenSet as Heap } from "../heap";
import { PathData, PathNode } from "../node"

function reconstructPath<Data extends PathData> (node: PathNode<Data>) {
    const path: Data[] = []
    while (node.parent) {
      path.push(node.data!)
      node = node.parent
    }
    return path.reverse()
  }

export class AStar<Data extends PathData = PathData> {
    startTime: number;
    goal: Goal<Data>;
    timeout: number;
    tickTimeout: number;
    movements: MovementProvider<Data>;

    closedDataSet: Set<string>;
    openHeap: Heap<Data, PathNode<Data>>;
    openDataMap: Map<string, PathNode<Data>>;

    bestNode: PathNode<Data>;
    maxCost: number;

    constructor (start: Data, movements: MovementProvider<Data>, goal: Goal<Data>, timeout: number, tickTimeout = 40, searchRadius = -1) {
      this.startTime = performance.now()
  
      this.movements = movements
      this.goal = goal
      this.timeout = timeout
      this.tickTimeout = tickTimeout
  
      this.closedDataSet = new Set()
      this.openHeap = new Heap()
      this.openDataMap = new Map()
  
      const startNode = new PathNode<Data>().set(0, goal.heuristic(start), start)
      this.openHeap.push(startNode)
      this.openDataMap.set(startNode.data!.hash, startNode)
      this.bestNode = startNode
  
      this.maxCost = searchRadius < 0 ? -1 : startNode.h + searchRadius
    }

    protected addToClosedDataSet(node: PathNode<Data>) {
        this.closedDataSet.add(node.data!.hash)
    }

    protected heuristic(node: Data) {
        return this.goal.heuristic(node)
    }

  
    makeResult(status: string, node: PathNode<Data>): Path<Data, AStar<Data>> {
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
      while (!this.openHeap.isEmpty()) {
        if (performance.now() - computeStartTime > this.tickTimeout) { // compute time per tick
          return this.makeResult('partial', this.bestNode)
        }
        if (performance.now() - this.startTime > this.timeout) { // total compute time
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

        const neighbors = this.movements.getNeighbors(node.data!)
        for (const neighborData of neighbors) {
          if (this.closedDataSet.has(neighborData.hash)) {
            continue // skip closed neighbors
          }
          const gFromThisNode = node.g + neighborData.cost
          let neighborNode = this.openDataMap.get(neighborData.hash)
          let update = false
  
          const heuristic = this.heuristic(neighborData);
          if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost) continue
  
          if (neighborNode === undefined) {
            // add neighbor to the open set
            neighborNode = new PathNode()
            // properties will be set later
            this.openDataMap.set(neighborData.hash, neighborNode)
          } else {
            if (neighborNode.g < gFromThisNode) {
              // skip this one because another route is faster
              continue
            }
            update = true
          }
          // found a new or better route.
          // update this neighbor with this node as its new parent
          neighborNode.set( gFromThisNode, heuristic, neighborData, node)
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