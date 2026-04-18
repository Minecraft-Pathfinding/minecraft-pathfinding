import { Vec3 } from 'vec3'
import {goals, Move, MovementProvider} from '../../../src'



export class BridgeProvider extends MovementProvider {
  public readonly movementDirs: Vec3[] = []

  provideMovements (_start: Move, _storage: Move[], _goal: goals.Goal, _closed: Set<string>): void {}
}
