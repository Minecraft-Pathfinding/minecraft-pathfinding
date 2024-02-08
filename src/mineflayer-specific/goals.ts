import { Vec3 } from 'vec3'
import { Goal as AGoal } from '../abstract'
import { Move } from './move'
import { World } from './world/worldInterface'
import { AABB } from '@nxg-org/mineflayer-util-plugin'

export abstract class Goal implements AGoal<Move> {
  abstract isEnd (node: Move): boolean
  abstract heuristic (node: Move): number
}

export class GoalBlock extends Goal {
  constructor (public x: number, public y: number, public z: number) {
    super()
  }

  static fromVec (vec: Vec3): GoalBlock {
    return new GoalBlock(Math.floor(vec.x), Math.floor(vec.y), Math.floor(vec.z))
  }

  static fromBlock (block: { position: Vec3 }): GoalBlock {
    return new GoalBlock(block.position.x, block.position.y, block.position.z)
  }

  heuristic (node: Move): number {
    // return 0;
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return Math.sqrt(dx * dx + dz * dz + dy * dy)
    // return (Math.sqrt(dx * dx + dz * dz) + Math.abs(dy))
    // return distanceXZ(dx, dz) + Math.abs(dy)
  }

  isEnd (node: Move): boolean {
    return node.x === this.x && node.y === this.y && node.z === this.z
  }
}

export class GoalNear extends Goal {
  constructor (public x: number, public y: number, public z: number, public distance: number) {
    super()
  }

  static fromVec (vec: Vec3, distance: number): GoalNear {
    return new GoalNear(vec.x, vec.y, vec.z, distance)
  }

  // ease of use naming.
  static fromEntity (entity: { position: Vec3 }, distance: number): GoalNear {
    return new GoalNear(entity.position.x, entity.position.y, entity.position.z, distance)
  }

  // ease of use naming.
  static fromBlock (block: { position: Vec3 }, distance: number): GoalNear {
    return new GoalNear(Math.floor(block.position.x), Math.floor(block.position.y), Math.floor(block.position.z), distance)
  }

  isEnd (node: Move): boolean {
    return (
      Math.abs(node.x - this.x) <= this.distance && Math.abs(node.y - this.y) <= this.distance && Math.abs(node.z - this.z) <= this.distance
    )
  }

  heuristic (node: Move): number {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return Math.sqrt(dx * dx + dz * dz + dy * dy)
  }
}

export class GoalNearXZ extends Goal {
  constructor (public x: number, public z: number, public distance: number) {
    super()
  }

  static fromVec (vec: Vec3, distance: number): GoalNearXZ {
    return new GoalNearXZ(vec.x, vec.z, distance)
  }

  isEnd (node: Move): boolean {
    return Math.abs(node.x - this.x) <= this.distance && Math.abs(node.z - this.z) <= this.distance
  }

  heuristic (node: Move): number {
    const dx = this.x - node.x
    const dz = this.z - node.z
    return Math.sqrt(dx * dx + dz * dz)
  }
}

export class GoalLookAt extends Goal {
  private readonly bb: AABB

  public x: number
  public y: number
  public z: number

  constructor (
    private readonly world: World,
    x: number,
    y: number,
    z: number,
    public width: number,
    public height: number,
    public distance: number,
    public eyeHeight: number
  ) {
    super()

    // set x,y,z to center of the block.
    this.x = x + width / 2
    this.y = y + height / 2
    this.z = z + width / 2

    // set up bb to check for collision.
    this.bb = new AABB(x, y, z, this.x + width / 2, this.y + height / 2, this.z + width / 2).expand(0.001, 0.001, 0.001)
  }

  static fromBlock (world: World, block: { position: Vec3 }, distance = 4, height = 1.62): GoalLookAt {
    // offset to center of block to allow easy building of bounding box.
    return new GoalLookAt(world, block.position.x, block.position.y, block.position.z, 1, 1, distance, height)
  }

  static fromEntity (world: World, entity: { position: Vec3, height: number }, width: number, distance = 4, height = 1.62): GoalLookAt {
    // offset to center of entity to allow easy building of bounding box.
    return new GoalLookAt(world, entity.position.x, entity.position.y, entity.position.z, width, height, distance, height)
  }

  heuristic (node: Move): number {
    const dx = this.x - node.x
    const dy = this.y - (node.y + this.eyeHeight) // eye level
    const dz = this.z - node.z
    return Math.sqrt(dx * dx + dz * dz + dy * dy)
  }

  isEnd (node: Move): boolean {
    const dist = this.heuristic(node)
    if (dist > this.distance) return false

    const pos = new Vec3(node.x, node.y + this.eyeHeight, node.z)
    const dir = new Vec3(this.x - node.x, this.y - pos.y, this.z - node.z).normalize()
    const raycast = this.world.raycast(pos, dir, this.distance)
    if (raycast === null) return false
    const intsec = raycast.intersect
    if (intsec === null) return false

    return this.bb.containsVec(intsec)
  }
}
