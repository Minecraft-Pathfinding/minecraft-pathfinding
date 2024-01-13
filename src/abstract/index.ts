import { PathData, PathNode } from "./node";

export interface Goal<Data> {
    isEnd(node: Data): boolean
    heuristic(node: Data): number;
}


export interface Algorithm<Data extends PathData = PathData> {
    compute(start: PathNode<Data>): Path<Data, Algorithm<Data>> | null;
    makeResult(status: string, node: PathNode<Data>): Path<Data, Algorithm<Data>>;
}


export interface Path<Data extends PathData, Alg extends Algorithm<Data>> {
    status: string, //'noPath' | 'timeout' | 'partial' | 'success'
    cost: number,
    calcTime: number,
    visitedNodes: number,
    generatedNodes: number,
    path: Data[],
    context: Alg
}

export interface PostProcessed<Data extends PathData, Alg extends Algorithm<Data>> extends Path<Data, Alg> {
    

}


export interface MovementProvider<Data> {
    sanitize(): boolean;
    getNeighbors(org: Data): Data[];
}

export {PathNode} from './node';

