import { Goal, MovementProvider, Path } from "../abstract"
import { BinaryHeapOpenSet as Heap } from "../abstract/heap";
import { Move } from "./move";
import { PathNode } from "./node"

function reconstructPath (node: PathNode) {
    const path: Move[] = []
    while (node.parent) {
      path.push(node.data!)
      node = node.parent
    }
    return path.reverse()
  }

export class AStar {
    startTime: number;
    goal: Goal;
    timeout: number;
    tickTimeout: number;
    movements: MovementProvider;

    closedDataSet: Set<string>;
    openHeap: Heap<PathNode>;
    openDataMap: Map<string, PathNode>;

    bestNode: PathNode;
    maxCost: number;
    visitedChunks: Set<string>;


    constructor (start: Move, movements: MovementProvider, goal: Goal, timeout: number, tickTimeout = 40, searchRadius = -1) {
      this.startTime = performance.now()
  
      this.movements = movements
      this.goal = goal
      this.timeout = timeout
      this.tickTimeout = tickTimeout
  
      this.closedDataSet = new Set()
      this.openHeap = new Heap()
      this.openDataMap = new Map()
  
      const startNode = new PathNode().set(0, goal.heuristic(start), start)
      this.openHeap.push(startNode)
      this.openDataMap.set(startNode.data!.hash, startNode)
      this.bestNode = startNode
  
      this.maxCost = searchRadius < 0 ? -1 : startNode.h + searchRadius
      this.visitedChunks = new Set()
    }
  
    makeResult (status: string, node: PathNode): Path<AStar, Move> {
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
        if (this.goal.reachesGoal(node.data!)) {
          return this.makeResult('success', node)
        }
        // not done yet
        this.openDataMap.delete(node.data!.hash)
        this.closedDataSet.add(node.data!.hash)
        this.visitedChunks.add(`${node.data!.gX >> 4},${node.data!.gZ >> 4}`)
  
        const neighbors = this.movements.getNeighbors(node.data!)
        for (const neighborData of neighbors) {
          if (this.closedDataSet.has(neighborData.hash)) {
            continue // skip closed neighbors
          }
          const gFromThisNode = node.g + neighborData.cost
          let neighborNode = this.openDataMap.get(neighborData.hash)
          let update = false
  
          const heuristic = this.goal.heuristic(neighborData)
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