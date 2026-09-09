import { Vec3 } from 'vec3'
export interface ElytraLook {
  x: number
  y: number
  z: number
}
export interface ElytraStateInput {
  pos: Vec3
  vel: Vec3
  yaw?: number
  pitch?: number
  onGround?: boolean
  lastOnGround?: boolean
  fallFlying?: boolean
  validElytraEquipped?: boolean
  fireworkRocketDuration?: number
  fireworkCooldown?: number
  levitation?: number
  gravity?: number
}
export interface ElytraState {
  pos: Vec3
  vel: Vec3
  yaw: number
  pitch: number
  onGround: boolean
  lastOnGround: boolean
  fallFlying: boolean
  validElytraEquipped: boolean
  fireworkRocketDuration: number
  fireworkCooldown: number
  levitation: number
  gravity: number
}
export interface CollisionResult {
  position: Vec3
  collidedHorizontally: boolean
  collidedVertically: boolean
  velocity?: Vec3
}
export type CollisionResolver = (
  position: Vec3,
  velocity: Vec3
) => CollisionResult
export interface GlideTickResult {
  state: ElytraState
  collided: boolean
  collidedHorizontally: boolean
  collidedVertically: boolean
}
export interface GlideSimulationResult {
  collided: boolean
  reachedIntended: boolean
  ticksUsed: number
  trajectory: Vec3[]
  fireworksUsed: number
  finalState: ElytraState
}
