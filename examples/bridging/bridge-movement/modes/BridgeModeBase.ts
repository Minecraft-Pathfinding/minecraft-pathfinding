import { Vec3 } from 'vec3'
import { OptimalLineTracker } from '../BridgeUtils'
import { Move } from '../../../../src/mineflayer-specific/move'
import { Bot } from 'mineflayer'
import { World } from '../../../../src/mineflayer-specific/world/worldInterface'
import { BridgeConfig } from '../BridgeConfig'

export interface TickContext {
  move: Move
  nowMs: number
  path: Move[]
  pathIndex: number
  lineTracker: OptimalLineTracker
  placedThisMove: number
  totalBlockCount: number
}

export interface ModeTickResult {
  targetYaw: number | null
  targetPitch: number | null
  useStrafe: boolean
  allowPlace: boolean
  wantSneak: boolean
  wantJump: boolean
  wantSprint: boolean
  movementOverride: Vec3 | null
}

export const DEFAULT_TICK_RESULT: ModeTickResult = {
  targetYaw: null,
  targetPitch: null,
  useStrafe: true,
  allowPlace: false,
  wantSneak: false,
  wantJump: false,
  wantSprint: true,
  movementOverride: null
}

export abstract class BridgeModeBase{
  constructor(
    protected readonly bot: Bot,
    protected readonly world: World,
    protected readonly config: BridgeConfig
  ) {}

  abstract onMoveStart(ctx: TickContext): void
  abstract onTick(ctx: TickContext, placements: Vec3[]): ModeTickResult
  abstract onBlockPlaced(ctx: TickContext): void
  abstract onMoveEnd(): void
}