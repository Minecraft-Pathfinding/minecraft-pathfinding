import { Vec3 } from 'vec3'
import { Goal as AGoal } from '../abstract'
import { Move } from './move'

export namespace goals {

  export abstract class Goal implements AGoal<Move> {
    abstract isEnd (node: Move): boolean
    abstract heuristic (node: Move): number
  }

  export class GoalBlock extends Goal {
    constructor (public x: number, public y: number, public z: number) {
      super()
    }

    static fromVec (vec: Vec3) {
      return new GoalBlock(Math.floor(vec.x), Math.floor(vec.y), Math.floor(vec.z))
    }

    static fromBlock (block: { position: Vec3 }) {
      return new GoalBlock(block.position.x, block.position.y, block.position.z)
    }

    /**
         * Using 0.275 as sprint speed of 5.6125 blocks per second (https://minecraft.gamepedia.com/Sprinting#Speed)
         * Mult by 10 for fixed point
         * @param node
         * @returns
         */
    heuristic (node: Move) {
      // return 0;
      const dx = this.x - node.x
      const dy = this.y - node.y
      const dz = this.z - node.z
      return (Math.sqrt(dx * dx + dz * dz + (dy * dy * 0.5)))
      // return (Math.sqrt(dx * dx + dz * dz) + Math.abs(dy))
      // return distanceXZ(dx, dz) + Math.abs(dy)
    }

    isEnd (node: Move) {
      return node.x === this.x && node.y === this.y && node.z === this.z
    }
  }

}
