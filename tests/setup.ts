import type { Bot, ControlState } from "mineflayer";
import registry from "prismarine-registry";
import block, { Block as PBlock } from "prismarine-block";
import { Vec3 } from "vec3";
import { initSetup } from "@nxg-org/mineflayer-physics-util/dist";
import { BotcraftPhysics } from "@nxg-org/mineflayer-physics-util/dist/physics/engines";
import { ControlStateHandler } from "@nxg-org/mineflayer-physics-util/dist/physics/player";
import { EPhysicsCtx } from "@nxg-org/mineflayer-physics-util/dist/physics/settings";
import { PlayerState } from "@nxg-org/mineflayer-physics-util/dist/physics/states";
import { applyMdToNewEntity } from "@nxg-org/mineflayer-physics-util/dist/util/physicsUtils";

const initializedVersions = new Set<string>();

export function loadMcData(version: string) {
  const mcData = registry(version);
  if (!initializedVersions.has(version)) {
    initSetup(mcData);
    initializedVersions.add(version);
  }

  return {
    mcData,
    Block: block(version) as typeof PBlock,
  };
}

export class FlatWorld {
  private readonly overrideBlocks: Record<string, PBlock> = {};

  constructor(
    private readonly blocksByName: ReturnType<typeof registry>["blocksByName"],
    private readonly Block: typeof PBlock,
    private readonly floorY: number,
  ) {}

  setOverrideBlock(pos: Vec3, type: number) {
    const blockPos = pos.floored();
    const block = new this.Block(type, 0, 0);
    block.position = blockPos;
    this.overrideBlocks[this.keyFor(blockPos)] = block;
  }

  clearOverrides() {
    for (const key of Object.keys(this.overrideBlocks)) {
      delete this.overrideBlocks[key];
    }
  }

  getBlock(pos: Vec3) {
    const blockPos = pos.floored();
    const override = this.overrideBlocks[this.keyFor(blockPos)];
    if (override) {
      return override;
    }

    const type = blockPos.y < this.floorY ? this.blocksByName.stone.id : this.blocksByName.air.id;
    const block = new this.Block(type, 0, 0);
    block.position = blockPos;
    return block;
  }

  private keyFor(pos: Vec3) {
    return `${pos.x},${pos.y},${pos.z}`;
  }
}

function createFakePlayer(
  version: string,
  mcData: ReturnType<typeof registry>,
  pos: Vec3,
  groundLevel: number,
) {
  const onGround = pos.y === groundLevel;
  const control: Partial<Record<ControlState, boolean>> = {};

  return {
    entity: {
      position: pos,
      velocity: new Vec3(0, onGround ? -0.08 : 0, 0),
      onGround,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      yaw: 0,
      pitch: 0,
      effects: [],
      attributes: {},
    },
    jumpTicks: 0,
    jumpQueued: false,
    version,
    inventory: { slots: [] },
    equipment: [],
    food: 20,
    game: { gameMode: "survival", dimension: "overworld" },
    registry: mcData,
    setControlState: (name: ControlState, value: boolean) => {
      control[name] = value;
    },
    getControlState: (name: ControlState) => control[name] ?? false,
    getEquipmentDestSlot: () => {},
  };
}

export function createFlatWorld(version: string, floorY: number) {
  const { mcData, Block } = loadMcData(version);
  return new FlatWorld(mcData.blocksByName, Block, floorY);
}

export function createPlayerRig(options: {
  version: string;
  position: Vec3;
  groundLevel?: number;
}) {
  const { version, position } = options;
  const groundLevel = options.groundLevel ?? position.y;
  const { mcData } = loadMcData(version);

  const fakePlayer: any = createFakePlayer(version, mcData, position.clone(), groundLevel);
  fakePlayer.entity = applyMdToNewEntity(EPhysicsCtx, mcData.entitiesByName.player, fakePlayer.entity);

  const physics = new BotcraftPhysics(mcData);
  const playerCtx = EPhysicsCtx.FROM_BOT(physics, fakePlayer as Bot);
  const playerState = playerCtx.state as PlayerState;
  playerState.control = ControlStateHandler.DEFAULT();

  return {
    mcData,
    fakePlayer,
    physics,
    playerCtx,
    playerState,
  };
}
