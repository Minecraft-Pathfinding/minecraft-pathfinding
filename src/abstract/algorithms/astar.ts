import { Goal, MovementProvider, Path, Algorithm } from '../'
import { BinaryHeapOpenSet as Heap } from '../heap'
// import {MinHeap as Heap} from 'heap-typed'
import { CPathNode, PathData, PathNode } from '../node'

export function reconstructPath<Data extends PathData> (node: PathNode<Data>): Data[] {
  const path: Data[] = []
  while (node.parent != null) {
    if (node.data == null) throw new Error('Node data is null!') // should never occur.
    path.push(node.data)
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
  openHeap: Heap<Data, PathNode<Data>> // Heap<<PathNode<Data>>
  openDataMap: Map<string, PathNode<Data>>

  bestNode: PathNode<Data>
  maxCost: number

  checkInterval = 1 << 5 - 1
  checkCounter = 0

  constructor (
    start: Data,
    movements: MovementProvider<Data>,
    goal: Goal<Data>,
    timeout: number,
    tickTimeout = 40,
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
  makeResult (status: string, node: PathNode<Data>): Path<Data, AStar<Data>> {
    console.log(
      status,
      // this.goal,
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

  compute (): Path<Data, AStar<Data>> {
    const computeStartTime = performance.now()

    if (!this.movementProvider.sanitize()) {
      throw new Error('Movement Provider was not properly configured!')
    }

    while (!this.openHeap.isEmpty()) {
      if ((++this.checkCounter & this.checkInterval) === 0) {
        const time = performance.now()
        if (time - computeStartTime > this.tickTimeout) {
          // compute time per tick
          console.log('hey', time - computeStartTime)
          return this.makeResult('partial', this.bestNode)
        }
        if (this.timeout >= 0 && time - this.startTime > this.timeout) {
          // total compute time
          return this.makeResult('timeout', this.bestNode)
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

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const neighbors = this.movementProvider.getNeighbors(node.data!, this.closedDataSet)
      for (const neighborData of neighbors) {
        if (this.closedDataSet.has(neighborData.hash)) {
          continue // skip closed neighbors
        }
        const gFromThisNode = node.g + neighborData.cost
        const pastNeighborNode = this.openDataMap.get(neighborData.hash)

        const heuristic = this.heuristic(neighborData)
        if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost) continue

        if (pastNeighborNode === undefined) {
          // add neighbor to the open set
          const neighbor = new CPathNode(gFromThisNode, heuristic, neighborData, node)

          if (neighbor.h < this.bestNode.h) this.bestNode = neighbor
          // properties will be set later
          this.openDataMap.set(neighborData.hash, neighbor)
          this.openHeap.push(neighbor)
        } else if (gFromThisNode - pastNeighborNode.g < this.differential) {
          pastNeighborNode.update(gFromThisNode, heuristic, neighborData, node)
          this.openHeap.update(pastNeighborNode)
          if (pastNeighborNode.h < this.bestNode.h) this.bestNode = pastNeighborNode
        }

        // allow specific implementations to access visited and closed data.
        this.addToClosedDataSet(node)

        // found a new or better route.
        // update this neighbor with this node as its new parent

        // console.log(neighborNode.data!.x, neighborNode.data!.y, neighborNode.data!.z, neighborNode.g, neighborNode.h)

        // if (update) {
        //   // this.openHeap.
        //   // // this.openHeap.
        //   this.openHeap.update(neighborNode)
        // } else {
        //   // this.openHeap.add(neighborNode)
        //   this.openHeap.push(neighborNode)
        // }
      }
    }
    // all the neighbors of every accessible node have been exhausted
    return this.makeResult('noPath', this.bestNode)
  }
}

export class AStarBackOff<Data extends PathData> extends AStar<Data> {
  bestNode0: PathNode<Data> = this.bestNode
  bestNode1: PathNode<Data> = this.bestNode
  bestNode2: PathNode<Data> = this.bestNode
  bestNode3: PathNode<Data> = this.bestNode
  bestNode4: PathNode<Data> = this.bestNode
  bestNode5: PathNode<Data> = this.bestNode
  bestNode6: PathNode<Data> = this.bestNode

  bn0: number = Number.MAX_VALUE
  bn1: number = Number.MAX_VALUE
  bn2: number = Number.MAX_VALUE
  bn3: number = Number.MAX_VALUE
  bn4: number = Number.MAX_VALUE
  bn5: number = Number.MAX_VALUE
  bn6: number = Number.MAX_VALUE

  // these are stolen from baritone. Thanks guys.
  x0 = 1 / 1.5
  x1 = 1 / 2
  x2 = 1 / 2.5
  x3 = 1 / 3
  x4 = 1 / 4
  x5 = 1 / 5
  x6 = 1 / 10

  checkInterval = 1 << 5 - 1
  checkCounter = 0

  assignBestNodes (check: PathNode<Data>): void {
    if (check.h < this.bestNode.h) {
      // mf-pathfinder way
      this.bestNode = check
    }

    if (check.h + check.g * this.x0 < this.bn0) {
      this.bestNode0 = check
      this.bn0 = check.h + check.g * this.x0 - this.differential
    }

    if (check.h + check.g * this.x1 < this.bn1) {
      this.bestNode1 = check
      this.bn1 = check.h + check.g * this.x1 - this.differential
    }

    if (check.h + check.g * this.x2 < this.bn2) {
      this.bestNode2 = check
      this.bn2 = check.h + check.g * this.x2 - this.differential
    }

    if (check.h + check.g * this.x3 < this.bn3) {
      this.bestNode3 = check
      this.bn3 = check.h + check.g * this.x3 - this.differential
    }

    if (check.h + check.g * this.x4 < this.bn4) {
      this.bestNode4 = check
      this.bn4 = check.h + check.g * this.x4 - this.differential
    }

    if (check.h + check.g * this.x5 < this.bn5) {
      this.bestNode5 = check
      this.bn5 = check.h + check.g * this.x5 - this.differential
    }

    if (check.h + check.g * this.x6 < this.bn6) {
      this.bestNode6 = check
      this.bn6 = check.h + check.g * this.x6 - this.differential
    }
  }

  getActualBestNode (): PathNode<Data> {
    // console.log('check bn6')
    if (this.bestNode6.h > 5) return this.bestNode6
    // console.log('check bn5')
    if (this.bestNode5.h > 5) return this.bestNode5
    // console.log('check bn4')
    if (this.bestNode4.h > 5) return this.bestNode4
    // console.log('check bn3')
    if (this.bestNode3.h > 5) return this.bestNode3
    // console.log('check bn2')
    if (this.bestNode2.h > 5) return this.bestNode2
    // console.log('check bn1')
    if (this.bestNode1.h > 5) return this.bestNode1
    // console.log('check bn0')
    if (this.bestNode0.h > 5) return this.bestNode0

    return this.bestNode
  }

  compute (): Path<Data, AStar<Data>> {
    const computeStartTime = performance.now()

    if (!this.movementProvider.sanitize()) {
      throw new Error('Movement Provider was not properly configured!')
    }

    while (!this.openHeap.isEmpty()) {
      if ((++this.checkCounter & this.checkInterval) === 0) {
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

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const neighbors = this.movementProvider.getNeighbors(node.data!, this.closedDataSet)
      for (const neighborData of neighbors) {
        if (this.closedDataSet.has(neighborData.hash)) {
          continue // skip closed neighbors
        }
        const gFromThisNode = node.g + neighborData.cost
        const pastNeighborNode = this.openDataMap.get(neighborData.hash)

        const heuristic = this.heuristic(neighborData)
        if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost) continue

        if (pastNeighborNode === undefined) {
          // add neighbor to the open set
          const neighbor = new CPathNode(gFromThisNode, heuristic, neighborData, node)
          this.openDataMap.set(neighborData.hash, neighbor)
          this.openHeap.push(neighbor)
          this.assignBestNodes(neighbor)
        } else if (gFromThisNode - pastNeighborNode.g < this.differential) {
          pastNeighborNode.update(gFromThisNode, heuristic, neighborData, node)
          this.openHeap.update(pastNeighborNode)
          this.assignBestNodes(pastNeighborNode)
        }

        // allow specific implementations to access visited and closed data.
        this.addToClosedDataSet(node)

        // found a new or better route.
        // update this neighbor with this node as its new parent

        // console.log(neighborNode.data!.x, neighborNode.data!.y, neighborNode.data!.z, neighborNode.g, neighborNode.h)

        // if (update) {
        //   // this.openHeap.
        //   // // this.openHeap.
        //   this.openHeap.update(neighborNode)
        // } else {
        //   // this.openHeap.add(neighborNode)
        //   this.openHeap.push(neighborNode)
        // }
      }
    }
    // all the neighbors of every accessible node have been exhausted
    return this.makeResult('noPath', this.getActualBestNode())
  }
}
