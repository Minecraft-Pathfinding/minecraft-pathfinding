import { Vec3 } from "vec3";

export class Move {
  hash: string;

  constructor(
    public readonly gX: number,
    public readonly gY: number,
    public readonly gZ: number,
    public readonly exitPosition: Vec3,
    public readonly exitVelocity: Vec3,
    public readonly cost: number
  ) {
    this.gX = Math.floor(gX);
    this.gY = Math.floor(gY);
    this.gZ = Math.floor(gZ);
    this.hash = this.gX+ "," + this.gY + "," + this.gZ;
  }
  // public getVec() { return new Vec3(this.goalX, this.goalY, this.goalZ)}
}
