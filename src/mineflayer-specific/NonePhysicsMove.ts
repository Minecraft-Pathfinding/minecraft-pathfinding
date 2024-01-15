import { Vec3 } from "vec3"
import { PlaceInteraction } from "../vanilla-pathfinder/PlaceInteraction"

export class NonePhysicsMove {
  x: number
  y: number
  z: number
  cost: number
  toPlace: Vec3[]
  toBreak: Vec3[]
  hash: string

  constructor (x: number, y: number, z: number, cost: number, toBreak: Vec3[], toPlace: PlaceInteraction[],) {
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
    this.cost = cost
    this.toPlace = toPlace
    this.toBreak = toBreak
    this.hash = this.x + ',' + this.y + ',' + this.z
  }

  toVec3() {
    return new Vec3(this.x, this.y, this.z)
  }
}