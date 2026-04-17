import { Vec3 } from 'vec3';
import { SimMovement } from '../movements';
import { Controller, SimulationGoal } from '@nxg-org/mineflayer-physics-util';
import { Bot } from 'mineflayer';
import { goals } from '../goals';
import { Move } from '../move';
export declare class ForwardJumpMovement extends SimMovement {
    controlAim(nextPoint: Vec3): Controller;
    botAim(bot: Bot, nextMove: Vec3, goal: goals.Goal): () => void;
    getReached(goal: goals.Goal, nextPos: Vec3, start: Move): SimulationGoal;
    botReach(bot: Bot, move: Move, goal: goals.Goal): () => boolean;
    provideMovements(start: Move, storage: Move[], goal: goals.Goal): void;
    align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean;
    performPerTick: (move: Move, tickCount: number, currentIndex: number, path: Move[]) => boolean;
    performInit: (move: Move, currentIndex: number, path: Move[]) => Promise<void>;
}
