import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { goals } from '../goals'
import { Move } from '../move'
import { World } from '../world/worldInterface'
import { Movement, MovementOptions } from './movement'

export class IdleMovement extends Movement {
  doable (start: Move, dir: Vec3, storage: Move[]): void {}
  performInit = async (thisMove: Move, goal: goals.Goal) => {}
  performPerTick = async (thisMove: Move, tickCount: number, goal: goals.Goal) => {
    return true
  }
}

export class ForwardMove extends Movement {
  constructor (bot: Bot, world: World, settings: Partial<MovementOptions>) {
    super(bot, world, settings)
  }

  doable(start: Move, dir: Vec3, storage: Move[], goal: goals.Goal): void {
    this.getMoveForward(start, dir, storage)
  };

  performInit = (thisMove: Move, goal: goals.Goal) => undefined;

  performPerTick = (thisMove: Move, tickCount: number, goal: goals.Goal) => true;

  getMoveForward (start: Move, dir: Vec3, neighbors: Move[]) {
    const pos = start.toVec()
    const blockB = this.getBlockInfo(pos, dir.x, 1, dir.z)
    const blockC = this.getBlockInfo(pos, dir.x, 0, dir.z)
    const blockD = this.getBlockInfo(pos, dir.x, -1, dir.z)

    let cost = 1 // move cost

    if (!blockD.physical) { // block at feet in front of us is air
      return
    }

    if (blockB.physical || blockC.physical) {
      return
    }

    neighbors.push(Move.fromPrevious(cost, pos.plus(dir), start, this))
    neighbors.push(new Move(pos.x + dir.x, pos.y, pos.z + dir.z, [], [], cost, this, new Vec3(0, 0, 0), new Vec3(0, 0, 0), pos, new Vec3(0, 0, 0)))
  }
}
