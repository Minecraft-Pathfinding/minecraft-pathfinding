import { Move } from "../mineflayer-specific/move";
import { PathNode } from "./node";

export interface Goal {
    isEnd(node: Move): boolean
    heuristic(node: Move): number;
}


export interface PathingAlg {
    compute(start: PathNode): Path<PathingAlg> | null;
}

export interface Path<Alg extends PathingAlg, N = unknown> {
    status: string, //'noPath' | 'timeout' | 'partial' | 'success'
    cost: number,
    calcTime: number,
    visitedNodes: number,
    generatedNodes: number,
    path: N[],
    context: Alg
}

export interface MovementProvider<Data> {
    getNeighbors(org: Data): Data[];
}

export {PathNode} from './node';

