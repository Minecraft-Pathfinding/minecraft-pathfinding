import { Vec3 } from "vec3";
import { Movement } from "./movements";
import { PathData } from "../abstract/node";

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
  public toVec() { return new Vec3(this.x, this.y, this.z)}
}
