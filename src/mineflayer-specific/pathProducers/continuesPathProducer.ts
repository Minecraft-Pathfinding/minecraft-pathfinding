import { Bot } from "mineflayer";
import { PathProducer } from "../../abstract/pathProducer";
import { goals } from "../goals";
import { Move } from "../move";
import { ExecutorMap, MovementHandler, MovementOptions } from "../movements";
import { World } from "../world/worldInterface";
import { AStar } from "../../abstract/algorithms/astar";

export class ContinuesPathProducer implements PathProducer<Move> {
  private start: Move;
  private goal: goals.Goal;
  private settings: MovementOptions;
  private bot: Bot;
  private world: World;
  private movements: ExecutorMap;
  private astarContext: AStar<Move> | undefined;
  constructor(start: Move, goal: goals.Goal, settings: MovementOptions, bot: Bot, world: World, movements: ExecutorMap) {
    this.start = start;
    this.goal = goal;
    this.settings = settings;
    this.bot = bot;
    this.world = world;
    this.movements = movements;
  }
  
  advance() {
    if (!this.astarContext) {
      const moveHandler = MovementHandler.create(this.bot, this.world, this.movements, this.settings);
      moveHandler.loadGoal(this.goal);
  
      this.astarContext = new AStar(this.start, moveHandler, this.goal, -1, 45, -1, -1e-6);
    }
    
    const result = this.astarContext.compute()!;
    return { result, astarContext: this.astarContext };
  }
}