import { Vec3 } from "vec3";
import { PathNode as BaseNode } from "../abstract";
import { Move } from "./move";

export class PathNode1 extends BaseNode<Move> {
    public readonly entryVelocity: Vec3 = new Vec3(0, 0, 0);
  }