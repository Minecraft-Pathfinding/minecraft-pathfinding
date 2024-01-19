import { Vec3 } from "vec3";
import { Movement, SimMovement } from "./movements";
import { PathData } from "../abstract/node";
import { EntityState } from "@nxg-org/mineflayer-physics-util";
import { BreakHandler, InteractHandler, PlaceHandler } from "./movements/utils";
const emptyVec = new Vec3(0, 0, 0);

export class Move implements PathData {
  hash: string;

  targetPos: Vec3;
  // remainingBlocks: number = 0 // TODO: implement this

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly toPlace: PlaceHandler[],
    public readonly toBreak: BreakHandler[],
    public readonly remainingBlocks: number,
    public readonly cost: number,
    public readonly moveType: Movement,
    public readonly entryPos: Vec3,
    public readonly entryVel: Vec3,
    public readonly exitPos: Vec3,
    public readonly exitVel: Vec3,
    // public readonly interactMap: Map<string, PlaceHandler | BreakHandler>,
    public readonly parent?: Move
  ) {
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.z = Math.floor(z);
    this.hash = this.x + "," + this.y + "," + this.z;
    this.targetPos = this.exitPos;
    // this.x = x;
    // this.y = y;
    // this.z = z;
    // this.hash = this.x.toFixed(1) + "," + this.y.toFixed(1) + "," + this.z.toFixed(1);
  }

  static startMove(type: Movement, pos: Vec3, vel: Vec3) {
    return new Move(pos.x, pos.y, pos.z, [], [], 0, 0, type, pos, vel, pos, vel);
    // new Map());
  }

  static fromPreviousState(
    cost: number,
    state: EntityState,
    prevMove: Move,
    type: SimMovement,
    toPlace: PlaceHandler[] = [],
    toBreak: BreakHandler[] = []
  ) {
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
      prevMove.remainingBlocks - toPlace.length,
      cost,
      type,
      prevMove.exitPos,
      prevMove.exitVel,
      state.pos.clone(),
      state.vel.clone(),
      // prevMove.interactMap,
      prevMove
    );
  }

  static fromPrevious(cost: number, pos: Vec3, prevMove: Move, type: Movement, toPlace: PlaceHandler[] = [], toBreak: BreakHandler[] = []) {
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
      prevMove.remainingBlocks - toPlace.length,
      cost,
      type,
      prevMove.exitPos,
      prevMove.exitVel,
      pos,
      emptyVec,
      // prevMove.interactMap,
      prevMove
    );
  }

  public toVec() {
    return new Vec3(this.x, this.y, this.z);
  }

  public toVecCenter() {
    return new Vec3(this.x + 0.5, this.y, this.z + 0.5);
  }

  public exitRounded(digits: number) {
    const mult = Math.pow(10, digits);
    return new Vec3(
      Math.round(this.exitPos.x * mult) / mult,
      Math.round(this.exitPos.y * mult) / mult,
      Math.round(this.exitPos.z * mult) / mult
    );
  }
}
