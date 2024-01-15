import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { goals } from '../goals'
import { Move } from '../move'
import { World } from '../world/worldInterface'
import { Movement, MovementOptions } from './movement'
import { CancelError } from './exceptions'

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

  performInit = async (thisMove: Move, goal: goals.Goal) => {
    // this.bot.chat(`ForwardMove: ${thisMove.exitPos} `)
    await this.bot.lookAt(thisMove.exitPos, true)
  };

  performPerTick = (thisMove: Move, tickCount: number, goal: goals.Goal) => {
    if (tickCount > 40) throw new CancelError('ForwardMove: tickCount > 40')
    if (!this.bot.entity.onGround) return false
    if (this.bot.entity.position.distanceTo(goal.toVec()) < 0.5) return true;
    if (this.bot.entity.position.distanceTo(thisMove.exitPos) < 0.5) return true;
    
    this.bot.setControlState('forward', true)
    if (this.bot.food < 6) this.bot.setControlState('sprint', false)
    else this.bot.setControlState('sprint', true)
    return false;
  };

  getMoveForward (start: Move, dir: Vec3, neighbors: Move[]) {
    const pos = start.exitRounded(1);
    // const pos = start.exitPos
    // if (dir.norm() !== 1) return;
    // if (dir.x !== 1 && dir.z !== 1) return
    // console.log(pos, pos.plus(dir))
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
  }
}
