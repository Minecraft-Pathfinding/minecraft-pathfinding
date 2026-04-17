import { PathData, PathNode } from './node';
export declare class BinaryHeapOpenSet<Data extends PathData, N extends PathNode<Data>> {
    heap: N[];
    size(): number;
    isEmpty(): boolean;
    push(val: N): void;
    update(val: N): void;
    pop(): N;
}
