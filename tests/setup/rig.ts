import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { BotcraftPhysics } from '@nxg-org/mineflayer-physics-util/dist/physics/engines'
import { ControlStateHandler } from '@nxg-org/mineflayer-physics-util/dist/physics/player'
import { EPhysicsCtx } from '@nxg-org/mineflayer-physics-util/dist/physics/settings'
import { PlayerState } from '@nxg-org/mineflayer-physics-util/dist/physics/states'
import { applyMdToNewEntity } from '@nxg-org/mineflayer-physics-util/dist/util/physicsUtils'

import { CacheSyncWorld } from '../../src/mineflayer-specific/world/cacheWorld'
import type { World } from '../../src/mineflayer-specific/world/worldInterface'
import { createFakePlayer } from './fake-player'
import { createFlatWorld, FakeWorld, type FakeWorldOptions } from './fake-world'
import { loadMcData } from './mc-data'

const mineflayerPhysicsPlugin = require('mineflayer/lib/plugins/physics') as (bot: any, options?: { physicsEnabled?: boolean }) => void

export function createPlayerRig(world: World, options: {
  version: string
  position: Vec3
  groundLevel?: number
  username?: string
}) {
  const { version, position } = options
  const groundLevel = options.groundLevel ?? position.y
  const { mcData } = loadMcData(version)

  const fakePlayer: any = createFakePlayer(version, mcData, world, position.clone(), groundLevel, options.username)
  fakePlayer.entity = applyMdToNewEntity(EPhysicsCtx, mcData.entitiesByName.player, fakePlayer.entity)
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
  if (world instanceof FakeWorld) {
    world.trackBot(fakePlayer)
  }

  const physics = new BotcraftPhysics(mcData)
  const playerCtx = EPhysicsCtx.FROM_BOT(physics, fakePlayer as Bot)
  const playerState = playerCtx.state as PlayerState
  playerState.control = ControlStateHandler.DEFAULT()

  return {
    mcData,
    fakePlayer,
    bot: fakePlayer as Bot,
    physics,
    playerCtx,
    playerState,
    stopPassivePhysics: () => {
      fakePlayer.emit('end')
      if (world instanceof FakeWorld) world.untrackBot()
    }
  }
}

export function createCacheWorld(version: string, floorY: number, position: Vec3, options: Omit<FakeWorldOptions, 'center'> = {}) {
  const world = createFlatWorld(version, floorY, { ...options, center: position })
  const rig = createPlayerRig(world, { version, position, groundLevel: floorY })
  const cacheWorld = new CacheSyncWorld(rig.bot, world as any)

  return {
    world,
    rig,
    cacheWorld
  }
}
