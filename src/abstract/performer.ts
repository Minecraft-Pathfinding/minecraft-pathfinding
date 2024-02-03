import { Algorithm, Path } from ".";
import { goals } from "../mineflayer-specific/goals";
import { Move } from "../mineflayer-specific/move";

export interface Performer {
  status: "idle" | "performing";

  cancel(): void;
  performAll(goal: goals.Goal, path: Path<Move, Algorithm<Move>>): Promise<void>;
  performMove(goal: goals.Goal, move: Move): Promise<void>;
}