import { Vec3 } from 'vec3'
import type { Bot } from 'mineflayer'
import { BotcraftPhysics } from '@nxg-org/mineflayer-physics-util/dist/physics/engines'
import { ControlStateHandler } from '@nxg-org/mineflayer-physics-util/dist/physics/player'
import { EPhysicsCtx } from '@nxg-org/mineflayer-physics-util/dist/physics/settings'
import { PlayerState } from '@nxg-org/mineflayer-physics-util/dist/physics/states'
import { applyMdToNewEntity } from '@nxg-org/mineflayer-physics-util/dist/util/physicsUtils'

import { CacheSyncWorld } from '../../src/mineflayer-specific/world/cacheWorld'
import { createFakePlayer, type EventedMutableWorld } from './fake-player'
import { createFlatWorld, FakeWorld, type FakeWorldOptions } from './fake-world'
import { loadMcData } from './mc-data'

const mineflayerPhysicsPlugin = require('mineflayer/lib/plugins/physics') as any

export function createPlayerRig(world: EventedMutableWorld, options: {
  version: string
  position: Vec3
  groundLevel?: number
  username?: string
  trackRenderDistance?: boolean
}) {
  const { version, position } = options
  const groundLevel = options.groundLevel ?? position.y
  const { mcData } = loadMcData(version)

  const fakePlayer = createFakePlayer(version, mcData, world, position.clone(), groundLevel, options.username)
  const metadataEntity = applyMdToNewEntity(EPhysicsCtx, mcData.entitiesByName.player)
  fakePlayer.entity.name = metadataEntity.name
  fakePlayer.entity.displayName = metadataEntity.displayName
  fakePlayer.entity.height = 1.8
  fakePlayer.entity.width = 0.6

  fakePlayer.loadPlugin(mineflayerPhysicsPlugin, { physicsEnabled: true })
  fakePlayer.emit('login')
  fakePlayer._client.emit('position', {
    x: fakePlayer.entity.position.x,
    y: fakePlayer.entity.position.y,
    z: fakePlayer.entity.position.z,
    yaw: 0,
    pitch: 0,
    flags: 0,
    teleportId: 0
  })
  if (world instanceof FakeWorld && options.trackRenderDistance !== false) {
    world.trackBot(fakePlayer)
  }

  const physics = new BotcraftPhysics(mcData)
  const playerCtx = EPhysicsCtx.FROM_BOT(physics, fakePlayer as unknown as Bot)
  const playerState = playerCtx.state as PlayerState
  playerState.control = ControlStateHandler.DEFAULT()

  return {
    mcData,
    fakePlayer,
    bot: fakePlayer,
    physics,
    playerCtx,
    playerState,
    stopPassivePhysics: () => {
      fakePlayer.emit('end')
      if (world instanceof FakeWorld) world.untrackBot()
    }
  }
}

export type CreateCacheWorldOptions = Omit<FakeWorldOptions, 'center'> & {
  trackRenderDistance?: boolean
  world?: FakeWorld
}

export function createCacheWorld(version: string, floorY: number, position: Vec3, options: CreateCacheWorldOptions = {}) {
  const world = options.world ?? createFlatWorld(version, floorY, { ...options, center: position })
  const rig = createPlayerRig(world, { version, position, groundLevel: floorY, trackRenderDistance: options.trackRenderDistance })
  const cacheWorld = new CacheSyncWorld(rig.bot as Bot, world as any)

  return {
    world,
    rig,
    cacheWorld
  }
}

export function createCacheWorldFromFolder(
  version: string,
  floorY: number,
  position: Vec3,
  worldFolder: string,
  options: Omit<CreateCacheWorldOptions, 'worldFolder'> = {}
) {
  return createCacheWorld(version, floorY, position, { ...options, worldFolder })
}
