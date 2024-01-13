import { Vec3 } from "vec3"

export interface World {
  getBlock(pos: Vec3): any
  getBlockStateId(pos: Vec3): number
}