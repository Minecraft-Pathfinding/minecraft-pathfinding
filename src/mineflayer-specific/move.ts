import { Vec3 } from "vec3";
import { Movement, SimMovement } from "./movements";
import { PathData } from "../abstract/node";
import { EntityState } from "@nxg-org/mineflayer-physics-util";

export class Move implements PathData {
  hash: string;

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly entryPos: Vec3,
    public readonly entryVel: Vec3,
    public readonly exitPos: Vec3,
    public readonly exitVel: Vec3,
    public readonly cost: number,
    public readonly moveType: Movement
  ) {
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.z = Math.floor(z);
    this.hash = this.x + "," + this.y + "," + this.z;
    // this.x = x;
    // this.y = y;
    // this.z = z;
    // this.hash = this.x.toFixed(1) + "," + this.y.toFixed(1) + "," + this.z.toFixed(1);

  }


  static fromPrevious(cost: number, move: Move, type: SimMovement, state: EntityState) {
    return new Move(state.pos.x, state.pos.y, state.pos.z, move.exitPos, move.exitVel, state.pos.clone(), state.vel.clone(), cost, type)
  }

  public toVec() { return new Vec3(this.x, this.y, this.z)}
}
