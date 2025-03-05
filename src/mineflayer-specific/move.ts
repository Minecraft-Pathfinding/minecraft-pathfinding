import { Vec3 } from 'vec3'
import { MovementProvider } from './movements'
import { PathData } from '../abstract/node'
import { EntityState } from '@nxg-org/mineflayer-physics-util'
import { BreakHandler, PlaceHandler } from './movements/interactionUtils'
const emptyVec = new Vec3(0, 0, 0)

// const TOPLACE: PlaceHandler[] = []
// const TOBREAK: BreakHandler[] = []

export class Move implements PathData {
  hash: string

  targetPos: Vec3

  public readonly cachedVec: Vec3
  // remainingBlocks: number = 0 // TODO: implement this

  toPlace: PlaceHandler[]
  toBreak: BreakHandler[]

  constructor (
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    toPlace: PlaceHandler[],
    toBreak: BreakHandler[],
    public readonly remainingBlocks: number,
    public readonly cost: number,
    public readonly moveType: MovementProvider,
    public readonly entryPos: Vec3,
    public readonly entryVel: Vec3,
    public readonly exitPos: Vec3,
    public readonly exitVel: Vec3,
    // public readonly interactMap: Map<string, PlaceHandler | BreakHandler>,
    public readonly parent?: Move
  ) {
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
    this.hash = `${this.x},${this.y},${this.z}` // this.x + ',' + this.y + ',' + this.z
    this.targetPos = this.exitPos

    this.cachedVec = new Vec3(this.x, this.y, this.z)
    Object.freeze(this.cachedVec)

    // this.toPlace = TOPLACE
    // this.toBreak = TOBREAK
    this.toPlace = toPlace
    this.toBreak = toBreak
    // this.x = x;
    // this.y = y;
    // this.z = z;
    // this.hash = this.x.toFixed(1) + "," + this.y.toFixed(1) + "," + this.z.toFixed(1);
  }

  static startMove (type: MovementProvider, pos: Vec3, vel: Vec3, remainingBlocks: number): Move {
    return new Move(pos.x, pos.y, pos.z, [], [], remainingBlocks, 0, type, pos, vel, pos, vel)
    // new Map());
  }

  static fromPreviousState (
    cost: number,
    state: EntityState,
    prevMove: Move,
    type: MovementProvider,
    toPlace: PlaceHandler[] = [],
    toBreak: BreakHandler[] = []
  ): Move {
    // const p = new Map(prevMove.interactMap);
    // for (const breakH of toBreak) {
    //   p.set(`(${breakH.x}, ${breakH.y}, ${breakH.z})`, breakH);
    // }
    // for (const place of toPlace) {
    //   p.set(`(${place.x}, ${place.y}, ${place.z})`, place);
    // }
    return new Move(
      state.pos.x,
      state.pos.y,
      state.pos.z,
      toPlace,
      toBreak,
      prevMove.remainingBlocks - 0, //toPlace.length,
      cost,
      type,
      prevMove.exitPos,
      prevMove.exitVel,
      state.pos.clone(),
      state.vel.clone(),
      // prevMove.interactMap,
      prevMove
      // p
    )
  }

  static fromPrevious (
    cost: number,
    pos: Vec3,
    prevMove: Move,
    type: MovementProvider,
    toPlace: PlaceHandler[] = [],
    toBreak: BreakHandler[] = []
  ): Move {
    // const p = new Map(prevMove.interactMap);
    // for (const place of toPlace) {
    //   p.set(`(${place.x}, ${place.y}, ${place.z})`, place);
    // }
    // for (const breakH of toBreak) {
    //   p.set(`(${breakH.x}, ${breakH.y}, ${breakH.z})`, breakH);
    // }
    return new Move(
      pos.x,
      pos.y,
      pos.z,
      toPlace,
      toBreak,
      prevMove.remainingBlocks -  0,//toPlace.length,
      cost,
      type,
      prevMove.exitPos,
      prevMove.exitVel,
      pos,
      emptyVec,
      // prevMove.interactMap,
      prevMove
      // p
    )
  }

  public clone (): Move {
    return { ...this } // lazy.
  }

  public get vec (): Vec3 {
    return this.cachedVec
    // return new Vec3(this.x, this.y, this.z)
  }

  public toVecCenter (): Vec3 {
    return new Vec3(this.x + 0.5, this.y, this.z + 0.5)
  }

  public exitRounded (digits: number): Vec3 {
    const mult = Math.pow(10, digits)
    return new Vec3(
      Math.round(this.exitPos.x * mult) / mult,
      Math.round(this.exitPos.y * mult) / mult,
      Math.round(this.exitPos.z * mult) / mult
    )
  }

  toString (): String {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `Move { ${this.moveType.constructor.name} | ${this.x}, ${this.y}, ${this.z} | ${this.entryPos} | ${this.exitPos} }`
  }
}
