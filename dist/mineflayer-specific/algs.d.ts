import { Goal, Path as APath } from '../abstract';
import { AStarBackOff as AAStarBackOff } from '../abstract/algorithms/astar';
import { PathStatus } from '../types';
import { Move } from './move';
import { MovementHandler } from './movements';
import { PathNode } from './node';
export interface Path<T extends AStar = AStar> extends APath<Move, MovementHandler, T> {
    movementProvider: MovementHandler;
}
export interface PathProducer {
    getCurrentPath: () => Move[];
    getAstarContext: () => AStar | undefined;
    advance: () => {
        result: Path;
        astarContext: AStar;
    };
}
export declare class AStar extends AAStarBackOff<Move, MovementHandler> {
    visitedChunks: Set<string>;
    mostRecentNode: PathNode;
    constructor(start: Move, movements: MovementHandler, goal: Goal<Move>, timeout: number, tickTimeout?: number, searchRadius?: number, differential?: number);
    protected addToClosedDataSet(node: PathNode): void;
    compute(): Path<this>;
}
export declare class AStarNeighbor extends AStar {
    makeResult(status: PathStatus, node: PathNode): Path<this>;
    compute(): Path<this>;
    private test;
}
