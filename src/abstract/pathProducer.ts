import { Path } from ".";
import { goals } from "../mineflayer-specific/goals";
import { MovementOptions } from "../mineflayer-specific/movements";
import { AStar } from "./algorithms/astar";
import { PathData } from "./node";

export interface PathProducer<Data extends PathData = PathData> {
  // constructor(start: Data, goal: goals.Goal, settings: Settings): PathProducer
  
  advance(): { result: Path<Data, AStar<Data>>, astarContext: AStar<Data> } 
}