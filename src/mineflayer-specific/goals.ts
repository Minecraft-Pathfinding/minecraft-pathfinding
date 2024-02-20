import { Vec3 } from 'vec3'
import { Goal as AGoal } from '../abstract'
import { Move } from './move'
import { World } from './world/worldInterface'
import { AABB } from '@nxg-org/mineflayer-util-plugin'
import { PlaceHandler } from './movements/interactionUtils'
import type { Item } from 'prismarine-item'
import { MovementExecutor } from './movements'
import { Block } from '../types'
import { BotEvents } from 'mineflayer'
import type { Entity } from 'prismarine-entity'

/**
 * The abstract goal definition used by the pathfinder.
 */
export abstract class Goal implements AGoal<Move> {
  abstract isEnd (node: Move): boolean
  abstract heuristic (node: Move): number
  async onFinish (node: MovementExecutor): Promise<void> {}
}

type EasyKeys = keyof BotEvents | Array<keyof BotEvents>
export abstract class GoalDynamic<
  Change extends EasyKeys = Array<keyof BotEvents>,
  Valid extends EasyKeys = Array<keyof BotEvents>,
  ChKey extends Change extends keyof BotEvents ? [Change] : Change = Change extends keyof BotEvents ? [Change] : Change,
  VlKey extends Valid extends keyof BotEvents ? [Valid] : Valid = Valid extends keyof BotEvents ? [Valid] : Valid
> extends Goal {
  dynamic = true
  neverfinish = false
  abstract readonly eventKeys: Readonly<Change>
  abstract readonly validKeys: Readonly<Valid>
  abstract hasChanged (...args: Parameters<BotEvents[ChKey[number]]>): boolean
  abstract isValid (...args: Parameters<BotEvents[VlKey[number]]>): boolean
  abstract update (): void
  cleanup?: () => void // will be assigned later.

  get _eventKeys (): ChKey {
    if (this.eventKeys instanceof Array) return this.eventKeys as ChKey
    return [this.eventKeys] as ChKey
  }

  get _validKeys (): VlKey {
    if (this.validKeys instanceof Array) return this.validKeys as VlKey
    return [this.validKeys] as VlKey
  }
}

/**
 * Utility typing provided for TypeScript users.
 * Can track what type of goal is being used if using the static `from` method.
 */
export class GoalInvert<G extends Goal | GoalDynamic = Goal> extends GoalDynamic<any, any> {
  public readonly goal: G

  public get eventKeys (): ReadonlyArray<keyof BotEvents> {
    if (!this.dynamic) return []

    return (this.goal as GoalDynamic).eventKeys
  }

  public get validKeys (): ReadonlyArray<keyof BotEvents> {
    if (!this.dynamic) return []

    return (this.goal as GoalDynamic).validKeys
  }

  constructor (goal: G) {
    super()
    this.goal = goal
    this.dynamic = goal instanceof GoalDynamic ? goal.dynamic : false
  }

  static from<G1 extends Goal>(goal: G1): GoalInvert<G1> {
    return new GoalInvert(goal)
  }

  hasChanged (...args: Parameters<BotEvents[keyof BotEvents]>): boolean {
    if (!this.dynamic) return false
    return (this.goal as GoalDynamic).hasChanged(...args)
  }

  isValid (...args: Parameters<BotEvents[keyof BotEvents]>): boolean {
    if (!this.dynamic) return false
    return (this.goal as GoalDynamic).isValid(...args)
  }

  update (): void {
    if (!this.dynamic) return;
    (this.goal as GoalDynamic).update()
  }

  isEnd (node: Move): boolean {
    return !this.goal.isEnd(node)
  }

  heuristic (node: Move): number {
    return -this.goal.heuristic(node)
  }
}

/**
 * Classic gen fuckery.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GoalInvertOld<Et extends EasyKeys = [], Val extends EasyKeys = []> extends GoalDynamic<Et, Val> {
  eventKeys = [] as unknown as Et
  validKeys = [] as unknown as Val // to be set later.

  isDynamic = false

  private constructor (private readonly goal: Goal) {
    super()

    if (goal instanceof GoalDynamic) {
      this.eventKeys = goal._eventKeys
      this.validKeys = goal._validKeys
      this.isDynamic = true
    }
  }

  static from (goal: Goal): GoalInvertOld {
    return new GoalInvertOld(goal)
  }

  static fromDyn<
    G extends GoalDynamic,
    K0 extends EasyKeys = G extends GoalDynamic<infer K extends EasyKeys> ? K : never,
    K1 extends EasyKeys = G extends GoalDynamic<any, infer V extends EasyKeys> ? V : never
  >(goal: GoalDynamic<K0, K1>): GoalInvertOld<K0, K1> {
    return new GoalInvertOld(goal)
  }

  isEnd (node: Move): boolean {
    return !this.goal.isEnd(node)
  }

  heuristic (node: Move): number {
    return -this.goal.heuristic(node)
  }

  hasChanged (...args: Parameters<BotEvents[keyof BotEvents]>): boolean {
    if (!this.isDynamic) return false
    return (this.goal as GoalDynamic).hasChanged(...args)
  }

  isValid (...args: Parameters<BotEvents[keyof BotEvents]>): boolean {
    if (!this.isDynamic) return false
    return (this.goal as GoalDynamic).isValid(...args)
  }

  update (): void {
    if (this.goal instanceof GoalDynamic) this.goal.update()
  }
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

  /**
   * Prevent overlap.
   */
  isEnd (node: Move): boolean {
    return super.isEnd(node) && node.x !== this.x && node.y !== this.y && node.z !== this.z
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

interface GoalFollowEntityOpts {
  neverfinish?: boolean
  dynamic?: boolean
}

export class GoalFollowEntity extends GoalDynamic<'entityMoved', 'entityGone'> {
  readonly eventKeys = 'entityMoved' as const
  readonly validKeys = 'entityGone' as const

  public x: number
  public y: number
  public z: number
  public sqDist: number

  constructor (public readonly refVec: Vec3, distance: number, opts: GoalFollowEntityOpts = {}) {
    super()
    this.x = refVec.x
    this.y = refVec.y
    this.z = refVec.z
    this.sqDist = Math.pow(distance, 2)
    this.neverfinish = opts.neverfinish ?? false
    this.dynamic = opts.dynamic ?? true
  }

  static fromEntity (entity: { position: Vec3 }, distance: number, opts: GoalFollowEntityOpts): GoalFollowEntity {
    return new GoalFollowEntity(entity.position, distance, opts)
  }

  isEnd (node: Move): boolean {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z

    return dx * dx + dy * dy + dz * dz <= this.sqDist
  }

  heuristic (node: Move): number {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z

    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  hasChanged (e: Entity): boolean {
    if (e.position !== this.refVec) return false
    const dx = this.x - this.refVec.x
    const dy = this.y - this.refVec.y
    const dz = this.z - this.refVec.z

    const ret = Math.abs(dx * dx) + Math.abs(dy * dy) + Math.abs(dz * dz) > this.sqDist
    if (ret) {
      this.update()
    }

    return ret
  }

  isValid (entity: Entity): boolean {
    return entity.position === this.refVec
  }

  update (): void {
    this.x = this.refVec.x
    this.y = this.refVec.y
    this.z = this.refVec.z
  }
}
