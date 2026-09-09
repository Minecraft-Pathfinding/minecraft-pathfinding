import {
  BotcraftPhysics,
  ControlStateHandler,
  EPhysicsCtx,
  PlayerPoses
} from '@nxg-org/mineflayer-physics-util'
import { ElytraState, GlideTickResult } from './types'

export interface PhysicsUtilElytraAdapter {
  engine: BotcraftPhysics
  bot: any
  world: any
}

export function tickWithPhysicsUtil(
  input: ElytraState,
  adapter: PhysicsUtilElytraAdapter
): GlideTickResult {
  const context = EPhysicsCtx.FROM_BOT(adapter.engine, adapter.bot)
  const entity = context.state
  entity.pos.set(input.pos.x, input.pos.y, input.pos.z)
  entity.vel.set(input.vel.x, input.vel.y, input.vel.z)
  entity.yaw = input.yaw
  entity.pitch = input.pitch
  entity.lastOnGround = input.lastOnGround
  entity.onGround = input.onGround
  entity.fallFlying = input.fallFlying
  entity.validElytraEquipped = input.validElytraEquipped
  entity.fireworkRocketDuration = input.fireworkRocketDuration
  entity.pose = PlayerPoses.FALL_FLYING
  entity.control = ControlStateHandler.DEFAULT()
  entity.prevControl = ControlStateHandler.DEFAULT()

  context.state.control = ControlStateHandler.DEFAULT()
  context.useControls = false
  const next = adapter.engine.simulate(context, adapter.world)
  const state: ElytraState = {
    ...input,
    pos: next.pos.clone(),
    vel: next.vel.clone(),
    yaw: next.yaw,
    pitch: next.pitch,
    onGround: next.onGround,
    lastOnGround: input.onGround,
    fallFlying: next.fallFlying,
    validElytraEquipped: next.validElytraEquipped,
    fireworkRocketDuration: next.fireworkRocketDuration,
    fireworkCooldown: Math.max(0, input.fireworkCooldown - 1)
  }
  return {
    state,
    collided: next.isCollidedHorizontally || next.isCollidedVertically,
    collidedHorizontally: next.isCollidedHorizontally,
    collidedVertically: next.isCollidedVertically
  }
}
