import { PathData, PathNode } from "./node";

export interface Goal<Data> {
    isEnd(node: Data): boolean
    heuristic(node: Data): number;
}


export interface PathingAlg<Data extends PathData> {
    compute(start: PathNode<Data>): Path<Data, PathingAlg<Data>> | null;
    makeResult(status: string, node: PathNode<Data>): Path<Data, PathingAlg<Data>>;
}

export interface Path<Data extends PathData, Alg extends PathingAlg<Data>> {
    status: string, //'noPath' | 'timeout' | 'partial' | 'success'
    cost: number,
    calcTime: number,
    visitedNodes: number,
    generatedNodes: number,
    path: Data[],
    context: Alg
}

export interface MovementProvider<Data> {
    sanitize(): boolean;
    getNeighbors(org: Data): Data[];
}

export {PathNode} from './node';

