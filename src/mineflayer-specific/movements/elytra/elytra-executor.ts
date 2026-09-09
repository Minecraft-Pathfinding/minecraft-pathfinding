import * as goals from '../../goals'
import { Move } from '../../move'
import { MovementOptions } from '../movement'
import { MovementExecutor } from '../movementExecutor'
import { CancelError } from '../../exceptions'
import { Vec3 } from 'vec3'
import { createElytraState } from './glide-physics'
import { getPhysicsConstants } from './physics-constants'
import {
  DEFAULT_FIREWORK_POLICY,
  shouldDeployFirework
} from './firework-policy'
import { solvePitchTowards } from './pitch-solver'
import { simulateGlideTo } from './elytra-sim'
import { findFirstUnsafeSample } from './terrain-safety'
import { selectFlightCarrot } from './route-guidance'
import {
  estimateFlightState,
  predictNextFlightState
} from './flight-state-estimator'
import {
  computeLandingControl,
  LANDING_ENGAGE_XZ,
  LANDING_FLARE_RANGE,
  LANDING_TOUCHDOWN_HORIZONTAL,
  LANDING_TOUCHDOWN_VERTICAL,
  LandingControlMode
} from './landing-control'
import { computeLandingMpc } from './landing-mpc'
import { LandingSearch, LandingColumn } from './landing-search'
import { planPhysicsAvoidance } from './avoidance-planner'
import { BotcraftPhysics } from '@nxg-org/mineflayer-physics-util'
import type { PhysicsUtilElytraAdapter } from './physics-util-elytra'

const debug = require('debug')
const log = debug('minecraft-pathfinding:elytraExecutor')

const LOOKAHEAD_TICKS = 18
const INTERMEDIATE_HOP_REACH_DISTANCE = 5
const LANDING_SEARCH_BUDGET = 256
const LANDING_SEARCH_MAX_NODES = 6000
const RECOVERY_TICKS = 18
const COLLISION_REPLAN_TICKS = 6
const CRUISE_MAX_YAW_STEP = 0.18
const CRUISE_MAX_PITCH_STEP = 0.11
const RECOVERY_MAX_YAW_STEP = 0.5
const RECOVERY_MAX_PITCH_STEP = 0.18
const LANDING_MAX_YAW_STEP = 0.18
const LANDING_MAX_PITCH_STEP = 0.12

function signedDegrees(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 ? 180 : wrapped
}

function activateRocket(bot: any): void {
  const entity = bot.entity
  bot.usingHeldItem = true
  bot._client.write('use_item', {
    hand: 0,
    sequence: bot._nextInteractionSequence(),
    rotation: {
      x: signedDegrees(180 - (entity.yaw * 180) / Math.PI),
      y: (-entity.pitch * 180) / Math.PI
    }
  })
}

function queueRocket(bot: any): void {
  bot.once('physicsTickBegin', () => activateRocket(bot))
}
const LANDING_STABLE_TICKS = 3
const LOOKAHEAD_INTERVAL_TICKS = 3
const LANDING_MPC_INTERVAL_TICKS = 1

export type ElytraFlightPhase =
  | 'launch'
  | 'cruise'
  | 'approach'
  | 'recover'
  | 'landed'

export class ElytraExecutor extends MovementExecutor {
  private fireworkCooldown = 0
  private physicsUtilEngine: BotcraftPhysics | undefined
  private origin: Vec3 | undefined
  private finalTarget: Vec3 | undefined
  private landingTarget: Vec3 | undefined
  private landingSupportY: number | undefined
  private isFinalHop = false
  private landingMode: LandingControlMode | undefined
  private previousPosition: Vec3 | undefined
  private predictedState: ReturnType<typeof predictNextFlightState> | undefined
  private phase: ElytraFlightPhase = 'launch'
  private routeWaypoints: Vec3[] = []
  private routeIndex = 0
  private landingStableTicks = 0
  private recoveryTicks = 0
  private recoveryPlan: ReturnType<typeof planPhysicsAvoidance> | undefined
  private lastLookaheadTick = -Infinity
  private lastLandingMpcTick = -Infinity
  private cachedLandingMpc: ReturnType<typeof computeLandingMpc> | undefined
  private lastCollisionTick = -Infinity

  constructor(bot: any, world: any, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings)
  }

  private getPhysicsUtil(): PhysicsUtilElytraAdapter {
    this.physicsUtilEngine ??= new BotcraftPhysics(this.bot.registry)
    return { engine: this.physicsUtilEngine, bot: this.bot, world: this.world }
  }

  private findSafeLandingColumn(target: Vec3): LandingColumn | null {
    const search = new LandingSearch(this.world, target, {
      budget: LANDING_SEARCH_BUDGET,
      maxNodes: LANDING_SEARCH_MAX_NODES,
      targetY: target.y,
      horizontalRadius: 14,
      requiredClearance: 4,
      airRadius: 2
    })
    let result: LandingColumn | null = null
    while (!search.done) result = search.step()
    return result
  }

  async performInit(
    thisMove: Move,
    currentIndex?: number,
    path: Move[] = []
  ): Promise<void> {
    const entity = this.bot.entity as any
    const constants = getPhysicsConstants(
      String(this.bot.version ?? this.bot.protocolVersion ?? '1.21.11')
    )
    if (!this.hasElytraEquipped())
      throw new CancelError('ElytraExecutor: no elytra equipped')

    this.fireworkCooldown = 0
    this.origin = (
      path[0]?.entryPos ??
      thisMove.entryPos ??
      entity.position
    )?.clone()
    this.finalTarget = (
      path[path.length - 1]?.exitPos ?? thisMove.exitPos
    )?.clone()
    this.previousPosition = entity.position.clone()
    this.predictedState = undefined
    this.landingMode = undefined
    this.landingTarget = undefined
    this.landingSupportY = undefined
    this.landingStableTicks = 0
    this.recoveryTicks = 0
    this.recoveryPlan = undefined
    this.lastLookaheadTick = -Infinity
    this.lastLandingMpcTick = -Infinity
    this.cachedLandingMpc = undefined
    this.lastCollisionTick = -Infinity
    this.phase =
      entity.elytraFlying === true || entity.fallFlying === true
        ? 'cruise'
        : 'launch'

    this.routeWaypoints = path
      .map((move) => move.exitPos)
      .filter((position): position is Vec3 => position != null)
      .map((position) => position.clone())
    if (this.routeWaypoints.length === 0)
      this.routeWaypoints = [thisMove.exitPos.clone()]
    this.routeIndex = 0
    this.isFinalHop =
      this.finalTarget != null &&
      thisMove.exitPos.distanceTo(this.finalTarget) < 0.5

    if (this.isFinalHop && this.finalTarget != null && this.world != null) {
      const column = this.findSafeLandingColumn(this.finalTarget)
      if (column == null)
        throw new CancelError(
          'ElytraExecutor: no safe landing site found near destination'
        )
      this.landingTarget = column.aim.clone()
      this.landingSupportY = column.supportY
      this.finalTarget = column.aim.clone()
      this.routeWaypoints[this.routeWaypoints.length - 1] = column.aim.clone()
      log(
        'landing site requested=%o aim=%o supportY=%o score=%o',
        thisMove.exitPos,
        this.landingTarget,
        column.supportY,
        column.score
      )
    }

    this.bot.clearControlStates()
    let rocketQueued = false
    if (entity.elytraFlying !== true && entity.fallFlying !== true) {
      const yaw = Math.atan2(
        -(thisMove.exitPos.x - entity.position.x),
        -(thisMove.exitPos.z - entity.position.z)
      )
      await this.bot.look(yaw, 0, false)
      const request = this.bot.elytraFly()
      request.catch(() => {})
      this.bot.setControlState('jump', true)
      if (this.bot.heldItem?.name === 'firework_rocket') {
        queueRocket(this.bot)
        rocketQueued = true
      }
      await this.bot.waitForTicks(2)
      this.bot.setControlState('jump', false)
      await request
      await this.bot.waitForTicks(1)
    }

    if (
      !rocketQueued &&
      this.bot.heldItem?.name === 'firework_rocket' &&
      (entity.elytraFlying === true || entity.fallFlying === true)
    ) {
      queueRocket(this.bot)
      this.fireworkCooldown = constants.fireworkCooldown
    }
  }

  async performPerTick(
    thisMove: Move,
    tickCount?: number,
    currentIndex?: number,
    _path: Move[] = []
  ): Promise<boolean> {
    const constants = getPhysicsConstants(
      String(this.bot.version ?? this.bot.protocolVersion ?? '1.21.11')
    )
    const entity = this.bot.entity as any
    if (this.fireworkCooldown > 0) this.fireworkCooldown--

    const state = createElytraState(
      {
        pos: entity.position,
        vel: entity.velocity,
        yaw: entity.yaw,
        pitch: entity.pitch,
        onGround: entity.onGround,
        fallFlying: entity.elytraFlying ?? entity.fallFlying ?? false,
        validElytraEquipped: true
      },
      constants
    )

    const estimate = estimateFlightState(
      {
        pos: state.pos,
        vel: state.vel,
        yaw: state.yaw,
        pitch: state.pitch,
        onGround: state.onGround,
        fallFlying: state.fallFlying
      },
      this.predictedState,
      undefined,
      constants
    )
    if (estimate.anomalous) this.predictedState = state

    const hopTarget = thisMove.exitPos
    const landingTarget = this.isFinalHop
      ? (this.landingTarget ?? hopTarget)
      : hopTarget
    const supportY = this.landingSupportY ?? landingTarget.y
    const landingDistance = state.pos.xzDistanceTo(landingTarget)
    const currentHorizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
    const inLandingZone =
      this.isFinalHop && landingDistance <= LANDING_ENGAGE_XZ
    const currentTick = Number.isFinite(tickCount) ? Number(tickCount) : 0

    const carrot = selectFlightCarrot(
      state.pos,
      state.vel,
      this.routeWaypoints,
      this.routeIndex
    )
    const cruiseTarget = carrot?.target ?? hopTarget
    if (carrot != null)
      this.routeIndex = Math.max(this.routeIndex, carrot.index)

    let desiredYaw = Math.atan2(
      -(cruiseTarget.x - state.pos.x),
      -(cruiseTarget.z - state.pos.z)
    )
    let desiredPitch = solvePitchTowards(state, cruiseTarget, 10, constants)
    let emergency = false

    const landingControl = inLandingZone
      ? computeLandingControl(
          state.pos,
          state.vel,
          landingTarget,
          state.yaw,
          this.landingMode,
          supportY
        )
      : undefined
    this.landingMode = landingControl?.mode

    if (landingControl != null) {
      desiredYaw = landingControl.yaw
      desiredPitch = landingControl.pitch
    }

    const useLandingMpc =
      inLandingZone &&
      landingControl != null &&
      (landingControl.mode === 'brake' || landingDistance <= 8)
    const shouldUpdateLandingMpc =
      useLandingMpc &&
      currentTick - this.lastLandingMpcTick >= LANDING_MPC_INTERVAL_TICKS
    if (shouldUpdateLandingMpc) {
      this.cachedLandingMpc = computeLandingMpc(state, landingTarget, {
        constants,
        supportY,
        padRadius: 0.18,
        horizonTicks: Math.min(
          42,
          Math.max(
            14,
            Math.ceil(
              landingDistance * 2 +
                Math.hypot(state.vel.x, state.vel.z) * 6 +
                12
            )
          )
        ),
        yawSamples: 9,
        pitchSamples: 5,
        physicsUtil: this.getPhysicsUtil()
      })
      this.lastLandingMpcTick = currentTick
    } else if (!useLandingMpc) {
      this.cachedLandingMpc = undefined
      this.lastLandingMpcTick = -Infinity
    }
    const mpc = useLandingMpc ? this.cachedLandingMpc : undefined
    if (
      mpc != null &&
      !mpc.predictedCollision &&
      landingControl != null &&
      (landingControl.mode === 'line' ||
        landingControl.mode === 'brake' ||
        landingControl.mode === 'flare' ||
        landingControl.mode === 'settle') &&
      (mpc.predictedTouchdown ||
        mpc.predictedError < landingDistance - 0.2 ||
        mpc.predictedSpeed < currentHorizontalSpeed - 0.05)
    ) {
      desiredYaw = mpc.yaw
      desiredPitch = mpc.pitch
    }
    if (
      inLandingZone &&
      landingControl != null &&
      mpc != null &&
      !mpc.predictedTouchdown &&
      state.pos.y - supportY <= 4.0 &&
      landingDistance > 2.5 &&
      landingControl.mode !== 'go-around'
    ) {
      landingControl.yaw =
        state.pos.y - supportY <= 2.0
          ? landingControl.yaw + Math.PI
          : landingControl.yaw
      landingControl.pitch = (22 * Math.PI) / 180
      landingControl.mode = 'go-around'
      this.landingMode = 'go-around'
      desiredYaw = landingControl.yaw
      desiredPitch = landingControl.pitch
    }

    const collided =
      entity.isCollidedHorizontally === true ||
      entity.isCollidedVertically === true
    const horizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
    const verticalSpeed = Math.abs(state.vel.y)

    if (collided) {
      this.lastCollisionTick = currentTick
      this.recoveryTicks = Math.max(this.recoveryTicks, RECOVERY_TICKS)
      this.recoveryPlan = undefined
      this.landingStableTicks = 0
      emergency = true
    }
    if (
      !collided &&
      !inLandingZone &&
      this.world != null &&
      this.recoveryTicks <= 0 &&
      currentTick - this.lastLookaheadTick >= LOOKAHEAD_INTERVAL_TICKS
    ) {
      this.lastLookaheadTick = currentTick
      const lookahead = simulateGlideTo(state, cruiseTarget, {
        maxTicks: LOOKAHEAD_TICKS,
        fireworkPolicy: {
          speedThreshold: Number.POSITIVE_INFINITY,
          verticalTrigger: Number.POSITIVE_INFINITY,
          offCourseDistance: Number.POSITIVE_INFINITY,
          intendedOrigin: state.pos
        },
        constants,
        physicsUtil: this.getPhysicsUtil(),
        pitchMode: 'fast',
        maxYawStep: CRUISE_MAX_YAW_STEP,
        maxPitchStep: CRUISE_MAX_PITCH_STEP
      })
      const unsafe = findFirstUnsafeSample(
        this.world,
        lookahead.trajectory,
        constants
      )
      if (lookahead.collided || unsafe != null) {
        const plan = planPhysicsAvoidance(
          state,
          cruiseTarget,
          this.getPhysicsUtil(),
          constants,
          18
        )
        this.recoveryPlan = plan
        desiredYaw = plan.yaw
        desiredPitch = plan.pitch
        this.recoveryTicks = Math.max(
          this.recoveryTicks,
          COLLISION_REPLAN_TICKS
        )
        emergency = true
        log(
          'predicted avoidance plan clearTicks=%o collided=%o yaw=%o pitch=%o',
          plan.clearTicks,
          plan.collided,
          plan.yaw,
          plan.pitch
        )
      }
    }

    if (this.recoveryTicks > 0 && !inLandingZone) {
      if (this.recoveryPlan == null) {
        this.recoveryPlan = planPhysicsAvoidance(
          state,
          landingTarget,
          this.getPhysicsUtil(),
          constants,
          20
        )
      }
      const plan = this.recoveryPlan
      desiredYaw = plan.yaw
      desiredPitch = Math.max(desiredPitch, plan.pitch)
      this.recoveryTicks--
      if (this.recoveryTicks === 0) this.recoveryPlan = undefined
      emergency = true
    }
    if (
      this.isFinalHop &&
      inLandingZone &&
      landingDistance <= 12 &&
      horizontalSpeed > 0.12 &&
      landingControl?.mode !== 'go-around'
    ) {
      desiredYaw = Math.atan2(state.vel.x, state.vel.z)
      desiredPitch = Math.max(desiredPitch, (18 * Math.PI) / 180)
      emergency = true
    }
    const allowRocket =
      !inLandingZone &&
      !emergency &&
      this.fireworkCooldown === 0 &&
      this.bot.heldItem?.name === 'firework_rocket'
    if (allowRocket) {
      const fireworkTarget = this.finalTarget ?? cruiseTarget
      const policy =
        this.origin != null
          ? { ...DEFAULT_FIREWORK_POLICY, intendedOrigin: this.origin }
          : DEFAULT_FIREWORK_POLICY
      if (shouldDeployFirework(state, fireworkTarget, policy, constants)) {
        queueRocket(this.bot)
        this.fireworkCooldown = constants.fireworkCooldown
      }
    }

    const yawStep = emergency
      ? RECOVERY_MAX_YAW_STEP
      : inLandingZone
        ? LANDING_MAX_YAW_STEP
        : CRUISE_MAX_YAW_STEP
    const pitchStep = emergency
      ? RECOVERY_MAX_PITCH_STEP
      : inLandingZone
        ? LANDING_MAX_PITCH_STEP
        : CRUISE_MAX_PITCH_STEP

    const commandYaw = stepAngle(entity.yaw, desiredYaw, yawStep)
    const commandPitch = stepValue(entity.pitch, desiredPitch, pitchStep)
    void this.bot.look(commandYaw, commandPitch, false)

    this.predictedState = predictNextFlightState(
      { ...state, yaw: commandYaw, pitch: commandPitch },
      undefined,
      this.getPhysicsUtil(),
      constants
    )
    if (this.isFinalHop) {
      const groundDistance = entity.position.xzDistanceTo(landingTarget)
      const groundHeightError = Math.abs(entity.position.y - supportY)
      if (entity.onGround === true && groundHeightError > 0.3) {
        this.landingStableTicks = 0
        log(
          'landed at wrong support height; target=%o supportY=%o pos=%o heightError=%o',
          landingTarget,
          supportY,
          entity.position,
          groundHeightError
        )
        throw new CancelError(
          'ElytraExecutor: touched ground at the wrong elevation'
        )
      }
      if (entity.onGround === true && groundDistance > 0.24) {
        this.landingStableTicks = 0
        log(
          'landed outside landing pad; replanning distance=%o target=%o pos=%o',
          groundDistance,
          landingTarget,
          entity.position
        )
        throw new CancelError(
          'ElytraExecutor: touched ground outside selected landing pad'
        )
      }
      const onLandingPad =
        entity.onGround === true &&
        groundDistance <= 0.18 &&
        Math.abs(entity.position.y - supportY) <= 0.18
      const stable =
        onLandingPad &&
        horizontalSpeed <= LANDING_TOUCHDOWN_HORIZONTAL &&
        verticalSpeed <= LANDING_TOUCHDOWN_VERTICAL
      this.landingStableTicks = stable ? this.landingStableTicks + 1 : 0
      if (this.landingStableTicks >= LANDING_STABLE_TICKS) {
        this.phase = 'landed'
        log(
          'stable touchdown pos=%o target=%o supportY=%o speed=%o',
          entity.position,
          landingTarget,
          supportY,
          Math.hypot(entity.velocity.x, entity.velocity.z)
        )
        return true
      }
    }

    const crossed =
      this.previousPosition != null &&
      distanceToSegment(hopTarget, this.previousPosition, state.pos) <= 1.25
    this.previousPosition = state.pos.clone()

    if (
      !this.isFinalHop &&
      !collided &&
      (crossed ||
        state.pos.distanceTo(hopTarget) <= INTERMEDIATE_HOP_REACH_DISTANCE)
    )
      return true

    if (
      entity.elytraFlying !== true &&
      entity.fallFlying !== true &&
      !entity.onGround
    ) {
      throw new CancelError('ElytraExecutor: flight ended before target')
    }

    if (
      horizontalSpeed < 0.03 &&
      state.pos.distanceTo(cruiseTarget) > 5 &&
      !emergency
    ) {
      throw new CancelError('ElytraExecutor: flight stalled before target')
    }

    return false
  }

  align(thisMove: Move): boolean {
    if (!this.bot.entity.onGround) return true
    return (
      this.hasElytraEquipped() && this.bot.heldItem?.name === 'firework_rocket'
    )
  }

  isAlreadyCompleted(thisMove: Move): boolean {
    return this.bot.entity.position.distanceTo(thisMove.exitPos) <= 1.25
  }

  provideMovements(): void {}

  private hasElytraEquipped(): boolean {
    const equipment = this.bot.entity.equipment as any
    return Object.values(equipment ?? {}).some(
      (item: any) => item?.name?.includes('elytra') === true
    )
  }
}

function signedAngle(angle: number): number {
  let result = angle % (Math.PI * 2)
  if (result > Math.PI) result -= Math.PI * 2
  if (result <= -Math.PI) result += Math.PI * 2
  return result
}

function stepAngle(from: number, to: number, maximumStep: number): number {
  const delta = signedAngle(to - from)
  return Math.abs(delta) <= maximumStep
    ? to
    : from + Math.sign(delta) * maximumStep
}

function stepValue(from: number, to: number, maximumStep: number): number {
  const delta = to - from
  return Math.abs(delta) <= maximumStep
    ? to
    : from + Math.sign(delta) * maximumStep
}

function distanceToSegment(point: Vec3, start: Vec3, end: Vec3): number {
  const segment = end.minus(start)
  const lengthSquared =
    segment.x * segment.x + segment.y * segment.y + segment.z * segment.z
  if (lengthSquared < 1e-9) return point.distanceTo(start)
  const offset = point.minus(start)
  const t = Math.max(
    0,
    Math.min(
      1,
      (offset.x * segment.x + offset.y * segment.y + offset.z * segment.z) /
        lengthSquared
    )
  )
  return point.distanceTo(start.plus(segment.scaled(t)))
}
