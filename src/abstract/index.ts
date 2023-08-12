import { Move } from "../mineflayer-specific/move";
import { PathNode } from "./node";

export interface Goal {
    reachesGoal: (node: Move) => boolean
    heuristic: (node: Move) => number;
}


export interface PathingAlg {
    compute(start: PathNode): Path<PathingAlg> | null;
}

export interface Path<Alg extends PathingAlg, N = unknown> {
    status: string,
    cost: number,
    calcTime: number,
    visitedNodes: number,
    generatedNodes: number,
    path: N[],
    context: Alg
}

export interface MovementProvider {
    getNeighbors<Data>(org: Data): Generator<Data, unknown, void>;
}

export {PathNode} from './node';

