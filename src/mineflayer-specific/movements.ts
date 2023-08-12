import { Move } from "./move";
import { Bot } from "mineflayer";
import {
  BaseSimulator,
  Controller,
  EPhysicsCtx,
  EntityPhysics,
  SimulationGoal,
} from "@nxg-org/mineflayer-physics-util";
import { Vec3 } from "vec3";
import {
  EntityState,
  PlayerState,
} from "@nxg-org/mineflayer-physics-util/dist/physics/states";

type Direction = { x: number; z: number };

// Keeping this logic temporarily just for testing.
const cardinalDirections: Direction[] = [
  { x: -1, z: 0 }, // West
  { x: 1, z: 0 }, // East
  { x: 0, z: -1 }, // North
  { x: 0, z: 1 }, // South
];

const diagonalDirections: Direction[] = [
  { x: -1, z: -1 },
  { x: -1, z: 1 },
  { x: 1, z: -1 },
  { x: 1, z: 1 },
];

function setState(simCtx: EPhysicsCtx, pos: Vec3, vel: Vec3) {
  simCtx.state.age = 0;
  simCtx.state.pos.set(pos.x, pos.y, pos.z);
  simCtx.state.vel.set(vel.x, vel.y, vel.z);
}

function getStraightAim(x: number, z: number): Controller {
  return (state: EntityState, ticks: number) => {
    const dx = x - state.pos.x;
    const dz = z - state.pos.z;
    state.yaw = Math.atan2(-dx, -dz);
  };
}

function getReached(x: number, y: number, z: number): SimulationGoal {
  return (state: EntityState) => {
    return (
      Math.abs(x - state.pos.x) <= 0.35 &&
      Math.abs(z - state.pos.z) <= 0.35 &&
      Math.abs(y - state.pos.y) < 1 &&
      (state.onGround || state.isInWater)
    );
  };
}

abstract class Movement extends BaseSimulator {
  stateCtx: EPhysicsCtx;
  constructor(protected bot: Bot) {
    super(new EntityPhysics(bot.registry));
    this.stateCtx = EPhysicsCtx.FROM_BOT(this.ctx, bot);
  }


  abstract doable(start: Move, dir: Direction, storage: Move[]): void;
  abstract perform(): Promise<void>;
}

class ForwardMovement extends Movement {
  doable(start: Move, dir: Direction, storage: Move[]): void {
    setState(this.stateCtx, start.exitPosition, start.exitVelocity);
    this.stateCtx.state.clearControlStates();
    this.stateCtx.state.control.set('forward', true)
    this.stateCtx.state.control.set('sprint', true)
    

    const stopOnVertCollision: SimulationGoal = (state: EntityState) => state.isCollidedVertically;
 

    const newState = this.simulateUntil(
      Movement.buildAnyGoal(
        getReached(start.gX + dir.x, start.gY, start.gZ + dir.z),
        stopOnVertCollision
      ),
      () => {},
      getStraightAim(start.gX + dir.x, start.gZ + dir.z),
      this.stateCtx,
      this.bot.world,
      20
    );

    if (newState.age !== 20) storage.push(new Move(start.gX + dir.x, start.gY, start.gZ + dir.z, newState.pos, newState.vel, newState.age))

  }

  
  perform(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

class MovementHandler {
  // Rest of the class properties...

  constructor(private bot: Bot, private recognizedMovements: Movement[]) {}

  // Rest of the class methods...

  getNeighbors(currentMove: Move): Move[] {
    const moves: Move[] = [];
    // Simple moves in 4 cardinal points
    for (const dir of cardinalDirections) {
      for (const newMove of this.recognizedMovements) {
        newMove.doable(currentMove, dir, moves);
      }
    }

    for (const dir of diagonalDirections) {
      for (const newMove of this.recognizedMovements) {
        newMove.doable(currentMove, dir, moves);
      }
    }

    return moves;
  }
}

export default MovementHandler;
