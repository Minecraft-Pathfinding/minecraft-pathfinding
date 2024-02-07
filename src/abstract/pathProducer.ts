import { Path } from '.'
import { AStar } from './algorithms/astar'
import { PathData } from './node'

export interface PathProducer<Data extends PathData = PathData> {
  // constructor(start: Data, goal: goals.Goal, settings: Settings): PathProducer

  advance: () => { result: Path<Data, AStar<Data>>, astarContext: AStar<Data> }
}
