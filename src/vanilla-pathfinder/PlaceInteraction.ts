import { Vec3 } from "vec3"

export class PlaceInteraction {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  returnPos: Vec3

  constructor(x: number, y: number, z: number, dx: number, dy: number, dz: number, returnPos: Vec3) {
    this.x = x
    this.y = y
    this.z = z
    this.dx = dx
    this.dy = dy
    this.dz = dz
    this.returnPos = returnPos
  }
}