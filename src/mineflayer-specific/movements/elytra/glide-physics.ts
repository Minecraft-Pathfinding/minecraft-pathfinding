import { Vec3 } from 'vec3'
import {
  fireworkDuration,
  getPhysicsConstants,
  ElytraPhysicsConstants
} from './physics-constants'
import {
  mcAdd,
  mcCos,
  mcDivide,
  mcFloat,
  mcMultiply,
  mcSin
} from './mc-float-math'
import {
  CollisionResolver,
  ElytraLook,
  ElytraState,
  ElytraStateInput,
  GlideTickResult
} from './types'
import {
  PhysicsUtilElytraAdapter,
  tickWithPhysicsUtil
} from './physics-util-elytra'

export function createElytraState(
  input: ElytraStateInput,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): ElytraState {
  return {
    pos: input.pos.clone(),
    vel: input.vel.clone(),
    yaw: mcFloat(input.yaw ?? 0),
    pitch: mcFloat(input.pitch ?? 0),
    onGround: input.onGround ?? false,
    lastOnGround: input.lastOnGround ?? input.onGround ?? false,
    fallFlying: input.fallFlying ?? true,
    validElytraEquipped: input.validElytraEquipped ?? true,
    fireworkRocketDuration: input.fireworkRocketDuration ?? 0,
    fireworkCooldown: input.fireworkCooldown ?? 0,
    levitation: input.levitation ?? 0,
    gravity: input.gravity ?? constants.gravity
  }
}

export function cloneElytraState(state: ElytraState): ElytraState {
  return { ...state, pos: state.pos.clone(), vel: state.vel.clone() }
}

export function lookVector(yaw: number, pitch: number): ElytraLook {
  const sinYaw = mcSin(yaw)
  const cosYaw = mcCos(yaw)
  const sinPitch = mcSin(pitch)
  const cosPitch = mcCos(pitch)
  return {
    x: mcFloat(-sinYaw * cosPitch),
    y: mcFloat(sinPitch),
    z: mcFloat(-cosYaw * cosPitch)
  }
}

export function applyFireworkBoost(
  state: ElytraState,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): void {
  if (!state.fallFlying || state.fireworkRocketDuration <= 0) return
  const look = lookVector(state.yaw, state.pitch)
  state.vel.x = mcAdd(
    state.vel.x,
    mcAdd(
      mcMultiply(look.x, constants.fireworkLookScale),
      mcMultiply(
        mcAdd(
          mcMultiply(look.x, constants.fireworkVelocityScale),
          -state.vel.x
        ),
        constants.fireworkBlend
      )
    )
  )
  state.vel.y = mcAdd(
    state.vel.y,
    mcAdd(
      mcMultiply(look.y, constants.fireworkLookScale),
      mcMultiply(
        mcAdd(
          mcMultiply(look.y, constants.fireworkVelocityScale),
          -state.vel.y
        ),
        constants.fireworkBlend
      )
    )
  )
  state.vel.z = mcAdd(
    state.vel.z,
    mcAdd(
      mcMultiply(look.z, constants.fireworkLookScale),
      mcMultiply(
        mcAdd(
          mcMultiply(look.z, constants.fireworkVelocityScale),
          -state.vel.z
        ),
        constants.fireworkBlend
      )
    )
  )
  state.fireworkRocketDuration--
}

export function applyGlideUpdate(
  state: ElytraState,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): void {
  if (
    !state.fallFlying ||
    state.onGround ||
    state.levitation !== 0 ||
    !state.validElytraEquipped
  ) {
    state.fallFlying = false
    return
  }

  const look = lookVector(state.yaw, state.pitch)
  const cosPitch = mcCos(state.pitch)
  const cosPitchSquared = mcMultiply(cosPitch, cosPitch)
  const horizontalSpeed = mcFloat(
    Math.sqrt(state.vel.x * state.vel.x + state.vel.z * state.vel.z)
  )
  state.vel.y = mcAdd(
    state.vel.y,
    mcMultiply(
      state.gravity * constants.glideGravityMultiplier,
      mcAdd(-1, mcMultiply(cosPitchSquared, 0.75))
    )
  )

  if (state.vel.y < 0 && cosPitch > 0) {
    const k = mcMultiply(state.vel.y, mcMultiply(-0.1, cosPitchSquared))
    state.vel.x = mcAdd(state.vel.x, mcDivide(mcMultiply(look.x, k), cosPitch))
    state.vel.y = mcAdd(state.vel.y, k)
    state.vel.z = mcAdd(state.vel.z, mcDivide(mcMultiply(look.z, k), cosPitch))
  }

  if (state.pitch > 0 && cosPitch > 0) {
    const k2 = mcMultiply(horizontalSpeed, mcMultiply(mcSin(state.pitch), 0.04))
    state.vel.x = mcAdd(
      state.vel.x,
      -mcDivide(mcMultiply(look.x, k2), cosPitch)
    )
    state.vel.y = mcAdd(state.vel.y, mcMultiply(k2, 3.2))
    state.vel.z = mcAdd(
      state.vel.z,
      -mcDivide(mcMultiply(look.z, k2), cosPitch)
    )
  }

  if (cosPitch > 0) {
    state.vel.x = mcAdd(
      state.vel.x,
      mcMultiply(
        mcAdd(
          mcDivide(mcMultiply(look.x, horizontalSpeed), cosPitch),
          -state.vel.x
        ),
        0.1
      )
    )
    state.vel.z = mcAdd(
      state.vel.z,
      mcMultiply(
        mcAdd(
          mcDivide(mcMultiply(look.z, horizontalSpeed), cosPitch),
          -state.vel.z
        ),
        0.1
      )
    )
  }

  state.vel.x = mcMultiply(state.vel.x, constants.horizontalDrag)
  state.vel.y = mcMultiply(state.vel.y, constants.verticalDrag)
  state.vel.z = mcMultiply(state.vel.z, constants.horizontalDrag)
}

export function tickElytra(
  input: ElytraState,
  collisionResolver?: CollisionResolver,
  constants: ElytraPhysicsConstants = getPhysicsConstants(),
  physicsUtil?: PhysicsUtilElytraAdapter
): GlideTickResult {
  if (physicsUtil != null) return tickWithPhysicsUtil(input, physicsUtil)
  const state = cloneElytraState(input)
  state.fallFlying =
    state.fallFlying &&
    state.validElytraEquipped &&
    !state.onGround &&
    state.levitation === 0
  applyFireworkBoost(state, constants)
  applyGlideUpdate(state, constants)

  const intendedPosition = new Vec3(
    mcAdd(state.pos.x, state.vel.x),
    mcAdd(state.pos.y, state.vel.y),
    mcAdd(state.pos.z, state.vel.z)
  )
  const collision = collisionResolver?.(state.pos, state.vel) ?? {
    position: intendedPosition,
    collidedHorizontally: false,
    collidedVertically: false
  }
  state.pos = collision.position.clone()
  if (collision.velocity != null) state.vel = collision.velocity.clone()
  state.lastOnGround = input.onGround
  state.onGround = collision.collidedVertically && input.vel.y <= 0
  if (state.onGround) state.fallFlying = false
  if (state.fireworkCooldown > 0) state.fireworkCooldown--
  return {
    state,
    collided: collision.collidedHorizontally || collision.collidedVertically,
    collidedHorizontally: collision.collidedHorizontally,
    collidedVertically: collision.collidedVertically
  }
}

export function activateFirework(
  state: ElytraState,
  flightDuration = getPhysicsConstants().defaultFireworkFlightDuration,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): void {
  if (state.fireworkCooldown > 0 || state.fireworkRocketDuration > 0) return
  state.fireworkRocketDuration = fireworkDuration(flightDuration, constants)
  state.fireworkCooldown = constants.fireworkCooldown
}
