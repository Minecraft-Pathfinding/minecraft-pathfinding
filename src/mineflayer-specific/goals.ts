import { Vec3 } from 'vec3'
import { Goal as AGoal } from '../abstract'
import { Move } from './move'
import { World } from './world/worldInterface'
import { AABB } from '@nxg-org/mineflayer-util-plugin'
import { PlaceHandler } from './movements/interactionUtils'
import type { Item } from 'prismarine-item'
import { MovementExecutor } from './movements'
import { Block } from '../types'

/**
 * The abstract goal definition used by the pathfinder.
 */
export abstract class Goal implements AGoal<Move> {
  abstract isEnd (node: Move): boolean
  abstract heuristic (node: Move): number
  async onFinish (node: MovementExecutor): Promise<void> {}
}

/**
 * A goal to be directly at a specific coordinate.
 */
export class GoalBlock extends Goal {
  constructor (public x: number, public y: number, public z: number) {
    x = Math.floor(x)
    y = Math.floor(y)
    z = Math.floor(z)
    super()
  }

  static fromVec (vec: Vec3): GoalBlock {
    return new GoalBlock(vec.x, vec.y, vec.z)
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

/**
 * A goal to be near a specific coordinate within a certain distance.
 */
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

/**
 * A goal to be near a specific coordinate within a certain distance on the XZ plane.
 */
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

/**
 * A goal to look at a specific coordinate within a certain distance.
 */
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

    // set x,y,z to center of the bounding box.
    this.x = x + width / 2
    this.y = y + height / 2
    this.z = z + width / 2

    // set up bb to check for collision.
    this.bb = new AABB(x, y, z, this.x + width / 2, this.y + height / 2, this.z + width / 2).expand(0.001, 0.001, 0.001)
  }

  static fromEntity (world: World, entity: { position: Vec3, height: number }, width: number, distance = 4, height = 1.62): GoalLookAt {
    // offset to center of entity to allow easy building of bounding box.
    return new GoalLookAt(world, entity.position.x, entity.position.y, entity.position.z, width, height, distance, height)
  }

  static fromBlock (world: World, block: { position: Vec3 }, distance = 4, height = 1.62): GoalLookAt {
    // offset to center of block to allow easy building of bounding box.
    return new GoalLookAt(world, block.position.x, block.position.y, block.position.z, 1, 1, distance, height)
  }

  heuristic (node: Move): number {
    const dx = this.x - node.x
    const dy = this.y - (node.y + this.eyeHeight) // eye level
    const dz = this.z - node.z
    return Math.sqrt(dx * dx + dz * dz + dy * dy)
  }

  /**
   * TODO: account for entity collision (prismarine-world currently does not support this).
   */
  isEnd (node: Move): boolean {
    const dist = this.heuristic(node)

    if (dist > this.distance + 3) return false
    const pos = new Vec3(node.x, node.y + this.eyeHeight, node.z)
    const dir = new Vec3(this.x - node.x, this.y - pos.y, this.z - node.z).normalize()
    const raycast = this.world.raycast(pos, dir, this.distance + 3)
    if (raycast === null) return false
    const intsec = raycast.intersect
    if (intsec === null) return false
    if (intsec.distanceTo(pos) > this.distance) return false
    return this.bb.containsVec(intsec)
  }

  override async onFinish (node: MovementExecutor): Promise<void> {
    const bot = node.bot
    await bot.lookAt(new Vec3(this.x, this.y, this.z))
    await bot.lookAt(new Vec3(this.x, this.y, this.z), true) // weird alignment issue.
  }
}

export class GoalMineBlock extends GoalLookAt {
  constructor (world: World, private readonly block: Block, distance: number, height: number) {
    if (block === null) throw new Error('GoalMineBlock: Block provided cannot be null.')

    // could technically check if block is solid, but let's let users fuck up first.
    super(world, block.position.x, block.position.y, block.position.z, 1, 1, distance, height)
  }

  static fromBlock (world: World, block: Block, distance = 4, height = 1.62): GoalMineBlock {
    return new GoalMineBlock(world, block, distance, height)
  }

  override async onFinish (node: MovementExecutor): Promise<void> {
    const bot = node.bot
    await bot.lookAt(new Vec3(this.x, this.y, this.z))
    await bot.lookAt(new Vec3(this.x, this.y, this.z), true) // weird alignment issue.

    // could technically use BreakHandler, but won't bother for now.

    const item = bot.pathingUtil.bestHarvestingTool(this.block)
    if (item != null) await bot.equip(item, 'hand')
    else await bot.unequip('hand')
    bot.updateHeldItem()

    await bot.dig(this.block, 'ignore', 'raycast') // already looking, comply with anticheat.
  }
}

export class GoalPlaceBlock extends GoalLookAt {
  private readonly handler: PlaceHandler
  constructor (world: World, private readonly bPos: Vec3, item: Item, distance: number, height: number) {
    if (bPos === null) throw new Error('GoalMineBlock: Block provided cannot be null.')

    // could technically check if block is solid, but let's let users fuck up first.
    super(world, bPos.x, bPos.y, bPos.z, 1, 1, distance, height)

    const type = PlaceHandler.identTypeFromItem(item)
    this.handler = PlaceHandler.fromVec(bPos, type)
  }

  static fromInfo (world: World, bPos: Vec3, item: Item, distance = 4, height = 1.62): GoalPlaceBlock {
    return new GoalPlaceBlock(world, bPos, item, distance, height)
  }

  override async onFinish (node: MovementExecutor): Promise<void> {
    const bot = node.bot
    this.handler.loadMove(node)

    await bot.lookAt(new Vec3(this.x, this.y, this.z))
    await bot.lookAt(new Vec3(this.x, this.y, this.z), true) // weird alignment issue.

    // could technically use BreakHandler, but won't bother for now.

    if (this.handler.done) throw new Error('GoalPlaceBlock: Handler was already executed!')
    const item = this.handler.getItem(bot)
    if (item != null) await bot.equip(item, 'hand')
    else await bot.unequip('hand')
    bot.updateHeldItem()

    await this.handler.perform(bot, item)
  }
}
