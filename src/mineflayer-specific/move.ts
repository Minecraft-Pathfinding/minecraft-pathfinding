import { Vec3 } from 'vec3'
import { Movement, SimMovement } from './movements'
import { PathData } from '../abstract/node'
import { EntityState } from '@nxg-org/mineflayer-physics-util'
const emptyVec = new Vec3(0,0,0)

export class Move implements PathData {
  hash: string
  // remainingBlocks: number = 0 // TODO: implement this

  constructor (
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly toPlace: Vec3[],
    public readonly toBreak: Vec3[],
    public readonly cost: number,
    public readonly moveType: Movement,
    public readonly entryPos: Vec3,
    public readonly entryVel: Vec3,
    public readonly exitPos: Vec3,
    public readonly exitVel: Vec3,
    
  ) {
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
    this.hash = this.x + ',' + this.y + ',' + this.z
    // this.x = x;
    // this.y = y;
    // this.z = z;
    // this.hash = this.x.toFixed(1) + "," + this.y.toFixed(1) + "," + this.z.toFixed(1);
  }

  static fromPreviousState(cost: number, state: EntityState, prevMove: Move, type: SimMovement, toPlace: Vec3[] = [], toBreak: Vec3[] = []) {
    return new Move(state.pos.x, state.pos.y, state.pos.z, toPlace, toBreak, cost, type, prevMove.exitPos, prevMove.exitVel, state.pos.clone(), state.vel.clone())
  }

  static fromPrevious(cost: number, pos: Vec3,  prevMove: Move, type: Movement, toPlace: Vec3[] = [], toBreak: Vec3[] = []) {
    return new Move(pos.x, pos.y, pos.z, toPlace, toBreak, cost, type, prevMove.exitPos, prevMove.exitVel, emptyVec, emptyVec)
  }

  public toVec () { return new Vec3(this.x, this.y, this.z) }
}
