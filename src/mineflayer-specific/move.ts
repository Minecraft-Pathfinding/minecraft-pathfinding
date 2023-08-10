export abstract class Move {
  declare hash: string;

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly cost: number
  ) {
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.z = Math.floor(z);
    this.hash = this.x + ','+this.y+','+this.z;
  }
}
