export interface ElytraPhysicsConstants {
  version: string
  gravity: number
  glideGravityMultiplier: number
  horizontalDrag: number
  verticalDrag: number
  fireworkLookScale: number
  fireworkVelocityScale: number
  fireworkBlend: number
  fireworkBaseDuration: number
  fireworkDurationPerLevel: number
  fireworkCooldown: number
  playerWidth: number
  playerHeight: number
  eyeHeight: number
  defaultFireworkFlightDuration: number
  contactEpsilon: number
}

const BASE: Omit<ElytraPhysicsConstants, 'version'> = Object.freeze({
  gravity: 0.08,
  glideGravityMultiplier: 1,
  horizontalDrag: 0.99,
  verticalDrag: 0.98,
  fireworkLookScale: 0.1,
  fireworkVelocityScale: 1.5,
  fireworkBlend: 0.5,
  fireworkBaseDuration: 10,
  fireworkDurationPerLevel: 10,
  fireworkCooldown: 10,
  playerWidth: 0.6,
  playerHeight: 0.6,
  eyeHeight: 0.4,
  defaultFireworkFlightDuration: 1,
  contactEpsilon: 1e-5
})

export const PHYSICS_CONSTANTS: Readonly<
  Record<string, ElytraPhysicsConstants>
> = Object.freeze({
  '1.21.4': Object.freeze({ ...BASE, version: '1.21.4' }),
  '1.21.11': Object.freeze({ ...BASE, version: '1.21.11' })
})

export const DEFAULT_PHYSICS_VERSION = '1.21.11'

export function getPhysicsConstants(
  version = DEFAULT_PHYSICS_VERSION
): ElytraPhysicsConstants {
  const exact = PHYSICS_CONSTANTS[version]
  if (exact != null) return exact
  if (/^1\.21\./.test(version)) return Object.freeze({ ...BASE, version })
  throw new RangeError(`Unsupported Minecraft physics version: ${version}`)
}

export function fireworkDuration(
  flightDuration: number,
  constants = getPhysicsConstants()
): number {
  if (!Number.isInteger(flightDuration) || flightDuration < 0)
    throw new RangeError(
      'Firework flight duration must be a non-negative integer'
    )
  return (
    constants.fireworkBaseDuration +
    flightDuration * constants.fireworkDurationPerLevel
  )
}
