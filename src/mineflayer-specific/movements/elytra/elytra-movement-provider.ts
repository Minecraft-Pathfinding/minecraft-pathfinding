import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import * as goals from '../../goals'
import { Move } from '../../move'
import { World } from '../../world/worldInterface'
import { MovementOptions } from '../movement'
import { MovementProvider } from '../movementProvider'
import { MovementExecutor } from '../movementExecutor'
import { ElytraExecutor } from './elytra-executor'
import { getPhysicsConstants } from './physics-constants'
import { simulateGlideTo } from './elytra-sim'
import { lookVector } from './glide-physics'
import { findFirstUnsafeSample } from './terrain-safety'
import { DEFAULT_FIREWORK_POLICY } from './firework-policy'
import { BotcraftPhysics } from '@nxg-org/mineflayer-physics-util'
import type { PhysicsUtilElytraAdapter } from './physics-util-elytra'

const debug = require('debug')
const log = debug('minecraft-pathfinding:elytraSearch')

const YAW_OFFSETS = [
  -180, -150, -120, -90, -60, -45, -30, 0, 30, 45, 60, 90, 120, 150, 180
].map((v) => (v * Math.PI) / 180)
const PITCH_BANDS = [-0.45, -0.3, -0.18, -0.08, 0, 0.1, 0.2, 0.3, 0.4]
const PROBE_TICKS = 12
const FULL_TICKS = 240
const PROBE_KEEP = 10
const MAX_RANGE = 128
const MIN_USEFUL_RANGE = 4
const PATH_FIREWORK_POLICY = Object.freeze({
  ...DEFAULT_FIREWORK_POLICY,
  speedThreshold: 0.58,
  verticalTrigger: 2.5,
  offCourseDistance: 16
})
const MAX_PLANNED_ROCKETS = 6

export function altitudeAwareMoveCost(
  ticksUsed: number,
  finalY: number,
  goalY: number
): number {
  const altitudeDeficit = Math.max(0, goalY - finalY)
  return ticksUsed + altitudeDeficit * 8
}

interface Candidate {
  yaw: number
  pitch: number
  endpoint: Vec3
  probeScore: number
}

export class ElytraMovementProvider extends MovementProvider {
  readonly movementDirs: Vec3[] = [new Vec3(0, 0, -1)]
  private physicsUtilEngine: BotcraftPhysics | undefined
  private readonly executorInstance: ElytraExecutor

  constructor(bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings)
    this.executorInstance = new ElytraExecutor(bot, world, settings)
  }

  getExecutor(): MovementExecutor {
    return this.executorInstance
  }

  private getPhysicsUtil(): PhysicsUtilElytraAdapter {
    this.physicsUtilEngine ??= new BotcraftPhysics(this.bot.registry)
    return { engine: this.physicsUtilEngine, bot: this.bot, world: this.world }
  }

  provideMovements(
    start: Move,
    storage: Move[],
    goal: goals.Goal,
    closed: Set<string>
  ): void {
    const entity = this.bot.entity as any
    const hasElytra = Object.values(entity.equipment ?? {}).some(
      (item: any) => item?.name?.includes('elytra') === true
    )
    const launchReady =
      entity.onGround === true &&
      hasElytra &&
      this.bot.heldItem?.name === 'firework_rocket'
    if (
      !launchReady &&
      entity.elytraFlying !== true &&
      entity.fallFlying !== true
    )
      return
    if (closed.has(start.hash)) return

    const target = this.goalPosition(goal, start.exitPos)
    const direction = target.minus(start.exitPos)
    const distance2D = Math.hypot(direction.x, direction.z)
    if (distance2D < 1e-9) return

    const constants = getPhysicsConstants(String(this.bot.version ?? '1.21.11'))
    const physicsUtil = this.getPhysicsUtil()
    const range = Math.min(
      MAX_RANGE,
      Math.max(24, target.distanceTo(start.exitPos))
    )
    const baseYaw = Math.atan2(-direction.x, -direction.z)
    const candidates: Candidate[] = []
    for (const yawOffset of YAW_OFFSETS) {
      for (const pitch of PITCH_BANDS) {
        const yaw = baseYaw + yawOffset
        const look = lookVector(yaw, pitch)
        const ray = this.world.raycast(
          start.exitPos,
          new Vec3(look.x, look.y, look.z),
          range
        )
        if (
          ray != null &&
          start.exitPos.distanceTo(ray.intersect) < MIN_USEFUL_RANGE
        )
          continue
        const rawDistance =
          ray == null
            ? range
            : Math.min(range, start.exitPos.distanceTo(ray.intersect) - 0.75)
        const distance = Math.max(MIN_USEFUL_RANGE, rawDistance)
        const endpoint = start.exitPos.plus(
          new Vec3(look.x, look.y, look.z).scaled(distance)
        )
        const probe = simulateGlideTo(
          {
            pos: start.exitPos,
            vel: start.exitVel,
            yaw,
            pitch,
            fallFlying: true,
            validElytraEquipped: true,
            onGround: false
          },
          endpoint,
          {
            maxTicks: PROBE_TICKS,
            fireworkPolicy: {
              ...PATH_FIREWORK_POLICY,
              intendedOrigin: start.exitPos
            },
            constants,
            physicsUtil,
            pitchMode: 'fast',
            maxYawStep: 0.18,
            maxPitchStep: 0.12
          }
        )
        if (probe.collided) continue
        const unsafe = findFirstUnsafeSample(
          this.world,
          probe.trajectory,
          constants
        )
        if (unsafe != null) continue
        const progress =
          start.exitPos.xzDistanceTo(target) -
          probe.finalState.pos.xzDistanceTo(target)
        const altitude = probe.finalState.pos.y - start.exitPos.y
        const probeScore =
          progress * 20 +
          altitude * 4 -
          Math.abs(yawOffset) * 0.06 -
          Math.max(0, target.y - probe.finalState.pos.y) * 8
        candidates.push({ yaw, pitch, endpoint, probeScore })
      }
    }

    candidates.sort((a, b) => b.probeScore - a.probeScore)
    const shortlisted = candidates.slice(0, PROBE_KEEP)
    const producedBefore = storage.length

    for (const candidate of shortlisted) {
      const result = simulateGlideTo(
        {
          pos: start.exitPos,
          vel: start.exitVel,
          yaw: candidate.yaw,
          pitch: candidate.pitch,
          fallFlying: true,
          validElytraEquipped: true,
          onGround: false
        },
        candidate.endpoint,
        {
          maxTicks: FULL_TICKS,
          constants,
          physicsUtil,
          pitchMode: 'fast',
          maxYawStep: 0.16,
          maxPitchStep: 0.11,
          fireworkPolicy: {
            speedThreshold: Number.POSITIVE_INFINITY,
            verticalTrigger: Number.POSITIVE_INFINITY,
            offCourseDistance: Number.POSITIVE_INFINITY,
            intendedOrigin: start.exitPos
          }
        }
      )
      if (result.collided || !result.reachedIntended) continue
      if (result.fireworksUsed > MAX_PLANNED_ROCKETS) continue
      if (
        findFirstUnsafeSample(this.world, result.trajectory, constants) != null
      )
        continue
      const hash = result.finalState.pos.floored().toString()
      if (closed.has(hash)) continue
      const move = Move.fromPreviousState(
        altitudeAwareMoveCost(
          result.ticksUsed,
          result.finalState.pos.y,
          target.y
        ) +
          result.fireworksUsed * 1.5,
        result.finalState as any,
        start,
        this
      )
      ;(move as any).executor = this.executorInstance
      storage.push(move)
    }
    if (target.distanceTo(start.exitPos) <= MAX_RANGE) {
      const direct = simulateGlideTo(
        {
          pos: start.exitPos,
          vel: start.exitVel,
          yaw: baseYaw,
          pitch: 0,
          fallFlying: true,
          validElytraEquipped: true,
          onGround: false
        },
        target,
        {
          maxTicks: FULL_TICKS,
          constants,
          physicsUtil,
          pitchMode: 'fast',
          maxYawStep: 0.16,
          maxPitchStep: 0.11,
          fireworkPolicy: {
            ...PATH_FIREWORK_POLICY,
            intendedOrigin: start.exitPos
          }
        }
      )
      if (
        !direct.collided &&
        direct.reachedIntended &&
        findFirstUnsafeSample(this.world, direct.trajectory, constants) == null
      ) {
        const hash = direct.finalState.pos.floored().toString()
        if (!closed.has(hash)) {
          const move = Move.fromPreviousState(
            altitudeAwareMoveCost(
              direct.ticksUsed,
              direct.finalState.pos.y,
              target.y
            ) +
              direct.fireworksUsed * 1.5,
            direct.finalState as any,
            start,
            this
          )
          ;(move as any).executor = this.executorInstance
          storage.push(move)
        }
      }
    }

    log(
      'provideMovements from=%o goal=%o candidates=%d selected=%d produced=%d',
      start.exitPos,
      target,
      candidates.length,
      shortlisted.length,
      storage.length - producedBefore
    )
  }

  private goalPosition(goal: goals.Goal, fallback: Vec3): Vec3 {
    const candidate = goal as unknown as { x?: number; y?: number; z?: number }
    return Number.isFinite(candidate.x) &&
      Number.isFinite(candidate.y) &&
      Number.isFinite(candidate.z)
      ? new Vec3(
          candidate.x as number,
          candidate.y as number,
          candidate.z as number
        )
      : fallback
  }
}
