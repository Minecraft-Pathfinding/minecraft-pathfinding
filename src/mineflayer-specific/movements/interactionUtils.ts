import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'

import type { Item } from 'prismarine-item'
import { BlockInfo } from '../world/cacheWorld'
import { BotcraftPhysics, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { World } from '../world/worldInterface'
import { AABB, AABBUtils, BlockFace } from '@nxg-org/mineflayer-util-plugin'

import { CancelError } from '../exceptions'
import { MovementOptions } from './movement'
import { MovementExecutor } from './movementExecutor'
import { Block } from '../../types'
import { Task } from '../../utils'

const debug = require('debug')
const logBase = debug('minecraft-pathfinding:InteractHandler')
const logPlace = debug('minecraft-pathfinding:PlaceHandler')
const logBreak = debug('minecraft-pathfinding:BreakHandler')

export type InteractType = 'water' | 'solid' | 'replaceable'
export type RayType = {
  intersect: Vec3
  face: BlockFace
} & Block

interface InteractionPerformInfo {
  ticks: number
  tickAllowance: number
  shiftTick: number
  raycasts: RayType[]
}

export interface InteractOpts {
  info?: InteractionPerformInfo
  returnToStart?: boolean
  returnToPos?: Vec3
  predictBlock?: boolean
  noAwait?: boolean
}

/**
 * TODO: Predict time of rotation for looking.
 *
 * Allow looking sooner than the actual block placement.
 */
export abstract class InteractHandler {
  protected performing = false
  public cancelled = false

  protected _done = false
  protected _internalLock = true
  protected task?: Task<void, Error>

  public readonly blockInfo: BlockInfo

  protected readonly move!: MovementExecutor

  protected get settings (): MovementOptions {
    return this.move.settings
  }

  public get vec (): Vec3 {
    return new Vec3(this.x, this.y, this.z)
  }

  public get bb (): AABB {
    return AABB.fromBlock(this.vec)
  }

  constructor (
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly type: InteractType,
    public readonly offhand = false
  ) {
    this.blockInfo = this.toBlockInfo()
  }

  public get isPerforming (): boolean {
    return this.performing
  }

  public get done (): boolean {
    return this._done
  }

  public get allowExit (): boolean {
    return !this._internalLock
  }

  public loadMove (move: MovementExecutor): void {
    (this as any).move = move
  }

  abstract needToPerform (bot: Bot): boolean

  abstract getItem (bot: Bot, block?: Block): Item | null
  abstract perform (bot: Bot, item: Item | null, opts?: InteractOpts): Promise<void>
  abstract performInfo (bot: Bot, ticks?: number): Promise<InteractionPerformInfo>
  abstract toBlockInfo (): BlockInfo

  abstract abort (bot: Bot): Promise<void>

  public async _abort (bot: Bot): Promise<void> {
    if (this.performing && !this.cancelled) {
      logBase(`Aborting interaction at ${this.vec}`)
      await this.abort(bot)
      this.performing = false
      this.cancelled = true
    }
  }

  public async _perform (bot: Bot, item: Item | null, opts: InteractOpts = {}): Promise<void> {
    if (this.performing) {
      logBase(`Error: Already performing interaction at ${this.vec}`)
      throw new Error('Already performing')
    }
    
    logBase(`Starting interaction at ${this.vec} (Type: ${this.type}, Offhand: ${this.offhand})`)
    this.performing = true
    this._internalLock = true
    this.task = new Task()

    const ret = await this.perform(bot, item, opts).catch((err) => {
      logBase(`Interaction failed at ${this.vec}: %O`, err)
      this._internalLock = false
      this._done = true
      this.performing = false

      if (this.task?.canceled != null) return
      throw new CancelError(`Failed to perform ${this.constructor.name}`, err)
    })

    logBase(`Successfully completed interaction at ${this.vec}`)
    this._internalLock = false
    this._done = true
    this.performing = false
    return ret
  }

  getCurrentItem (bot: Bot): Item | null {
    if (this.offhand) return bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')]
    return bot.inventory.slots[bot.getEquipmentDestSlot('hand')]
  }

  async equipItem (bot: Bot, item: Item | null): Promise<void> {
    if (item === null) {
      logBase(`Unequipping ${this.offhand ? 'off-hand' : 'hand'}`)
      await bot.unequip(this.offhand ? 'off-hand' : 'hand')
    } else if (this.offhand) {
      logBase(`Equipping ${item.name} to off-hand`)
      await bot.equip(item, 'off-hand')
    } else {
      logBase(`Equipping ${item.name} to hand`)
      await bot.equip(item, 'hand')
    }
    bot.updateHeldItem()
    await bot.waitForTicks(2)
  }

  async allowExternalInfluence (bot: Bot, ticks = 1, sneak = false): Promise<boolean> {
    if (!this.performing) return true
    if (!this._internalLock) return true

    const res = await this.performInfo(bot, ticks)
    if (res.ticks < Infinity) return true

    const ectx = new BotcraftPhysics(bot.registry)
    const state = EPhysicsCtx.FROM_BOT(ectx, bot)

    const flag0 = bot.entity.onGround
    for (let i = 0; i < ticks; i++) {
      ectx.simulate(state, bot.pathfinder.world as any)
    }

    if (flag0) if (state.position.y < bot.entity.position.y) return false

    if (state.state.pos.y < bot.entity.position.y) return false
    return this.bb.distanceToVec(state.state.pos) < PlaceHandler.reach
  }
}

export class PlaceHandler extends InteractHandler {
  static reach = 4
  private _placeTask?: Promise<void>

  static fromVec (vec: Vec3, type: InteractType, offhand = false): PlaceHandler {
    return new PlaceHandler(vec.x, vec.y, vec.z, type, offhand)
  }

  static identTypeFromItem (item: Item): InteractType {
    if (item.name.includes('water')) return 'water'
    return 'solid'
  }

  toBlockInfo (): BlockInfo {
    switch (this.type) {
      case 'solid':
        return BlockInfo.SOLID(this.vec)
      case 'water':
        return BlockInfo.WATER(this.vec)
      case 'replaceable':
        return BlockInfo.REPLACEABLE(this.vec)
      default:
        throw new Error('Invalid type')
    }
  }

  getItem (bot: Bot): Item | null {
    switch (this.type) {
      case 'water': {
        return bot.inventory.items().find((item) => item.name === 'water_bucket') ?? null
      }
      case 'solid': {
        return bot.inventory.items().find((item) => BlockInfo.scaffoldingBlockItems.has(item.type)) ?? null
      }
      case 'replaceable': {
        throw new Error('Not implemented')
      }
      default:
        throw new Error('Not implemented')
    }
  }

  getNearbyBlocks (world: World): BlockInfo[] {
    return [
      world.getBlockInfo(this.vec.offset(0, 1, 0)),
      world.getBlockInfo(this.vec.offset(0, -1, 0)),
      world.getBlockInfo(this.vec.offset(0, 0, -1)),
      world.getBlockInfo(this.vec.offset(0, 0, 1)),
      world.getBlockInfo(this.vec.offset(-1, 0, 0)),
      world.getBlockInfo(this.vec.offset(1, 0, 0))
    ]
  }

  faceToVec (face: BlockFace): Vec3 {
    switch (face) {
      case BlockFace.BOTTOM: return new Vec3(0, -1, 0)
      case BlockFace.TOP: return new Vec3(0, 1, 0)
      case BlockFace.NORTH: return new Vec3(0, 0, -1)
      case BlockFace.SOUTH: return new Vec3(0, 0, 1)
      case BlockFace.WEST: return new Vec3(-1, 0, 0)
      case BlockFace.EAST: return new Vec3(1, 0, 0)
      default: throw new Error('Invalid face')
    }
  }

  needToPerform (bot: Bot): boolean {
    const blockInfo = bot.pathfinder.world.getBlockInfo(this.vec)
    if (blockInfo.isInvalid) {
      logPlace(`Block at ${this.vec} is invalid. needsToPerform: true`)
      return true
    }

    let needs = true
    switch (this.type) {
      case 'water': {
        needs = !(blockInfo.liquid && BlockInfo.waters.has(blockInfo.type))
        break
      }
      case 'solid': {
        needs = !blockInfo.physical
        break
      }
      case 'replaceable': {
        needs = !(blockInfo.replaceable)
        break
      }
    }

    // logPlace(`needToPerform at ${this.vec}? ${needs} (Type: ${this.type})`)
    return needs
  }

 async performInfo (bot: Bot, ticks = 15, scale = 0.5): Promise<InteractionPerformInfo> {
    switch (this.type) {
      case 'water': {
        throw new Error('Not implemented')
      }

      case 'solid': {
        const works = []
        
        for (let i = 0; i <= ticks; i++) {
          const ectx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot)
          const state = ectx.state

          // Lightweight physics simulation
          for (let j = 0; j < i; j++) {
            bot.physicsUtil.engine.simulate(ectx, bot.world)
          }

          const bb1 = state.getBB()
          const eyePos = state.pos.offset(0, state.eyeHeight, 0)
          
          const dx = eyePos.x - (this.vec.x + 0.5)
          const dy = eyePos.y - (this.vec.y + 0.5)
          const dz = eyePos.z - (this.vec.z + 0.5)
          
          const verts: Vec3[] = []
          const m = 0.05 // Tiny margin
          const M = 0.95

          // Top / Bottom Face (Center + 4 Corners)
          if (dy > 0) {
            verts.push(this.vec.offset(0.5, 1, 0.5), this.vec.offset(m, 1, m), this.vec.offset(M, 1, m), this.vec.offset(m, 1, M), this.vec.offset(M, 1, M))
          } else {
            verts.push(this.vec.offset(0.5, 0, 0.5), this.vec.offset(m, 0, m), this.vec.offset(M, 0, m), this.vec.offset(m, 0, M), this.vec.offset(M, 0, M))
          }

          // East / West Face (Center + 4 Corners)
          if (dx > 0) {
            verts.push(this.vec.offset(1, 0.5, 0.5), this.vec.offset(1, m, m), this.vec.offset(1, M, m), this.vec.offset(1, m, M), this.vec.offset(1, M, M))
          } else {
            verts.push(this.vec.offset(0, 0.5, 0.5), this.vec.offset(0, m, m), this.vec.offset(0, M, m), this.vec.offset(0, m, M), this.vec.offset(0, M, M))
          }

          // South / North Face (Center + 4 Corners)
          if (dz > 0) {
            verts.push(this.vec.offset(0.5, 0.5, 1), this.vec.offset(m, m, 1), this.vec.offset(M, m, 1), this.vec.offset(m, M, 1), this.vec.offset(M, M, 1))
          } else {
            verts.push(this.vec.offset(0.5, 0.5, 0), this.vec.offset(m, m, 0), this.vec.offset(M, m, 0), this.vec.offset(m, M, 0), this.vec.offset(M, M, 0))
          }

          let good = 0
          for (const vert of verts) {
            const rayRes: RayType | null = (await bot.world.raycast(
              eyePos,
              vert.minus(eyePos).normalize().scale(scale),
              PlaceHandler.reach / scale
            )) as unknown as RayType
            
            if (rayRes === null) continue
            
            const pos = rayRes.position.plus(this.faceToVec(rayRes.face))
            if (pos.equals(this.vec)) {
              if (bb1.containsVec(rayRes.intersect)) continue
              if (AABB.fromBlock(pos).intersects(bb1)) continue
              
              good++
              works.push(rayRes as unknown as RayType)
            }
          }
          
          // INSTANT EXIT: The moment we find a valid placement frame, return it!
          if (good > 0) {
            logPlace(`performInfo calculated. ticks: ${i}, raycasts: ${good}`)
            return { ticks: i, tickAllowance: 0, shiftTick: Infinity, raycasts: works }
          }
        }
        
        logPlace(`performInfo failed to find placement path. Returning Infinity.`)
        return { ticks: Infinity, tickAllowance: Infinity, shiftTick: Infinity, raycasts: works }
      }

      case 'replaceable': {
        throw new Error('Not implemented')
      }
      default: {
        throw new Error('Not implemented')
      }
    }
  }

  async perform (bot: Bot, item: Item | null, opts: InteractOpts = {}): Promise<void> {
    const curInfo = { yaw: bot.entity.yaw, pitch: bot.entity.pitch }

    if (item === null) {
      logPlace('Error: Cannot perform placement with null item')
      throw new Error('Invalid item')
    }

    logPlace(`Starting perform sequence at ${this.vec} with ${item.name}`)

    switch (this.type) {
      case 'water': {
        if (item.name !== 'water_bucket') throw new Error('Invalid item')
        if (this.getCurrentItem(bot) !== item) await this.equipItem(bot, item)

        logPlace(`Looking at ${this.vec} to place water.`)
        await bot.lookAt(this.vec, this.settings.forceLook)
        bot.activateItem(this.offhand)
        logPlace(`Water placed.`)
        break 
      }

      case 'solid': {
        if (this.getCurrentItem(bot) !== item) await this.equipItem(bot, item)

        const predictBlock = opts.predictBlock ?? true

        let works
        if (opts.info === undefined) {
          works = await this.performInfo(bot)
        } else works = opts.info

        let waitTicks = 0
        while (works.raycasts.length === 0) {
          waitTicks++
          await bot.waitForTicks(1)
          works = await this.performInfo(bot)
        }
        if (waitTicks > 0) logPlace(`Waited ${waitTicks} ticks for valid raycast intersections.`)
        
        const stateEyePos = bot.entity.position.offset(0, 1.62, 0)
        const lookDir = bot.util.getViewDir()
        works.raycasts.sort((a, b) => b.intersect.minus(stateEyePos).dot(lookDir) - a.intersect.minus(stateEyePos).dot(lookDir))

        const rayRes = works.raycasts[0]
        if (rayRes === undefined) {
          logPlace('Error: Failed to find valid rayRes after filtering.')
          throw new Error('Invalid block')
        }

        const pos = rayRes.position.plus(this.faceToVec(rayRes.face))
        const posBl = AABB.fromBlock(pos)

        logPlace(`Simulating movement ticks before placement (ticks needed: ${works.ticks})`)
        let i = 0
        for (; i < works.ticks; i++) {
          const ectx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot)
          const state = ectx.state
          bot.physicsUtil.engine.simulate(ectx, bot.world)
          
          const sPos = state.pos.offset(0, 1.62, 0)
          const testCheck = (await bot.world.raycast(
            sPos,
            rayRes.intersect.minus(sPos).normalize().scale(0.5),
            PlaceHandler.reach * 2
          )) as unknown as RayType

          if (testCheck === null) break

          const pos1 = testCheck.position.plus(this.faceToVec(testCheck.face))
          const pos1Bl = AABB.fromBlock(pos1)
          if (testCheck.position.equals(rayRes.position) && testCheck.face === rayRes.face && !state.getBB().intersects(pos1Bl)) {
            if (i < works.ticks - 1 && works.ticks !== 0) {
              logPlace(`Early exit from pre-placement simulation at tick ${i + 1}/${works.ticks} due to favorable conditions. Current position: ${state.pos}, Ray intersect: ${rayRes.intersect}, Test check position: ${testCheck.position}, Test check face: ${testCheck.face}`)
              await bot.waitForTicks(1)
            }
            break
          }
          logPlace(`Simulating tick ${i + 1}/${works.ticks} before placement. Current position: ${state.pos}, Ray intersect: ${rayRes.intersect}, Test check position: ${testCheck.position}, Test check face: ${testCheck.face}`)
          await bot.waitForTicks(1)
        }

        const botBB = AABBUtils.getEntityAABBRaw({ position: bot.entity.position, width: 0.6, height: 1.8 })

        if (!this.move.isLookingAt(rayRes.intersect)) {
          logPlace(`Adjusting look toward raycast intersection at ${rayRes.intersect}`)
          void this.move.lookAt(rayRes.intersect)
          void bot.lookAt(rayRes.intersect, this.settings.forceLook)
        }

        const invalidPlacement = botBB.intersects(posBl)
        if (invalidPlacement) {
          logPlace(`Error: Invalid placement! Bot AABB intersects target placement AABB at ${posBl.bottomMiddlePoint()}`)
          await bot.lookAt(rayRes.intersect, this.settings.forceLook)
          throw new CancelError('Invalid placement')
        }

        const direction = this.faceToVec(rayRes.face)
        
        logPlace(`Calling bot._placeBlockWithOptions at face ${rayRes.face}`)
        this._placeTask = bot._placeBlockWithOptions(rayRes, direction, { forceLook: 'ignore', swingArm: 'right' })
        
        if (predictBlock) {
          logPlace(`Predicting block placement at ${rayRes.position.plus(direction)}`)
          bot.world.setBlock(rayRes.position.plus(direction), BlockInfo.PBlock.fromStateId(BlockInfo.substituteBlockStateId, 0))
        }

        this._internalLock = false

        if (opts.noAwait) {
          this._placeTask.catch((err) => logPlace(`Background place task failed: %O`, err))
        } else {
          await this._placeTask
          logPlace(`_placeTask resolved.`)
        }

        this.task?.finish()
        break
      }
      case 'replaceable':
      default: {
        throw new Error('Not implemented')
      }
    }

    if (opts.returnToPos !== undefined) {
      await bot.lookAt(opts.returnToPos, this.settings.forceLook)
    } else if (opts.returnToStart != null && opts.returnToStart) {
      await bot.look(curInfo.yaw, curInfo.pitch, this.settings.forceLook)
    }

    this._done = true
    this.performing = false
    delete this._placeTask
    logPlace(`Completed perform sequence at ${this.vec}`)
  }

  async abort (bot: Bot): Promise<void> {
    logPlace(`Aborting placement at ${this.vec}`)
    if ((this.task != null) && !this.task.done) {
      this.task.finish()
      this.task.canceled = true
    }

    if (this._placeTask != null) {
      await this._placeTask.catch((err) => {
        logPlace(`Caught error during _placeTask abort: %O`, err)
      })
    }
  }
}

export class BreakHandler extends InteractHandler {
  static reach = 4
  private _breakTask?: Promise<void>

  static fromVec (vec: Vec3, type: InteractType, offhand = false): BreakHandler {
    return new BreakHandler(vec.x, vec.y, vec.z, type, offhand)
  }

  toBlockInfo (): BlockInfo {
    return BlockInfo.AIR(this.vec)
  }

  getBlock (world: World): Block | null {
    return world.getBlock(this.vec)
  }

  getItem (bot: Bot, block: Block): Item | null {
    switch (this.type) {
      case 'water': {
        return bot.inventory.items().find((item) => item.name === 'bucket') ?? null // empty bucket
      }
      case 'solid': {
        // TODO: identify best tool for block.
        return bot.pathingUtil.bestHarvestingTool(block)
      }
      case 'replaceable': {
        throw new Error('Not implemented')
      }
      default:
        throw new Error('Not implemented')
    }
  }

  needToPerform (bot: Bot): boolean {
    const blockInfo = bot.pathfinder.world.getBlockInfo(this.vec)

    if (blockInfo.isInvalid) {
      logBreak(`Block at ${this.vec} is invalid. needsToPerform: true`)
      return true
    }

    const needs = !(blockInfo.block?.boundingBox === 'empty' && !BlockInfo.liquids.has(blockInfo.type))
    // logBreak(`needToPerform at ${this.vec}? ${needs}`)
    return needs
  }

  async performInfo (bot: Bot, ticks = 15): Promise<InteractionPerformInfo> {
    const bb = AABB.fromBlock(this.vec)
    const dist = bb.distanceToVec(bot.entity.position.offset(0, 1.62, 0))
    const reachable = dist < BreakHandler.reach + 5
    
    logBreak(`performInfo calculation. Distance: ${dist.toFixed(2)}, Reachable: ${reachable}`)

    return reachable
      ? { ticks: 0, tickAllowance: 0, shiftTick: 0, raycasts: [] }
      : { ticks: Infinity, tickAllowance: Infinity, shiftTick: Infinity, raycasts: [] }
  }

  async perform (bot: Bot, item: Item | null = null, opts: InteractOpts = {}): Promise<void> {
    const curInfo = { yaw: bot.entity.yaw, pitch: bot.entity.pitch }
    logBreak(`Starting break sequence at ${this.vec}`)

    switch (this.type) {
      case 'water': {
        if (item === null) throw new Error('No item')
        if (item.name !== 'bucket') throw new Error('Invalid item')
        if (this.getCurrentItem(bot) !== item) await this.equipItem(bot, item)
        
        logBreak(`Looking at ${this.vec} to collect water.`)
        await bot.lookAt(this.vec, this.settings.forceLook)
        bot.activateItem(this.offhand)
        logBreak(`Water collected.`)
        break 
      }

      case 'solid': {
        if (item === null) {
          if (this.getCurrentItem(bot) !== null) await bot.unequip(this.offhand ? 'off-hand' : 'hand')
        } else if (this.getCurrentItem(bot) !== item) {
          await this.equipItem(bot, item)
        }
        
        const block = await bot.world.getBlock(this.vec) as Block | null
        if (block == null) {
          logBreak('Error: Block is null')
          throw new Error('Invalid block')
        }
        
        logBreak(`Looking at ${this.vec} to start digging.`)
        await bot.lookAt(this.vec, this.settings.forceLook)

        logBreak(`Calling bot.dig on ${block.name}`)
        this._breakTask = bot.dig(block, 'ignore', 'raycast')

        await this._breakTask
        logBreak(`Dig task resolved.`)
        if (this.task != null) this.task.finish()
        break
      }

      case 'replaceable': {
        throw new Error('Not implemented')
      }

      default: {
        throw new Error('Not implemented')
      }
    }

    if (opts.returnToPos !== undefined) {
      await bot.lookAt(opts.returnToPos, this.settings.forceLook)
    } else {
      const look = opts.returnToStart ?? false
      if (look) await bot.look(curInfo.yaw, curInfo.pitch, this.settings.forceLook)
    }

    delete this._breakTask
    logBreak(`Completed break sequence at ${this.vec}`)
  }

  async abort (bot: Bot): Promise<void> {
    logBreak(`Aborting break at ${this.vec}`)
    if ((this.task != null) && !this.task.done) {
      this.task.finish()
      this.task.canceled = true
    }

    if (this._breakTask != null) {
      switch (this.type) {
        case 'water': {
          break
        }
        case 'solid': {
          logBreak(`Calling bot.stopDigging()`)
          bot.stopDigging()
          break
        }
        case 'replaceable': {
          break
        }
      }
      await this._breakTask.catch((err) => {
        logBreak(`Caught error during _breakTask abort: %O`, err)
      })
    }
  }
}