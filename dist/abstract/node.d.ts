export interface PathData {
    hash: string;
    cost: number;
}
export declare class PathNode<Data extends PathData> {
    data: Data | null;
    parent: PathNode<Data> | null;
    g: number;
    h: number;
    get f(): number;
    update(g: number, h: number, data?: Data | null, parent?: PathNode<Data> | null): this;
}
export declare class CPathNode<Data extends PathData> implements PathNode<Data> {
    constructor(g: number, h: number, data?: Data | null, parent?: PathNode<Data> | null);
    data: Data | null;
    parent: PathNode<Data> | null;
    g: number;
    h: number;
    f: number;
    update(g: number, h: number, data: Data | null, parent: PathNode<Data> | null): this;
}
