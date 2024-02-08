import { Algorithm, Path } from '../abstract'
import * as goals from './goals'
import { Move } from './move'

export interface Performer {
  status: 'idle' | 'performing'

  cancel: () => void
  performAll: (goal: goals.Goal, path: Path<Move, Algorithm<Move>>) => Promise<void>
  performMove: (goal: goals.Goal, move: Move) => Promise<void>
}
