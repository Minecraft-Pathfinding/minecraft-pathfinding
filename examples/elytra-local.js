const fs = require('node:fs')
const { monitorEventLoopDelay } = require('node:perf_hooks')
process.env.DEBUG ??= 'minecraft-pathfinding:*'
process.env.DEBUG_COLORS ??= '0'
const { createBot } = require('mineflayer')
const { Vec3 } = require('vec3')
const {
  createElytraState,
  getPhysicsConstants,
  computeLandingControl,
  computeLandingMpc,
  LandingSearch,
  planPhysicsAvoidance,
  createBlockCollisionResolver,
  simulateGlideTo,
  findFirstUnsafeSample,
  tickElytra,
  DEFAULT_FIREWORK_POLICY,
  shouldDeployFirework,
  LANDING_ENGAGE_XZ
} = require('../dist/mineflayer-specific/movements/elytra')
const { BotcraftPhysics } = require('@nxg-org/mineflayer-physics-util')
const utilPlugin = require('@nxg-org/mineflayer-util-plugin').default
const { CacheSyncWorld } = require('../dist/mineflayer-specific/world/cacheWorld')
const debug = require('debug')

const HOST = process.env.MINECRAFT_HOST ?? 'localhost'
const PORT = Number(process.env.MINECRAFT_PORT ?? 25903)
const log = fs.createWriteStream(process.env.ELYTRA_LOG ?? 'elytra-local.log', { flags: 'a' })
debug.log = (...args) => {
  const line = args.map(String).join(' ')
  log.write(`[debug] ${line}\n`)
}

const bot = createBot({
  username: process.env.MINECRAFT_USERNAME ?? 'elytra-local',
  auth: process.env.MINECRAFT_AUTH ?? 'offline',
  host: HOST,
  port: PORT,
  version: process.env.MINECRAFT_VERSION ?? '1.21.11'
})
bot.loadPlugin(utilPlugin)

/*
const { RemoteIndicatorsPublisher } = require('../scripts/remoteIndicators.cjs')
const indicators = new RemoteIndicatorsPublisher({
  host: process.env.REMOTE_INDICATORS_HOST ?? '127.0.0.1',
  port: Number(process.env.REMOTE_INDICATORS_CONTROL_PORT ?? 24465),
  dimension: process.env.REMOTE_INDICATORS_DIMENSION ?? 'minecraft:overworld'
}).start()
*/
const indicators = {
  remove () {},
  clearRemote () {},
  setLine () {},
  setCuboid () {},
  close () {}
}

let pendingFlightRocket = false

function activateFlightRocket () {
  pendingFlightRocket = true
}

function signedDegrees (degrees) {
  const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180
  return wrapped === -180 ? 180 : wrapped
}

function sendFlightRocket () {
  const entity = bot.entity
  const yaw = typeof entity.yawDegrees !== 'undefined'
    ? Number(entity.yawDegrees)
    : signedDegrees(180 - entity.yaw * 180 / Math.PI)
  const pitch = typeof entity.pitchDegrees !== 'undefined'
    ? Number(entity.pitchDegrees)
    : -entity.pitch * 180 / Math.PI
  bot.usingHeldItem = true
  bot._client.write('use_item', {
    hand: 0,
    sequence: bot._nextInteractionSequence(),
    rotation: {
      x: yaw,
      y: pitch
    }
  })
}

const INDICATOR_COLORS = Object.freeze({
  target: 0xff33ff66,
  route: 0xffff9933,
  heading: 0xff3399ff,
  corridor: 0xffffcc33,
  preview: 0xff33ccff
})
const renderedIds = new Set()
const trailIds = new Set()
let pathEnabled = false

function clearRenderedPath () {
  for (const id of [...renderedIds]) {
    if (trailIds.has(id)) continue
    indicators.remove(id)
    renderedIds.delete(id)
  }
}

function clearAllRendered () {
  indicators.clearRemote()
  renderedIds.clear()
  trailIds.clear()
}

function appendFlightTrail (position) {
  if (!pathEnabled || flight?.trailLastPosition == null) return
  const from = flight.trailLastPosition
  const id = 30000 + flight.trailSegmentCount++
  trailIds.add(id)
  renderedIds.add(id)
  indicators.setLine(id, from, position, { color: INDICATOR_COLORS.route })
  flight.trailLastPosition = position.clone()
}

const LOOKAHEAD_TICKS = 20
const RECOVERY_TICKS = 12
const RECOVERY_ROCKET_MAX_HORIZONTAL_SPEED = 0.08
const CLEARANCE_ROCKET_MAX_HORIZONTAL_SPEED = 0.72
const PROFILE_ALL_TICKS = process.env.ELYTRA_PROFILE_ALL === '1'
const PROFILE_WARN_MS = Number(process.env.ELYTRA_PROFILE_WARN_MS ?? 35)
const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 })
eventLoopDelay.enable()
let world = null
let collisionResolver = null
let physicsUtilEngine = null
let ready = false
let flight = null
let lastFlightTelemetry = null
let launchInProgress = false
let flightTickInProgress = false
let lastPhysicsTickAt = performance.now()

function getPhysicsUtil () {
  if (world == null || bot.registry == null) return undefined
  physicsUtilEngine ??= new BotcraftPhysics(bot.registry)
  return { engine: physicsUtilEngine, bot, world }
}

function record (event, data = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), event, ...data })
  log.write(`${line}\n`)
}

function findLandingColumn (target) {
  const search = new LandingSearch(world, target, {
    budget: 512,
    maxNodes: 20000,
    horizontalRadius: 24,
    targetY: target.y,
    requiredClearance: 4,
    airRadius: 1
  })
  let result = null
  while (!search.done) result = search.step()
  return result
}

function describeBlock (position) {
  const block = world.getBlockInfo(position)
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    physical: block?.physical === true,
    height: block?.height,
    type: block?.type,
    unknown: block?.isUnknown === true,
    name: block?.block?.name
  }
}

async function equipFlightGear () {
  const chestSlot = bot.getEquipmentDestSlot('torso')
  if (bot.inventory.slots[chestSlot]?.name !== 'elytra') {
    const elytra = bot.inventory.items().find(item => item.name === 'elytra')
    if (elytra == null) throw new Error('no elytra found equipped or in inventory')
    await bot.equip(elytra, 'torso')
  }
  if (bot.heldItem?.name !== 'firework_rocket') {
    const rocket = bot.inventory.items().find(item => item.name === 'firework_rocket')
    if (rocket == null) throw new Error('no firework rockets held or in inventory')
    await bot.equip(rocket, 'hand')
  }
  const finalChest = bot.inventory.slots[chestSlot]
  if (finalChest?.name !== 'elytra') throw new Error('elytra equip did not reach the torso slot')
  if (bot.heldItem?.name !== 'firework_rocket') throw new Error('firework rockets equip did not reach the hand')
  record('flight-gear-ready', { elytra: finalChest.name, rockets: bot.heldItem.name })
}

async function launchElytra (target) {
  if (bot.entity.elytraFlying === true || bot.entity.fallFlying === true) return
  launchInProgress = true
  record('flight-launch', { position: bot.entity.position })
  try {
    const yaw = Math.atan2(-(target.x - bot.entity.position.x), -(target.z - bot.entity.position.z))
    await bot.look(yaw, 0, true)
    bot.setControlState('jump', true)
    await bot.waitForTicks(1)
    bot.setControlState('jump', false)
    await bot.waitForTicks(2)
    if (bot.entity.onGround === true || bot.entity.flying === true || bot.entity.vehicle != null) {
      throw new Error('not airborne for Elytra launch')
    }
    await bot.elytraFly()
    await bot.waitForTicks(1)
  } finally {
    launchInProgress = false
  }
}

async function beginFlight (username, args) {
  if (args.length !== 3 || args.some(value => !Number.isFinite(value))) {
    bot.whisper(username, 'Usage: !fly <x> <y> <z>')
    return
  }
  if (!ready) {
    bot.whisper(username, 'Flight setup is still in progress.')
    return
  }
  if (flight != null) {
    bot.whisper(username, 'Already flying to a destination.')
    return
  }

  clearAllRendered()
  bot.setControlState('sneak', false)

  try {
    await equipFlightGear()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    record('flight-gear-check-failed', { username, error: message })
    bot.whisper(username, `Cannot start flight: ${message}`)
    return
  }

  const requested = new Vec3(args[0], args[1], args[2])
  const column = findLandingColumn(requested)
  if (column == null) {
    bot.whisper(username, `No safe landing column found near ${requested.x} ${requested.y} ${requested.z}.`)
    record('landing-search-failed', { username, requested })
    return
  }

  flight = {
    requested,
    landingTarget: column.aim.clone(),
    supportY: column.supportY,
    landingMode: undefined,
    stableTicks: 0,
    recoveryTicks: 0,
    rocketCooldown: 0,
    recoveryFireworksUsed: 0,
    stalledTicks: 0,
    clearanceActive: false,
    clearanceTarget: undefined,
    landingClearanceActive: false,
    terminalBrakeTicks: 0,
    terminalTargetLockTicks: 0,
    tickCount: 0,
    landingMpc: undefined,
    landingMpcTick: -Infinity,
    lookaheadTick: -Infinity,
    lookaheadUnsafe: null,
    avoidancePlan: undefined,
    avoidancePlanTick: -Infinity,
    avoidanceYaw: undefined,
    lastAvoidanceLogAt: 0,
    trailLastPosition: bot.entity.position.clone(),
    trailSegmentCount: 0,
    origin: bot.entity.position.clone()
  }
  const landingColumnSamples = []
  const sampleX = Math.floor(flight.landingTarget.x)
  const sampleZ = Math.floor(flight.landingTarget.z)
  for (let y = Math.floor(flight.supportY) - 2; y <= Math.floor(flight.supportY) + 4; y++) {
    landingColumnSamples.push(describeBlock(new Vec3(sampleX, y, sampleZ)))
  }
  renderedIds.add(2)
  indicators.setCuboid(2, flight.landingTarget.minus(new Vec3(1.25, 1.25, 1.25)), flight.landingTarget.plus(new Vec3(1.25, 1.25, 1.25)), { color: INDICATOR_COLORS.target })

  record('flight-start', { username, requested, landing: flight.landingTarget, supportY: flight.supportY, landingColumnSamples })
  bot.chat(`flying: ${flight.landingTarget.x} ${flight.landingTarget.y} ${flight.landingTarget.z}`)

  try {
    await launchElytra(flight.landingTarget)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    record('flight-launch-failed', { username, error: message, position: bot.entity.position })
    bot.setControlState('sneak', false)
    flight = null
    clearRenderedPath()
    bot.whisper(username, `Flight launch failed: ${message}`)
    return
  }
  if (flight == null) {
    record('flight-launch-aborted', { username })
    return
  }
}

function tickFlight () {
  if (flightTickInProgress) return
  flightTickInProgress = true
  try {
    tickFlightOnce()
  } catch (error) {
    record('flight-tick-error', { error: error instanceof Error ? error.message : String(error) })
    bot.setControlState('sneak', false)
    flight = null
    clearRenderedPath()
  } finally {
    flightTickInProgress = false
  }
}

function tickFlightOnce () {
  if (flight == null || launchInProgress) return
  if (flight == null || launchInProgress) return
  const profileStart = performance.now()
  let profileMark = profileStart
  const profile = {}
  const markProfile = (name) => {
    const now = performance.now()
    profile[name] = now - profileMark
    profileMark = now
  }
  if (flight.rocketCooldown > 0) flight.rocketCooldown--

  const constants = getPhysicsConstants(String(bot.version ?? '1.21.11'))
  const state = createElytraState({
    pos: bot.entity.position,
    vel: bot.entity.velocity,
    yaw: bot.entity.yaw,
    pitch: bot.entity.pitch,
    onGround: bot.entity.onGround,
    fallFlying: bot.entity.elytraFlying ?? bot.entity.fallFlying ?? false,
    validElytraEquipped: true,
    fireworkRocketDuration: bot.fireworkRocketDuration ?? 0,
    fireworkCooldown: flight.rocketCooldown
  }, constants)
  if (state.fallFlying !== true && state.onGround !== true) {
    record('flight-elytra-stopped', { position: state.pos, velocity: state.vel, target: flight.landingTarget })
    bot.setControlState('sneak', false)
    flight = null
    clearRenderedPath()
    bot.chat('flight ended before touchdown. elytra stopped gliding ig.')
    return
  }

  const target = flight.landingTarget
  flight.tickCount++
  markProfile('setupMs')
  const distance = state.pos.xzDistanceTo(target)
  const inLandingZone = distance <= LANDING_ENGAGE_XZ
  const approachTarget = new Vec3(target.x, flight.supportY + 12, target.z)
  const finalApproach = distance <= 12
  const controlTarget = finalApproach ? target : approachTarget
  const controlSupportY = finalApproach ? flight.supportY : approachTarget.y
  const terminalLandingApproach = inLandingZone && finalApproach
  const terminalCollisionSafety = terminalLandingApproach && distance > 2.5
  let yaw = Math.atan2(-(target.x - state.pos.x), -(target.z - state.pos.z))
  let pitch = 0
  let emergency = false
  let unsafe = null

  const landingControl = inLandingZone
    ? computeLandingControl(state.pos, state.vel, controlTarget, state.yaw, flight.landingMode, controlSupportY)
    : undefined
  flight.landingMode = landingControl?.mode
  if (landingControl != null) {
    yaw = landingControl.yaw
    pitch = landingControl.pitch
  }

  const horizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
  if (terminalLandingApproach && horizontalSpeed > 0.12 && landingControl?.mode !== 'go-around') {
    if (distance <= 12) {
      yaw = distance <= 4
        ? Math.atan2(-(target.x - state.pos.x), -(target.z - state.pos.z))
        : (landingControl?.yaw ?? yaw)
    }
    pitch = landingControl?.pitch ?? pitch
    emergency = true
  }

  const useMpc = collisionResolver != null && inLandingZone && distance <= 160
  if (useMpc && flight.tickCount - flight.landingMpcTick >= 2) {
    flight.landingMpc = computeLandingMpc(state, controlTarget, {
      constants,
      supportY: controlSupportY,
      padRadius: 0.18,
      horizonTicks: Math.min(14, Math.max(8, Math.ceil(distance * 0.2 + Math.hypot(state.vel.x, state.vel.z) * 1.5 + 6))),
      yawSamples: 2,
      pitchSamples: 2,
      maxComputeMs: 12,
      collisionResolver
    })
    flight.landingMpcTick = flight.tickCount
  } else if (!useMpc) {
    flight.landingMpc = undefined
    flight.landingMpcTick = -Infinity
  }
  const mpc = useMpc ? flight.landingMpc : undefined
    markProfile('landingMpcMs')

  let controlSource = landingControl == null ? 'direct' : 'landing-control'
  let mpcActive = mpc != null && !mpc.predictedCollision && !(finalApproach && distance <= 2)
  if (mpcActive) {
    yaw = mpc.yaw
    pitch = mpc.pitch
    controlSource = 'landing-mpc'
  }

  const terminalBrake = finalApproach && distance <= 3 && horizontalSpeed > 0.16
  if (!mpcActive && terminalBrake) {
    yaw = horizontalVelocityYaw(state.vel, yaw) + Math.PI
    pitch = Math.max(0.35, landingControl?.pitch ?? 0)
    emergency = true
    controlSource = 'terminal-brake'
  }

  bot.setControlState('sneak', false)

  const collided = flight.tickCount > 6 &&
    (bot.entity.isCollidedHorizontally === true || bot.entity.isCollidedVertically === true)
  if (collided && (!terminalLandingApproach || terminalCollisionSafety)) {
    flight.recoveryTicks = Math.max(flight.recoveryTicks, RECOVERY_TICKS)
    flight.avoidancePlan = undefined
    flight.avoidancePlanTick = -Infinity
    flight.avoidanceYaw = undefined
    emergency = true
    controlSource = 'avoidance'
  }

  if (!collided && (!terminalLandingApproach || terminalCollisionSafety) && world != null && flight.recoveryTicks <= 0 &&
      distance <= 32 &&
      (flight.tickCount - flight.lookaheadTick >= 4 || flight.lookaheadTick === -Infinity)) {
    const lookahead = simulateGlideTo(state, target, {
      maxTicks: 4,
      constants,
      collisionResolver
    })
    unsafe = findFirstUnsafeSample(world, lookahead.trajectory.slice(1), constants)
    flight.lookaheadTick = flight.tickCount
    flight.lookaheadUnsafe = unsafe
    if (lookahead.collided || unsafe != null) {
      record('flight-unsafe-ahead', { position: state.pos, velocity: state.vel, unsafePosition: unsafe?.position, reason: unsafe?.reason, lookaheadEnd: lookahead.finalState.pos })
      flight.recoveryTicks = Math.max(flight.recoveryTicks, RECOVERY_TICKS)
      flight.landingClearanceActive = unsafe != null &&
        unsafe.position.xzDistanceTo(target) <= 6 &&
        state.pos.xzDistanceTo(target) <= 24 &&
        state.pos.y < flight.supportY + 2
      if (unsafe != null && flight.clearanceTarget == null) {
        flight.clearanceTarget = flight.landingClearanceActive
          ? makeLandingClearanceTarget(unsafe, target, flight.supportY, state.pos)
          : makeClearanceTarget(unsafe, flight.supportY)
      }
      flight.clearanceActive = flight.clearanceTarget != null
      emergency = true
    }
  } else if (flight.lookaheadUnsafe != null) {
    unsafe = flight.lookaheadUnsafe
  }
  markProfile('lookaheadMs')

  if (terminalLandingApproach && (!flight.clearanceActive || distance <= 4)) {
    flight.recoveryTicks = 0
    flight.clearanceActive = false
    flight.clearanceTarget = undefined
    flight.landingClearanceActive = false
    flight.avoidanceYaw = undefined
    flight.terminalBrakeTicks = 0
    flight.terminalTargetLockTicks = 0
    emergency = false
  }

  if (finalApproach && state.pos.y < flight.supportY + 6 && state.vel.y < -0.05 && distance > 2) {
    const enteringAltitudeRecovery = !flight.clearanceActive
    mpcActive = false
    emergency = true
    controlSource = 'altitude-recovery'
    flight.recoveryTicks = Math.max(flight.recoveryTicks, RECOVERY_TICKS)
    flight.clearanceActive = true
    flight.clearanceTarget = new Vec3(target.x, flight.supportY + 8, target.z)
    if (enteringAltitudeRecovery && state.pos.y < flight.supportY - 1 && flight.rocketCooldown === 0 && bot.heldItem?.name === 'firework_rocket') {
      activateFlightRocket()
      flight.rocketCooldown = constants.fireworkCooldown
      flight.recoveryFireworksUsed++
      record('flight-recovery-firework', { position: state.pos, velocity: state.vel, target, reason: 'below-landing-plane' })
    }
  }

  markProfile('avoidanceMs')
  if (flight.recoveryTicks > 0 || flight.clearanceActive) {
    const recoveryTarget = flight.clearanceTarget ?? target
    if (flight.avoidancePlan == null || flight.tickCount - flight.avoidancePlanTick >= 3) {
      flight.avoidancePlan = planPhysicsAvoidance(state, recoveryTarget, getPhysicsUtil(), constants, 20, collisionResolver, flight.avoidanceYaw)
      flight.avoidancePlanTick = flight.tickCount
    }
    const plan = flight.avoidancePlan
    flight.avoidanceYaw = plan.yaw
    yaw = plan.yaw
    pitch = plan.pitch
    controlSource = 'avoidance'
    if (flight.clearanceActive && flight.clearanceTarget != null) {
      yaw = Math.atan2(
        -(flight.clearanceTarget.x - state.pos.x),
        -(flight.clearanceTarget.z - state.pos.z)
      )
      pitch = plan.pitch
    }
    const horizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
    if (flight.recoveryTicks > 0) flight.recoveryTicks--
    flight.stalledTicks = horizontalSpeed < 0.03 && distance > 5
      ? flight.stalledTicks + 1
      : 0
    const reachedClearanceTarget = flight.clearanceActive && flight.clearanceTarget != null &&
      state.pos.y >= flight.clearanceTarget.y - 1 &&
      state.vel.y >= -0.25 &&
      (state.pos.xzDistanceTo(flight.clearanceTarget) <= 3 ||
        (state.pos.y >= flight.clearanceTarget.y + 4 && distance <= 16 && horizontalSpeed <= 0.35))
    if (flight.clearanceActive && !reachedClearanceTarget) flight.recoveryTicks = Math.max(flight.recoveryTicks, 1)
    emergency = true
    const clearanceHandoffReady = reachedClearanceTarget &&
      plan.clearTicks >= 20 && plan.collided === false &&
      plan.predictedAltitudeChange >= -0.25
    if (clearanceHandoffReady) {
      flight.recoveryTicks = 0
      flight.clearanceActive = false
      flight.clearanceTarget = undefined
      flight.landingClearanceActive = false
      flight.avoidanceYaw = undefined
      yaw = mpcActive ? mpc.yaw : (landingControl?.yaw ?? Math.atan2(-(target.x - state.pos.x), -(target.z - state.pos.z)))
      pitch = mpcActive ? mpc.pitch : (landingControl?.pitch ?? 0)
      controlSource = mpcActive ? 'landing-mpc' : 'landing-control'
      emergency = false
    }
    const landingHandoffReady = inLandingZone && distance <= 2.0 &&
      !flight.clearanceActive &&
      state.pos.y >= flight.supportY + 0.6 && state.pos.y <= flight.supportY + 2.5 &&
      horizontalSpeed <= 0.32 && state.vel.y >= -0.28
    if (landingHandoffReady) {
      flight.recoveryTicks = 0
      flight.clearanceActive = false
      flight.clearanceTarget = undefined
      flight.landingClearanceActive = false
      flight.avoidanceYaw = undefined
      yaw = mpc?.yaw ?? landingControl?.yaw ?? yaw
      pitch = mpc?.pitch ?? landingControl?.pitch ?? pitch
      controlSource = mpcActive ? 'landing-mpc' : 'landing-control'
      emergency = false
    }
    if (flight.stalledTicks >= 6 && distance > 5) {
      if (flight.rocketCooldown === 0 && bot.heldItem?.name === 'firework_rocket') {
        activateFlightRocket()
        flight.rocketCooldown = constants.fireworkCooldown
        flight.recoveryFireworksUsed++
        flight.stalledTicks = 0
        record('flight-recovery-firework', { position: state.pos, velocity: state.vel, target, reason: 'stalled' })
      } else {
        record('flight-no-safe-route', { position: state.pos, velocity: state.vel, target, reason: 'stalled' })
        bot.setControlState('sneak', false)
        flight = null
        clearRenderedPath()
        bot.chat('flight aborted. horizontal flight velocity was lost before touchdown.')
        return
      }
    }
    const now = Date.now()
    if (now - flight.lastAvoidanceLogAt >= 1000) {
      flight.lastAvoidanceLogAt = now
      record('flight-avoidance-plan', {
        position: state.pos,
        velocity: state.vel,
        target,
        clearTicks: plan.clearTicks,
        collided: plan.collided,
        yaw: plan.yaw,
        pitch: plan.pitch,
        score: plan.score,
        predictedDistance: plan.predictedDistance,
        predictedAltitudeChange: plan.predictedAltitudeChange,
        unsafePosition: unsafe?.position
      })
    }
    const lowSpeedLandingApproach = distance <= 8 &&
      horizontalSpeed <= 0.45 &&
      state.pos.y <= flight.supportY + 6
    if (plan.collided && plan.clearTicks === 0 && (!inLandingZone || distance > 3) && !lowSpeedLandingApproach) {
      const recoverySpeed = Math.hypot(state.vel.x, state.vel.z)
      const canUseLastChanceRocket = flight.clearanceActive &&
        state.pos.y < flight.supportY + 4 &&
        distance > 3 &&
        recoverySpeed <= CLEARANCE_ROCKET_MAX_HORIZONTAL_SPEED &&
        state.vel.y < -0.05 &&
        flight.rocketCooldown === 0 &&
        bot.heldItem?.name === 'firework_rocket'
      if (canUseLastChanceRocket) {
        activateFlightRocket()
        flight.rocketCooldown = constants.fireworkCooldown
        flight.recoveryFireworksUsed++
        flight.recoveryTicks = Math.max(flight.recoveryTicks, RECOVERY_TICKS)
        record('flight-recovery-firework', { position: state.pos, velocity: state.vel, target, reason: 'no-safe-route' })
        return
      }
      record('flight-no-safe-route', { position: state.pos, velocity: state.vel, target })
      bot.setControlState('sneak', false)
      flight = null
      clearRenderedPath()
      bot.chat('flight aborted. no route.')
      return
    }
  }

  const alignmentGate = !mpcActive && !flight.clearanceActive &&
    state.pos.y <= flight.supportY + 8 &&
    distance > 0.7
  if (alignmentGate) {
    yaw = Math.atan2(-(target.x - state.pos.x), -(target.z - state.pos.z))
    pitch = 45 * Math.PI / 180
    emergency = true
    flight.terminalTargetLockTicks = 0
  }

  if (emergency && state.pos.y < flight.supportY + 4 &&
      distance > 3 &&
      Math.hypot(state.vel.x, state.vel.z) <= (flight.clearanceActive ? CLEARANCE_ROCKET_MAX_HORIZONTAL_SPEED : RECOVERY_ROCKET_MAX_HORIZONTAL_SPEED) &&
      state.vel.y < -0.05 &&
      (distance > 8 || Math.hypot(state.vel.x, state.vel.z) > 0.45) &&
      (flight.landingClearanceActive ||
        Math.cos(signedAngle(state.yaw - Math.atan2(-(target.x - state.pos.x), -(target.z - state.pos.z)))) >= 0.35) &&
      flight.rocketCooldown === 0 && bot.heldItem?.name === 'firework_rocket') {
    activateFlightRocket()
    flight.rocketCooldown = constants.fireworkCooldown
    flight.recoveryFireworksUsed++
    record('flight-recovery-firework', { position: state.pos, velocity: state.vel, target })
  }

  const terminalHorizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
  const verticalGapToSupport = state.pos.y - flight.supportY
  if (!bot.entity.onGround && verticalGapToSupport < -0.5) {
    record('flight-no-safe-route', { position: state.pos, velocity: state.vel, target, reason: 'below-support-plane' })
    bot.setControlState('sneak', false)
    flight = null
    clearRenderedPath()
    bot.chat('flight aborted. crossed below the landing support plane.')
    return
  }
  const brakeEntry = inLandingZone && distance <= 2.25 &&
    state.pos.y > flight.supportY + 0.5 && terminalHorizontalSpeed > 0.16
  if (brakeEntry) flight.terminalBrakeTicks = Math.max(flight.terminalBrakeTicks, 12)
  const terminalLandingBrake = flight.terminalBrakeTicks > 0 && terminalHorizontalSpeed > 0.28 && distance > 4
  if (terminalLandingBrake && !mpcActive) {
    yaw = horizontalVelocityYaw(state.vel, yaw) + Math.PI
    pitch = state.pos.y > flight.supportY + 4 ? -0.20 : 0
    emergency = true
    flight.terminalBrakeTicks--
  } else if (flight.terminalBrakeTicks > 0 && (terminalHorizontalSpeed <= 0.28 || mpcActive)) {
    flight.terminalBrakeTicks = 0
    if (!mpcActive) flight.terminalTargetLockTicks = 10
  }
  const terminalTargetLock = flight.terminalTargetLockTicks > 0 &&
    state.pos.y > flight.supportY + 0.5 && terminalHorizontalSpeed <= 0.35
  if (terminalTargetLock && !mpcActive) {
    yaw = Math.atan2(-(target.x - state.pos.x), -(target.z - state.pos.z))
    pitch = state.pos.y > flight.supportY + 4 ? -0.20 : (landingControl?.pitch ?? 0)
    emergency = false
    flight.terminalTargetLockTicks--
  }

  if (!mpcActive && inLandingZone && !flight.clearanceActive && state.pos.y <= flight.supportY + 20 && distance > 0.45 &&
      landingControl?.mode !== 'go-around') {
    yaw = distance <= 4
      ? Math.atan2(-(target.x - state.pos.x), -(target.z - state.pos.z))
      : (landingControl?.yaw ?? yaw)
    pitch = landingControl?.pitch ?? pitch
    if (distance <= 4 && horizontalSpeed > 0.18) pitch = Math.max(pitch, 22 * Math.PI / 180)
    if (state.pos.y < flight.supportY + 1 && distance > 0.45) pitch = Math.max(pitch, 22 * Math.PI / 180)
    emergency = true
    flight.terminalTargetLockTicks = 0
  }

  if (!inLandingZone && !emergency && flight.rocketCooldown === 0 && bot.heldItem?.name === 'firework_rocket') {
    const policy = { ...DEFAULT_FIREWORK_POLICY, intendedOrigin: flight.origin }
    if (shouldDeployFirework(state, target, policy, constants)) {
      activateFlightRocket()
      flight.rocketCooldown = constants.fireworkCooldown
      record('flight-firework', { position: state.pos, velocity: state.vel, target, reason: 'cruise' })
    }
  }

  const verticalDistanceToSupport = Math.abs(verticalGapToSupport)
  if (!bot.entity.onGround && verticalGapToSupport >= 0 && verticalDistanceToSupport <= 3 && terminalHorizontalSpeed > 0.03) {
    yaw = horizontalVelocityYaw(state.vel, yaw) + Math.PI
    pitch = Math.max(pitch, 0.35)
    emergency = true
    controlSource = 'vertical-terminal-brake'
  }

  const nearTarget = distance <= 4
  if (nearTarget) {
    bot.clearControlStates()
    const targetBlockCenter = new Vec3(
      Math.floor(target.x) + 0.5,
      flight.supportY - 0.5,
      Math.floor(target.z) + 0.5
    )
    const centerDx = targetBlockCenter.x - state.pos.x
    const centerDy = targetBlockCenter.y - state.pos.y
    const centerDz = targetBlockCenter.z - state.pos.z
    const centerHorizontalDistance = Math.hypot(centerDx, centerDz)

    if (!bot.entity.onGround && terminalHorizontalSpeed > 0.06) {
      yaw = horizontalVelocityYaw(state.vel, yaw) + Math.PI
      pitch = Math.max(pitch, 0.55)
      emergency = true
      controlSource = 'near-target-brake'
    } else {
      yaw = Math.atan2(-centerDx, -centerDz)
      pitch = Math.atan2(centerDy, Math.max(centerHorizontalDistance, 1e-6))
      emergency = false
      controlSource = 'target-block-center'
    }
  }

  const yawMax = nearTarget ? 0.8 : terminalLandingBrake || terminalTargetLock || distance <= 4 ? 0.45 : distance <= 6 ? 0.12 : emergency ? 0.55 : inLandingZone ? 0.24 : 0.18
  const pitchMax = emergency ? 0.20 : 0.12
  const commandedYaw = signedAngle(slewAngle(state.yaw, yaw, yawMax))
  const commandedPitch = slewValue(state.pitch, pitch, pitchMax)
  void bot.look(commandedYaw, commandedPitch, false)
  markProfile('lookMs')
  if (flight == null) return

  appendFlightTrail(state.pos)

  const totalMs = performance.now() - profileStart
  if (totalMs >= 25) {
    record('flight-controller-overrun', {
      tick: flight.tickCount,
      durationMs: totalMs,
      profile,
      position: state.pos,
      velocity: state.vel,
      distance,
      eventLoopDelayMs: {
        mean: eventLoopDelay.mean / 1e6,
        p99: eventLoopDelay.percentile(99) / 1e6,
        max: eventLoopDelay.max / 1e6
      }
    })
    eventLoopDelay.reset()
  }
  if (PROFILE_ALL_TICKS || totalMs >= PROFILE_WARN_MS || Object.values(profile).some(value => value >= PROFILE_WARN_MS)) {
    record('flight-tick-profile', {
      tickMs: totalMs,
      profile,
      distance,
      inLandingZone,
      terminalLandingApproach,
      recoveryTicks: flight.recoveryTicks,
      clearanceActive: flight.clearanceActive,
      mpc: mpc != null,
      mpcActive,
      unsafe: unsafe != null
    })
  }

  record('flight-tick', {
    position: state.pos,
    velocity: state.vel,
    actualPosition: bot.entity.position,
    actualVelocity: bot.entity.velocity,
    target,
    controlTarget,
    controlSupportY,
    finalApproach,
    distance,
    mode: flight.landingMode,
    desiredYaw: yaw,
    desiredPitch: pitch,
    sourceYaw: state.yaw,
    yawMax,
    commandedYaw,
    commandedPitch,
    actualYaw: bot.entity.yaw,
    actualPitch: bot.entity.pitch,
    controlSource,
    mpc: mpc == null ? null : {
      yaw: mpc.yaw,
      pitch: mpc.pitch,
      predictedError: mpc.predictedError,
      predictedSpeed: mpc.predictedSpeed,
      predictedVerticalSpeed: mpc.predictedVerticalSpeed,
      predictedTouchdown: mpc.predictedTouchdown,
      predictedCollision: mpc.predictedCollision,
      predictedTicks: mpc.predictedTicks
    },
    emergency,
    recoveryTicks: flight.recoveryTicks,
    rocketCooldown: flight.rocketCooldown,
    fireworkRocketDuration: state.fireworkRocketDuration,
    fireworkCooldown: state.fireworkCooldown,
    collidedHorizontally: bot.entity.isCollidedHorizontally === true,
    collidedVertically: bot.entity.isCollidedVertically === true,
    onGround: bot.entity.onGround === true,
    unsafePosition: unsafe?.position
  })

  lastFlightTelemetry = {
    position: bot.entity.position,
    velocity: bot.entity.velocity,
    target,
    distance,
    mode: flight.landingMode,
    recoveryTicks: flight.recoveryTicks,
    clearanceActive: flight.clearanceActive
  }

  if (flight.tickCount % 4 === 0) {
    renderedIds.add(1)
    renderedIds.add(3)
    indicators.setLine(1, state.pos, target, { color: INDICATOR_COLORS.route })
    indicators.setLine(3, state.pos, state.pos.plus(state.vel.scaled(12)), { color: INDICATOR_COLORS.heading })
  }

  if (inLandingZone && bot.entity.onGround === true) {
    const groundDistance = bot.entity.position.xzDistanceTo(target)
    const groundHeightError = Math.abs(bot.entity.position.y - flight.supportY)
    if (groundHeightError > 0.3) {
      const supportY = flight.supportY
      record('flight-wrong-level-touchdown', {
        position: bot.entity.position,
        target,
        supportY,
        heightError: groundHeightError
      })
      bot.setControlState('sneak', false)
      flight = null
      clearRenderedPath()
      bot.chat(`flight aborted. touched ground at the wrong elevation (expected ${supportY}).`)
      return
    }
    const horizontalSpeed = Math.hypot(bot.entity.velocity.x, bot.entity.velocity.z)
    const verticalSpeed = Math.abs(bot.entity.velocity.y)
    if (groundDistance > 0.24) {
      record('flight-off-target-touchdown', { position: bot.entity.position, target, distance: groundDistance })
      bot.setControlState('sneak', false)
      flight = null
      clearRenderedPath()
      bot.chat(`flight off target. touched ground outside the landing pad (distance=${groundDistance.toFixed(2)}).`)
      return
    }
    const stable = groundDistance <= 0.18 &&
      Math.abs(bot.entity.position.y - flight.supportY) <= 0.18 &&
      horizontalSpeed <= 0.14 && verticalSpeed <= 0.16
    flight.stableTicks = stable ? flight.stableTicks + 1 : 0
    if (flight.stableTicks >= 3) {
      bot.setControlState('sneak', false)
      record('flight-landed', { position: bot.entity.position, target })
      bot.chat('flight landed.')
      flight = null
      clearRenderedPath()
    }
  }
}

async function renderFlightPath (username, args) {
  if (args.length !== 3 || args.some(value => !Number.isFinite(value))) {
    bot.whisper(username, '!render <x> <y> <z>')
    return
  }
  if (!ready) {
    bot.whisper(username, 'flight setup is still in progress.')
    bot.chat('flight setup in progress.')
    return
  }

  const target = new Vec3(args[0], args[1], args[2])
  clearRenderedPath()
  const constants = getPhysicsConstants()
  const state = createElytraState({
    pos: bot.entity.position,
    vel: bot.entity.velocity,
    yaw: bot.entity.yaw,
    pitch: bot.entity.pitch,
    onGround: false,
    fallFlying: true,
    validElytraEquipped: true
  }, constants)

  const points = [state.pos.clone()]
  let landingMode
  for (let tick = 0; tick < 300; tick++) {
    const distance = state.pos.xzDistanceTo(target)
    const inLandingZone = distance <= LANDING_ENGAGE_XZ
    const landingControl = inLandingZone
      ? computeLandingControl(state.pos, state.vel, target, state.yaw, landingMode)
      : undefined
    landingMode = landingControl?.mode

    const mpc = inLandingZone && landingControl != null
      ? computeLandingMpc(state, target, { constants, horizonTicks: 18, yawSamples: 2, pitchSamples: 2, collisionResolver })
      : undefined

    state.yaw = mpc?.yaw ?? landingControl?.yaw ?? Math.atan2(-(target.x - state.pos.x), -(target.z - state.pos.z))
    state.pitch = mpc?.pitch ?? landingControl?.pitch ?? Math.max(-0.5, Math.min(0.3, Math.atan2(target.y - state.pos.y, Math.max(distance, 1))))

    const result = tickElytra(state, collisionResolver, constants)
    Object.assign(state, result.state)
    points.push(state.pos.clone())

    if (result.collided) break
    if (landingMode === 'settle' && Math.hypot(state.vel.x, state.vel.z) <= 0.05) break
    if (state.pos.distanceTo(target) <= 0.5) break
  }

  for (let index = 1; index < points.length; index++) {
    const id = 10000 + index
    renderedIds.add(id)
    indicators.setLine(id, points[index - 1], points[index], { color: INDICATOR_COLORS.preview })
  }
  renderedIds.add(20000)
  indicators.setCuboid(20000, target.minus(new Vec3(1.25, 1.25, 1.25)), target.plus(new Vec3(1.25, 1.25, 1.25)), { color: INDICATOR_COLORS.target })

  bot.whisper(username, `Rendered ${points.length - 1} predicted flight ticks.`)
  record('render-finished', { username, target, ticks: points.length - 1, predictedEnd: state.pos })
}

function signedAngle (angle) {
  let result = angle % (Math.PI * 2)
  if (result > Math.PI) result -= Math.PI * 2
  if (result <= -Math.PI) result += Math.PI * 2
  return result
}

function makeClearanceTarget (unsafe, supportY) {
  return new Vec3(
    unsafe.position.x,
    Math.max(supportY + 5, unsafe.position.y + 4),
    unsafe.position.z
  )
}

function makeLandingClearanceTarget (unsafe, target, supportY, currentPosition) {
  const dx = currentPosition.x - unsafe.position.x
  const dz = currentPosition.z - unsafe.position.z
  const length = Math.hypot(dx, dz) || 1
  return new Vec3(
    unsafe.position.x + dx / length * 6,
    Math.max(supportY + 6, unsafe.position.y + 5),
    unsafe.position.z + dz / length * 6
  )
}

function horizontalVelocityYaw (velocity, fallback) {
  const speed = Math.hypot(velocity.x, velocity.z)
  return speed > 1e-4 ? Math.atan2(-velocity.x, -velocity.z) : fallback
}

function slewAngle (from, to, maxStep) {
  const delta = signedAngle(to - from)
  return Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep
}

function slewValue (from, to, maxStep) {
  const delta = to - from
  return Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep
}

function handleCommand (username, message) {
  const trimmed = message.trim()
  if (/^!path(?:\s|$)/i.test(trimmed)) {
    const value = trimmed.split(/\s+/)[1]?.toLowerCase()
    if (value !== 'true' && value !== 'false') {
      bot.whisper(username, 'Usage: !path true|false')
      return
    }
    pathEnabled = value === 'true'
    record('path-setting', { username, enabled: pathEnabled })
    bot.whisper(username, `Flight trail ${pathEnabled ? 'enabled' : 'disabled'}.`)
    return
  }
  if (/^!clear(?:\s|$)/i.test(trimmed)) {
    clearAllRendered()
    record('indicators-cleared', { username })
    bot.whisper(username, 'Cleared all flight indicators.')
    return
  }
  if (/^!render(?:\s|$)/i.test(trimmed)) {
    const args = trimmed.split(/\s+/).slice(1).map(Number)
    record('render-command', { username, args })
    void renderFlightPath(username, args)
    return
  }
  if (/^!fly(?:\s|$)/i.test(trimmed)) {
    const args = trimmed.split(/\s+/).slice(1).map(Number)
    record('fly-command', { username, args })
    void beginFlight(username, args)
  }
}

bot.once('spawn', () => {
  world = new CacheSyncWorld(bot, bot.world)
  collisionResolver = createBlockCollisionResolver(world)
  void bot.waitForChunksToLoad().then(() => {
    ready = true
    record('flight-ready', { position: bot.entity.position })
    bot.chat('ready!')
  }).catch(error => {
    record('flight-setup-failed', { error: error instanceof Error ? error.message : String(error) })
  })
})

bot.on('chat', (username, message) => {
  if (username !== bot.username) handleCommand(username, message)
})
bot.on('whisper', (username, message) => {
  if (username !== bot.username) handleCommand(username, message)
})

bot.on('physicsTickBegin', () => {
  void tickFlight()
  if (!pendingFlightRocket) return
  pendingFlightRocket = false
  try {
    sendFlightRocket()
  } catch (error) {
    record('flight-firework-error', { error: error instanceof Error ? error.message : String(error) })
  }
})

bot.on('physicsTick', () => {
  const now = performance.now()
  const physicsTickGapMs = now - lastPhysicsTickAt
  lastPhysicsTickAt = now
  if (flight != null && physicsTickGapMs >= PROFILE_WARN_MS) {
    record('flight-physics-tick-gap', { gapMs: physicsTickGapMs })
  }
})

bot.on('kicked', reason => record('bot-kicked', { reason }))
bot.on('end', reason => {
  indicators.clearRemote()
  indicators.close()
  record('bot-ended', { reason })
})
bot.on('error', error => record('bot-error', { error: error.message }))
process.on('exit', () => log.end())
process.on('exit', () => indicators.close())