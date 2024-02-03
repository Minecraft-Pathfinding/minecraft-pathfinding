import { Path } from ".";
import { goals } from "../mineflayer-specific/goals";
import { Move } from "../mineflayer-specific/move";
import { MovementOptions } from "../mineflayer-specific/movements";
import { AStar } from "./algorithms/astar";
import { PathData } from "./node";

export interface PathProducer {
  constructor(start: Move, goal: goals.Goal, settings: MovementOptions): PathProducer
  
  advance(): { result: Path<Move, AStar<Move>>, astarContext: AStar<PathData> } 
}