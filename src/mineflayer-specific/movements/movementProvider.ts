import { Bot } from 'mineflayer'
import { Move } from '../move'
import * as goals from '../goals'
import { World } from '../world/worldInterface'
import { DEFAULT_MOVEMENT_OPTS, Movement, MovementOptions } from './movement'

import { MovementProvider as AMovementProvider } from '../../abstract'
import type { ExecutorMap } from '.'
import { Vec3 } from 'vec3'
import { Vec3Properties } from '../../types'
import { BlockInfo } from '../world/cacheWorld'

/**
 * Movement provider.
 *
 * Provides movements to the pathfinder.
 */
export abstract class MovementProvider extends Movement {
  orgPos!: Vec3
  toClear!: Set<number>

  public constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings)
  }

  abstract movementDirs: Vec3[]

  private boundaries!: [x: number, z: number, y: number]
  // private halfway!: [x: number, z: number, y: number]
  private orgX = 0
  private orgY = 0
  private orgZ = 0
  private boundaryX = 0
  private boundaryZ = 0
  private boundaryY = 0
  private halfX = 0
  private halfZ = 0
  private halfY = 0
  private xStride = 0
  private zStride = 0

  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   *
   *
   * @param {Move} start
   * @param {Move[]} storage put all resulting moves to this storage
   * @param {goals.Goal} goal
   * @param {Set<string>} closed Closed set of hashed positions for movements. Use this to cancel calculation early.
   */
  abstract provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void

  private localData: Array<BlockInfo | null> = []

  loadLocalData (
    orgPos: Vec3,
    boundaries: [x: number, z: number, y: number],
    arr: Array<BlockInfo | null>,
    clear: Set<number>
  ): void {
    this.orgPos = orgPos
    this.orgX = orgPos.x
    this.orgY = orgPos.y
    this.orgZ = orgPos.z
    this.localData = arr
    if (this.boundaries !== boundaries) {
      this.boundaries = boundaries
      // this.halfway = [Math.floor(boundaries[0] / 2), Math.floor(boundaries[1] / 2), Math.floor(boundaries[2] / 2)]
      this.boundaryX = boundaries[0]
      this.boundaryZ = boundaries[1]
      this.boundaryY = boundaries[2]
      this.halfX = Math.floor(boundaries[0] / 2)
      this.halfZ = Math.floor(boundaries[1] / 2)
      this.halfY = Math.floor(boundaries[2] / 2)
      this.zStride = boundaries[2]
      this.xStride = boundaries[2] * boundaries[1]
    }
    this.toClear = clear
    // console.log(this.halfway)
  }

  getBlockInfo (pos: Vec3Properties, dx: number, dy: number, dz: number): BlockInfo {
    return this.getBlockInfoAt(Math.floor(pos.x) + dx, Math.floor(pos.y) + dy, Math.floor(pos.z) + dz)
  }

  getBlockInfoRaw (yes: Vec3): BlockInfo {
    return this.getBlockInfoAt(yes.x, yes.y, yes.z, yes)
  }

  private getBlockInfoAt (x: number, y: number, z: number, pos?: Vec3): BlockInfo {

    const wantedDx = x - this.orgX + this.halfX
    const wantedDz = z - this.orgZ + this.halfZ
    const wantedDy = y - this.orgY + this.halfY

    if (
      wantedDx < 0 ||
      wantedDx >= this.boundaryX ||
      wantedDz < 0 ||
      wantedDz >= this.boundaryZ ||
      wantedDy < 0 ||
      wantedDy >= this.boundaryY
    ) {
      return this.world.getBlockInfo(pos ?? new Vec3(x, y, z))
    }

    const idx = wantedDx * this.xStride + wantedDz * this.zStride + wantedDy
    const data = this.localData[idx]

    if (data !== null) {
      return data
    }

    const ret = this.world.getBlockInfo(pos ?? new Vec3(x, y, z))
    this.localData[idx] = ret
    return ret
  }
}

export class MovementHandler implements AMovementProvider<Move> {
  recognizedMovements: MovementProvider[]
  goal!: goals.Goal
  world: World

  constructor (bot: Bot, world: World, recMovement: MovementProvider[]) {
    this.world = world
    this.recognizedMovements = recMovement
    this.initIndexCoordinates()
  }

  static create (
    bot: Bot,
    world: World,
    recMovement: ExecutorMap,
    settings: Partial<MovementOptions> = {}
  ): MovementHandler {
    const opts = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings)
    return new MovementHandler(
      bot,
      world,
      [...recMovement.keys()].map((M) => new M(bot, world, opts))
    )
  }

  sanitize (): boolean {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    return !!this.goal
  }

  loadGoal (goal: goals.Goal): void {
    this.goal = goal
  }

  private readonly boundaries: [x: number, z: number, y: number] = [19, 19, 7]
  private readonly halfway: [x: number, z: number, y: number] = [Math.floor(this.boundaries[0] / 2), Math.floor(this.boundaries[1] / 2), Math.floor(this.boundaries[2] / 2)]
  private readonly boundaryX = this.boundaries[0]
  private readonly boundaryZ = this.boundaries[1]
  private readonly boundaryY = this.boundaries[2]
  private readonly halfX = this.halfway[0]
  private readonly halfZ = this.halfway[1]
  private readonly halfY = this.halfway[2]
  private readonly xStride = this.boundaries[2] * this.boundaries[1]
  private readonly zStride = this.boundaries[2]

  private readonly maxBound = this.boundaries[0] * this.boundaries[1] * this.boundaries[2]
  private readonly toClear: Set<number> = new Set()
  private readonly localData: Array<BlockInfo | null> = new Array(this.maxBound).fill(null, 0, this.maxBound)
  private readonly indexX = new Int16Array(this.maxBound)
  private readonly indexY = new Int16Array(this.maxBound)
  private readonly indexZ = new Int16Array(this.maxBound)
  private readonly seenMarks = new Uint32Array(this.maxBound)
  private seenStamp = 0

  private initIndexCoordinates (): void {
    for (let idx = 0; idx < this.maxBound; idx++) {
      const x = Math.floor(idx / this.xStride)
      const rest = idx % this.xStride
      this.indexX[idx] = x
      this.indexZ[idx] = Math.floor(rest / this.zStride)
      this.indexY[idx] = rest % this.zStride
    }
  }

  resetLocalData (): void {
    this.localData.fill(null)
  }

  // Do not reassign localData, must do shift in place.

  private readonly swapArray = new Array(this.maxBound).fill(null)
  private readonly swapSet = new Array(this.maxBound)

  static count = 0
  static totCount = 0
  shiftLocalData (orgPos: Vec3, newPos: Vec3): void {
    const diffX = newPos.x - orgPos.x
    const diffY = newPos.y - orgPos.y
    const diffZ = newPos.z - orgPos.z

    if (diffX === 0 && diffY === 0 && diffZ === 0) return

    if (Math.abs(diffX) >= this.boundaryX || Math.abs(diffY) >= this.boundaryY || Math.abs(diffZ) >= this.boundaryZ) {
      this.resetLocalData()
      MovementHandler.totCount++
      return
    }

    let swapIdx = 0
    for (let idx = 0; idx < this.maxBound; idx++) {
      const data = this.localData[idx]
      if (data === null) continue

      const newX = this.indexX[idx] - diffX
      const newY = this.indexY[idx] - diffY
      const newZ = this.indexZ[idx] - diffZ

      if (newX >= 0 && newX < this.boundaryX && newY >= 0 && newY < this.boundaryY && newZ >= 0 && newZ < this.boundaryZ) {
        const newIdx = newX * this.xStride + newZ * this.zStride + newY

        this.swapArray[newIdx] = data

        this.swapSet[swapIdx++] = newIdx
      }

      this.localData[idx] = null
    }

    for (let i = 0; i < swapIdx; i++) {
      const idx = this.swapSet[i]
      this.localData[idx] = this.swapArray[idx]
      this.swapArray[idx] = null
    }
    if (swapIdx > 0) MovementHandler.count++
    MovementHandler.totCount++
  }

  preloadInteractData (orgPos: Vec3, move: Move): void {
    // data has already been shifted, no need to worry.
    let move1: Move | undefined = move
    let exit = false

    let seenStamp = ++this.seenStamp
    if (seenStamp === 0) {
      this.seenMarks.fill(0)
      seenStamp = ++this.seenStamp
    }

    // theoretically, this is incorrect. Newest iteration should occur, not oldest.
    // reverse by starting at root then traversing down.
    // or keep track of changes.
    while (move1 !== undefined && !exit) {
      const wantedDx = move1.x - orgPos.x + this.halfX
      const wantedDz = move1.z - orgPos.z + this.halfZ
      const wantedDy = move1.y - orgPos.y + this.halfY

      if (wantedDx < 0 || wantedDx >= this.boundaryX || wantedDz < 0 || wantedDz >= this.boundaryZ || wantedDy < 0 || wantedDy >= this.boundaryY) {
        exit = true
      }

      for (const m of move1.toPlace) {
        const wantedDx = m.x - orgPos.x + this.halfX
        const wantedDz = m.z - orgPos.z + this.halfZ
        const wantedDy = m.y - orgPos.y + this.halfY

        if (wantedDx < 0 || wantedDx >= this.boundaryX || wantedDz < 0 || wantedDz >= this.boundaryZ || wantedDy < 0 || wantedDy >= this.boundaryY) {
          exit = true
        } else {
          const idx = wantedDx * this.xStride + wantedDz * this.zStride + wantedDy
          if (this.seenMarks[idx] !== seenStamp) {
            this.localData[idx] = m.blockInfo
            this.seenMarks[idx] = seenStamp
          }
        }
      }

      for (const m of move1.toBreak) {
        // idx is the index of the block in the localData array
        // idx is offset from current position
        const wantedDx = m.x - orgPos.x + this.halfX
        const wantedDz = m.z - orgPos.z + this.halfZ
        const wantedDy = m.y - orgPos.y + this.halfY

        if (wantedDx < 0 || wantedDx >= this.boundaryX || wantedDz < 0 || wantedDz >= this.boundaryZ || wantedDy < 0 || wantedDy >= this.boundaryY) {
          exit = true
        } else {
          const idx = wantedDx * this.xStride + wantedDz * this.zStride + wantedDy
          if (this.seenMarks[idx] !== seenStamp) {
            this.localData[idx] = m.blockInfo
            this.seenMarks[idx] = seenStamp
          }
        }
      }
      move1 = move1.parent
    }
  }

  private lastPos?: Vec3
  getNeighbors (currentMove: Move, closed: Set<string>): Move[] {
    const moves: Move[] = []

    // console.log('hi')
    const pos = currentMove.entryPos.floored()
    const old = this.lastPos ?? pos
    this.shiftLocalData(old, pos)
    this.preloadInteractData(pos, currentMove)
    this.lastPos = pos

    // const arr = new Array(this.maxBound).fill(null);

    for (const newMove of this.recognizedMovements) {
      newMove.loadMove(currentMove)
      newMove.loadLocalData(pos, this.boundaries, this.localData, this.toClear)
      newMove.provideMovements(currentMove, moves, this.goal, closed)
    }

    // for (const move of moves) {
    //   const bl = move.moveType.getBlockInfo(move, 0, 0, 0)
    //   if (bl.liquid && move.toPlace.length > 0) {
    //     const blocksAtPoses = move.toPlace.map((p) => move.moveType.getBlockInfo(p, 0, 0, 0))
    //   // console.log(blocksAtPoses.map(i => [i, i.block?.getProperties(), (i.block as any)?._properties]))

    //     // throw new Error(`Liquid detected in toPlace: ${move.moveType.constructor.name} with placements ${move.toPlace.map((p) => p.vec).join(', ')} at pos ${move.vec.toString()} `)
    //   }
    // }
    // this.resetLocalData() // same speed, but less memory efficient.

    // console.log(moves.length, moves.map(m=>m.moveType.constructor.name))

    return moves

    // for differences less than 1 block, we only supply best movement to said block.

    // if (moves.length === 0) return moves

    // const visited = new Set()
    // for (const move of moves) {
    //   visited.add(move.hash)
    // }

    // // console.log(visited)

    // const ret = []
    // for (const visit of visited) {
    //   const tmp = moves.filter((m) => m.hash === visit)
    //   const wantedCost = stableSort1(tmp, (a, b) => a.cost - b.cost)[0].cost
    //   const wanted = tmp.filter((m) => m.cost === wantedCost).sort((a, b) => this.goal.heuristic(a) - this.goal.heuristic(b))[0]
    //   ret.push(wanted)
    // }

    // for (const move of moves) {
    //   (move as any).cost = Math.round(move.cost);
    // }

    // return ret
  }
}

// type Comparator<T> = (a: T, b: T) => number

// const defaultCmp: Comparator<any> = (a, b) => {
//   if (a < b) return -1
//   if (a > b) return 1
//   return 0
// }

// function stableSort1<T> (arr: T[], cmp: Comparator<T> = defaultCmp): T[] {
//   const stabilized = arr.map((el, index) => [el, index] as [T, number])
//   const stableCmp: Comparator<[T, number]> = (a, b) => {
//     const order = cmp(a[0], b[0])
//     if (order !== 0) return order
//     return a[1] - b[1]
//   }

//   stabilized.sort(stableCmp)
//   for (let i = 0; i < arr.length; i++) {
//     arr[i] = stabilized[i][0]
//   }

//   return arr
// }
