import { BaseSimulator, EPhysicsCtx, EntityPhysics } from '@nxg-org/mineflayer-physics-util'
import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Move } from '../move'
import { World } from '../world/worldInterface'
import { BlockInfo } from '../world/cacheWorld'
import { BreakHandler, InteractHandler, InteractType, PlaceHandler } from './interactionUtils'
import { Block, Vec3Properties } from '../../types'
import { COST_INF } from './costs'

export interface MovementOptions {
  allowDiagonalBridging: boolean
  allowJumpSprint: boolean
  allow1by1towers: boolean
  liquidCost: number
  digCost: number
  forceLook: boolean
  jumpCost: number
  placeCost: number
  velocityKillCost: number
  canOpenDoors: boolean
  canDig: boolean
  canPlace: boolean
  dontCreateFlow: boolean
  dontMineUnderFallingBlock: boolean

  maxDropDown: number
  infiniteLiquidDropdownDistance: boolean
  allowSprinting: boolean
  careAboutLookAlignment: boolean

  movementTimeoutMs: number
}

export const DEFAULT_MOVEMENT_OPTS: MovementOptions = {
  allowJumpSprint: true,
  canOpenDoors: true,
  canDig: true,
  canPlace: true,
  dontCreateFlow: true,
  dontMineUnderFallingBlock: true,
  allow1by1towers: true,
  maxDropDown: 3,
  infiniteLiquidDropdownDistance: true,
  allowSprinting: true,
  liquidCost: 3,
  placeCost: 2,
  digCost: 1,
  jumpCost: 0.5,
  velocityKillCost: 2, // implement at a later date.
  forceLook: true,
  careAboutLookAlignment: true,
  allowDiagonalBridging: true,
  movementTimeoutMs: 1000
}

const cardinalVec3s: Vec3[] = [
  // { x: -1, z: 0 }, // West
  // { x: 1, z: 0 }, // East
  // { x: 0, z: -1 }, // North
  // { x: 0, z: 1 }, // South
  new Vec3(-1, 0, 0),
  new Vec3(1, 0, 0),
  new Vec3(0, 0, -1),
  new Vec3(0, 0, 1)
]

Object.freeze(cardinalVec3s)
cardinalVec3s.forEach(Object.freeze)

const diagonalVec3s: Vec3[] = [
  // { x: -1, z: -1 },
  // { x: -1, z: 1 },
  // { x: 1, z: -1 },
  // { x: 1, z: 1 },
  new Vec3(-1, 0, -1),
  new Vec3(-1, 0, 1),
  new Vec3(1, 0, -1),
  new Vec3(1, 0, 1)
]

Object.freeze(diagonalVec3s)
diagonalVec3s.forEach(Object.freeze)

const jumpVec3s: Vec3[] = [
  new Vec3(-3, 0, 0),
  new Vec3(-2, 0, 1),
  new Vec3(-2, 0, -1),
  new Vec3(-1, 0, 2),
  new Vec3(-1, 0, -2),
  new Vec3(0, 0, 3),
  new Vec3(0, 0, -3),
  new Vec3(1, 0, 2),
  new Vec3(1, 0, -2),
  new Vec3(2, 0, 1),
  new Vec3(2, 0, -1),
  new Vec3(3, 0, 0)
]

Object.freeze(jumpVec3s)
jumpVec3s.forEach(Object.freeze)

/**
 * TODO: Separate calculation time from runtime.
 *
 * Calculation time is when the bot is deciding what to do.
 * Runtime is when the bot is actually doing it.
 *
 * This class is currently bloated by providing two functions.
 * It should be broken up.
 */

export abstract class Movement {
  static readonly cardinalDirs = cardinalVec3s
  static readonly diagonalDirs = diagonalVec3s
  static readonly jumpDirs = jumpVec3s

  public readonly bot: Bot
  public readonly world: World
  public settings: MovementOptions

  /**
   * Current move being executed.
   *
   * This move is the same as the thisMove argument provided to functions.
   */
  protected currentMove!: Move

  /**
   * Current interaction.
   */
  protected _cI?: InteractHandler

  public constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    this.bot = bot
    this.world = world
    this.settings = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings)
  }

  loadMove (move: Move): void {
    this.currentMove = move
  }

  toBreak (): BreakHandler[] {
    return this.currentMove.toBreak?.filter((b) => !b.allowExit) ?? []
  }

  toBreakLen (): number {
    return this.currentMove.toBreak?.filter((b) => !b.allowExit).length ?? 0
  }

  toPlace (): PlaceHandler[] {
    return this.currentMove.toPlace?.filter((b) => !b.allowExit) ?? []
  }

  toPlaceLen (): number {
    return this.currentMove.toPlace?.filter((b) => !b.allowExit).length ?? 0
  }

  getBlock (pos: Vec3Properties, dx: number, dy: number, dz: number): Block | null {
    return this.world.getBlock(new Vec3(pos.x + dx, pos.y + dy, pos.z + dz))
  }

  getBlockInfo (pos: Vec3Properties, dx: number, dy: number, dz: number): BlockInfo {
    const yes = new Vec3(Math.floor(pos.x + dx), Math.floor(pos.y + dy), Math.floor(pos.z + dz))
    return this.world.getBlockInfo(yes)
  }

  getBlockInfoRaw (pos: Vec3): BlockInfo {
    return this.world.getBlockInfo(pos)
  }

  /**
   * Returns if a block is safe or not
   * @param pos
   * @returns
   */
  safe (pos: Vec3Properties): number {
    const block = this.world.getBlockInfo(new Vec3(pos.x, pos.y, pos.z))
    return block.physical ? 0 : COST_INF
  }

  /**
   * Takes into account if the block is within a break exclusion area.
   * @param {BlockInfo} block
   * @returns
   */
  safeToBreak (block: BlockInfo): boolean {
    if (!this.settings.canDig) {
      return false
    }

    if (this.settings.dontCreateFlow) {
      if (!block.additionalLoaded) block.loadAdditionalInfo(this)
      if (block.waterAround) return false
    }

    if (this.settings.dontMineUnderFallingBlock) {
      if (!block.additionalLoaded) block.loadAdditionalInfo(this)
      // TODO: Determine if there are other blocks holding the entity up
      if (block.fallBlockOver) return false
      // if (this.getBlockInfo(block.position, 0, 1, 0).canFall) {
      //   // || (this.getNumEntitiesAt(block.position, 0, 1, 0) > 0)
      //   return false
      // }
    }

    // console.log('block type:', this.bot.registry.blocks[block.type], block.position, !BlockInfo.blocksCantBreak.has(block.type))
    return BlockInfo.replaceables.has(block.type) || !BlockInfo.blocksCantBreak.has(block.type) // && this.exclusionBreak(block) < COST_INF
  }

  /**
   * Takes into account if the block is within the stepExclusionAreas. And returns COST_INF if a block to be broken is within break exclusion areas.
   * @param {import('prismarine-block').Block} block block
   * @param {[]} toBreak
   * @returns {number}
   */
  safeOrBreak (block: BlockInfo, toBreak: BreakHandler[]): number {
    // cost += this.exclusionStep(block) // Is excluded so can't move or break
    // cost += this.getNumEntitiesAt(block.position, 0, 0, 0) * this.entityCost

    // if (block.breakCost !== undefined) return block.breakCost // cache breaking cost.

    if (block.walkthrough) {
      // if (!block.replaceable) toBreak.push(BreakHandler.fromVec(block.position, "solid"));
      return 0 // TODO: block is a carpet or a climbable (BUG)
    }

    if (block.block === null) return COST_INF // Don't know its type, but that's only replaceables so just return.

    if (!this.safeToBreak(block)) return COST_INF // Can't break, so can't move

    const cost = this.breakCost(block)

    // console.log('cost for:', block.position, cost)

    if (cost >= COST_INF) return cost

    // TODO: Calculate cost of breaking block
    // if (block.physical) cost += this.getNumEntitiesAt(block.position, 0, 1, 0) * this.entityCost // Add entity cost if there is an entity above (a breakable block) that will fall
    toBreak.push(BreakHandler.fromVec(block.position, 'solid'))

    return cost
  }

  breakCost (block: BlockInfo): number {
    if (block.block === null) return COST_INF // Don't know its type, but that's only replaceables so just return.

    // const tool = this.bot.pathfinder.bestHarvestTool(block)

    const digTime = this.bot.pathingUtil.digCost(block.block)
    // const tool = null as any;
    // const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : []
    // const effects = this.bot.entity.effects
    // const digTime = block.block.digTime(tool ? tool.type : null, false, false, false, enchants, effects)
    const laborCost = (1 + 3 * digTime / 1000) * this.settings.digCost
    return laborCost
  }

  safeOrPlace (block: BlockInfo, toPlace: PlaceHandler[], type: InteractType = 'solid'): number {
    if (!this.settings.canPlace) return COST_INF
    if (this.currentMove.remainingBlocks <= 0) return COST_INF

    if (block.block === null) return COST_INF // Don't know its type, but that's only replaceables so just return.
    if (block.solidFull) return 0 // block is already physical at location.

    const cost = this.placeCost(block)

    if (cost >= COST_INF) return cost
    toPlace.push(PlaceHandler.fromVec(block.position, type))

    return cost
  }

  /**
   * TODO: calculate more accurate place costs.
   */
  placeCost (block: BlockInfo): number {
    return this.settings.placeCost
  }
}

export abstract class SimMovement extends Movement {
  stateCtx: EPhysicsCtx
  sim: BaseSimulator
  constructor (bot: Bot, world: World, settings: Partial<MovementOptions>) {
    super(bot, world, settings)
    this.sim = new BaseSimulator(new EntityPhysics(bot.registry))
    this.stateCtx = EPhysicsCtx.FROM_BOT(this.sim.ctx, bot)
  }

  simulateUntil (...args: Parameters<BaseSimulator['simulateUntil']>): ReturnType<BaseSimulator['simulateUntil']> {
    return this.sim.simulateUntil(...args)
  }
}
