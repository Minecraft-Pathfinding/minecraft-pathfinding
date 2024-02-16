import { Bot } from 'mineflayer'
import { Move } from '../move'
import * as goals from '../goals'
import { World } from '../world/worldInterface'
import { DEFAULT_MOVEMENT_OPTS, Movement, MovementOptions } from './movement'

import { MovementProvider as AMovementProvider } from '../../abstract'
import { ExecutorMap } from '.'
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
  private halfway!: [x: number, z: number, y: number]

  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   */
  abstract provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void

  private localData: Array<BlockInfo | null> = []

  loadLocalData (orgPos: Vec3, boundaries: [x: number, z: number, y: number], arr: Array<BlockInfo | null>, clear: Set<number>): void {
    this.orgPos = orgPos
    this.localData = arr
    this.boundaries = boundaries
    this.halfway = [Math.floor(boundaries[0] / 2), Math.floor(boundaries[1] / 2), Math.floor(boundaries[2] / 2)]
    this.toClear = clear
    // console.log(this.halfway)
  }

  getBlockInfo (pos: Vec3Properties, dx: number, dy: number, dz: number): BlockInfo {
    const yes = new Vec3(pos.x + dx, pos.y + dy, pos.z + dz)
    let move: Move | undefined = this.currentMove

    let i = 0
    while (move !== undefined && i++ < 4) { // 5 levels
      // console.log('i', i)
      for (const m of move.toPlace) {
        if (m.x === yes.x && m.y === yes.y && m.z === yes.z) {
          return m.blockInfo
        }
      }

      for (const m of move.toBreak) {
        if (m.x === yes.x && m.y === yes.y && m.z === yes.z) {
          return m.blockInfo
        }
      }

      move = move.parent
    }

    pos = {
      x: Math.floor(pos.x),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z)
    }

    const wantedDx = pos.x - this.orgPos.x + dx + this.halfway[0]

    // if (wantedDx < 0 || wantedDx >= this.boundaries[0]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    const wantedDz = pos.z - this.orgPos.z + dz + this.halfway[1]

    // if (wantedDz < 0 || wantedDz >= this.boundaries[2]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    const wantedDy = pos.y - this.orgPos.y + dy + this.halfway[2]

    // if (wantedDy < 0 || wantedDy >= this.boundaries[2]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    // const packed = (wantedDx << 16) + (wantedDz << 8) + wantedDy

    if (
      wantedDx < 0 ||
      wantedDx >= this.boundaries[0] ||
      wantedDz < 0 ||
      wantedDz >= this.boundaries[1] ||
      wantedDy < 0 ||
      wantedDy >= this.boundaries[2]
    ) {
      // console.log('hey', idx, this.localData[idx])
      return super.getBlockInfo(pos, dx, dy, dz)
      // console.log('out of bounds', pos, this.orgPos, wantedDx, wantedDy, wantedDz, this.boundaries)
    }

    const idx = wantedDx * this.boundaries[2] * this.boundaries[1] + wantedDz * this.boundaries[2] + wantedDy

    // const data = this.localData[wantedDx][wantedDy][wantedDz];
    const data = this.localData[idx]

    if (data !== null) {
      // this.toClear.add(packed)
      // const target = new Vec3(wantedDx - this.halfway[0], wantedDy - this.halfway[2], wantedDz - this.halfway[1]).plus(this.orgPos)
      // if (!data.block?.position.equals(target) && data.position.x !== 0 && data.block?.position.y !== 0 && data.position.z !== 0) {
      //   console.log(
      //     'crap',
      //     pos,
      //     dx,
      //     dy,
      //     dz,
      //     data.position,
      //     '\n\n',
      //     this.orgPos,
      //     wantedDx,
      //     wantedDy,
      //     wantedDz,
      //     target,
      //     this.halfway,
      //     this.boundaries,

      //     this.localData[idx]
      //   )
      //   throw new Error('dang')
      // }

      return data
    }

    const ret = super.getBlockInfo(pos, dx, dy, dz)

    this.localData[idx] = ret
    return ret
  }
}

export class MovementHandler implements AMovementProvider<Move> {
  movementMap: ExecutorMap
  recognizedMovements: MovementProvider[]
  goal!: goals.Goal
  world: World

  constructor (bot: Bot, world: World, recMovement: MovementProvider[], movementMap: ExecutorMap) {
    this.world = world
    this.recognizedMovements = recMovement
    this.movementMap = movementMap
  }

  static create (bot: Bot, world: World, recMovement: ExecutorMap, settings: Partial<MovementOptions> = {}): MovementHandler {
    const opts = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings)
    return new MovementHandler(
      bot,
      world,
      [...recMovement.keys()].map((M) => new M(bot, world, opts)),
      recMovement
    )
  }

  getMovements (): ExecutorMap {
    return this.movementMap
  }

  sanitize (): boolean {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    return !!this.goal
  }

  loadGoal (goal: goals.Goal): void {
    this.goal = goal
  }

  private readonly boundaries: [x: number, z: number, y: number] = [7, 7, 7]
  private readonly halfway: [x: number, z: number, y: number] = [Math.floor(this.boundaries[0] / 2), Math.floor(this.boundaries[1] / 2), Math.floor(this.boundaries[2] / 2)]

  private readonly maxBound = this.boundaries[0] * this.boundaries[1] * this.boundaries[2]
  private readonly toClear: Set<number> = new Set()
  private readonly localData: Array<BlockInfo | null> = new Array(this.maxBound).fill(null, 0, this.maxBound)

  resetLocalData (): void {
    for (let i = 0; i < this.maxBound; i++) {
      this.localData[i] = null
    }
  }

  // Do not reassign localData, must do shift in place.

  private readonly swapArray = new Array(this.maxBound).fill(null)
  private readonly swapSet = new Array(this.maxBound)

  public count = 0
  public totCount = 0
  shiftLocalData (orgPos: Vec3, newPos: Vec3): void {
    const diff = newPos.minus(orgPos)

    let swapIdx = 0
    for (let idx = 0; idx < this.maxBound; idx++) {
      if (this.localData[idx] === null) continue

      // convert i into 3D indexes, boundaries are this.boundaries
      const x = Math.floor(idx / (this.boundaries[2] * this.boundaries[1]))
      const rest = idx % (this.boundaries[2] * this.boundaries[1])
      const z = Math.floor(rest / this.boundaries[2])
      const y = rest % this.boundaries[2]

      const newX = x - diff.x
      const newY = y - diff.y
      const newZ = z - diff.z

      if (newX >= 0 && newX < this.boundaries[0] && newY >= 0 && newY < this.boundaries[2] && newZ >= 0 && newZ < this.boundaries[1]) {
        const newIdx = newX * this.boundaries[2] * this.boundaries[1] + newZ * this.boundaries[2] + newY

        this.swapArray[newIdx] = this.localData[idx]

        this.swapSet[swapIdx++] = newIdx
      }

      this.localData[idx] = null
    }

    for (let i = 0; i < swapIdx; i++) {
      const idx = this.swapSet[i]
      this.localData[idx] = this.swapArray[idx]
    }
    if (swapIdx > 0) this.count++
    this.totCount++
  }

  private lastPos?: Vec3
  getNeighbors (currentMove: Move, closed: Set<string>): Move[] {
    const moves: Move[] = []

    // console.log('hi')
    const pos = currentMove.exitPos.floored()
    this.shiftLocalData(this.lastPos ?? pos, pos)
    this.lastPos = pos

    // const arr = new Array(this.maxBound).fill(null);

    for (const newMove of this.recognizedMovements) {
      newMove.loadMove(currentMove)
      newMove.loadLocalData(pos, this.boundaries, this.localData, this.toClear)
      newMove.provideMovements(currentMove, moves, this.goal, closed)
    }

    for (const move of moves) {
      const bl = move.moveType.getBlockInfo(move, 0, 0, 0)
      if (bl.liquid && move.toPlace.length > 0) {
        const blocksAtPoses = move.toPlace.map((p) => move.moveType.getBlockInfo(p, 0, 0, 0))
        console.log(blocksAtPoses.map(i => [i, i.block?.getProperties(), (i.block as any)?._properties]))

        throw new Error(`Liquid detected in toPlace: ${move.moveType.constructor.name} with placements ${move.toPlace.map((p) => p.vec).join(', ')} at pos ${move.vec.toString()} `)
      }
    }
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
