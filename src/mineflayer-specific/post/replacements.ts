import { Vec3 } from 'vec3'
import { Path, MovementProvider as AMovementProvider, PathNode, Algorithm } from '../../abstract'
import { Move } from '../move'
import { Movement, MovementHandler, MovementProvider } from '../movements'
import { MovementReplacement } from './replacement'

export class ReplacementHandler implements AMovementProvider<Move> {
  constructor (private readonly orgMove: Move, private readonly replacement: MovementProvider) {}

  static createFromSingle (move: Move, replacement: MovementProvider): ReplacementHandler {
    return new ReplacementHandler(move, replacement)
  }

  sanitize (): boolean {
    return true
    // throw new Error("Method not implemented.");
  }

  getNeighbors (org: Move): Move[] {
    throw new Error('Method not implemented.')
  }
}
