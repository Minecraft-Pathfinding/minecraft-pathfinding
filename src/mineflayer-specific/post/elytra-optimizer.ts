import { Move } from '../move'
import { MovementOptimizer } from './optimizer'
import { createBlockCollisionResolver } from '../movements/elytra/block-collision'
import { simulateGlideTo } from '../movements/elytra/elytra-sim'
import { getPhysicsConstants } from '../movements/elytra/physics-constants'
import { findFirstUnsafeSample } from '../movements/elytra/terrain-safety'
import { BotcraftPhysics } from '@nxg-org/mineflayer-physics-util'
import type { PhysicsUtilElytraAdapter } from '../movements/elytra/physics-util-elytra'

export class ElytraOptimizer extends MovementOptimizer {
  private physicsUtilEngine: BotcraftPhysics | undefined

  private getPhysicsUtil(): PhysicsUtilElytraAdapter {
    this.physicsUtilEngine ??= new BotcraftPhysics(this.bot.registry)
    return {
      engine: this.physicsUtilEngine,
      bot: this.bot,
      world: this.world
    }
  }

  identEndOpt(currentIndex: number, path: Move[]): number {
    const start = path[currentIndex]
    if (
      start == null ||
      start.moveType.constructor.name !== 'ElytraMovementProvider'
    )
      return currentIndex
    const resolver = createBlockCollisionResolver(this.world)
    const constants = getPhysicsConstants()
    const physicsUtil = this.getPhysicsUtil()
    let best = currentIndex
    for (
      let candidate = currentIndex + 2;
      candidate < path.length;
      candidate++
    ) {
      if (
        path[candidate].moveType.constructor.name !== 'ElytraMovementProvider'
      )
        break
      const target = path[candidate].exitPos
      const result = simulateGlideTo(
        {
          pos: start.entryPos,
          vel: start.entryVel,
          fallFlying: true,
          validElytraEquipped: true,
          onGround: false
        },
        target,
        {
          maxTicks: Math.max(
            1,
            Math.ceil(start.entryPos.distanceTo(target) * 4)
          ),
          collisionResolver: resolver,
          physicsUtil,
          constants
        }
      )
      if (result.collided || !result.reachedIntended) break
      if (
        findFirstUnsafeSample(this.world, result.trajectory, constants) != null
      )
        break
      best = candidate
    }
    return best
  }
}
