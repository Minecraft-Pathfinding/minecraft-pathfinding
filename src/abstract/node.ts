export interface PathData {
  hash: string
  cost: number
}

export class PathNode<Data extends PathData> {
  data: Data | null = null
  parent: PathNode<Data> | null = null
  g = 0
  h = 0

  // Current position in the open-set heap. Maintained by BinaryHeapOpenSet so
  // that decrease-key (update) is O(log n) instead of an O(n) indexOf scan.
  // -1 means "not in the heap".
  heapIdx = -1

  get f (): number {
    return this.g + this.h
  }

  update (
    g: number,
    h: number,
    data: Data | null = null,
    parent: PathNode<Data> | null = null
  ): this {
    this.g = g
    this.h = h
    this.data = data
    this.parent = parent
    return this
  }
}

export class CPathNode<Data extends PathData> implements PathNode<Data> {
  constructor (g: number, h: number, data: Data | null = null, parent: PathNode<Data> | null = null) {
    this.g = g
    this.h = h
    this.f = g + h
    this.data = data
    this.parent = parent
  }

  data: Data | null
  parent: PathNode<Data> | null
  g: number
  h: number
  f: number
  heapIdx = -1

  update (g: number, h: number, data: Data | null, parent: PathNode<Data> | null): this {
    this.g = g
    this.h = h
    this.f = g + h
    this.data = data
    this.parent = parent
    return this
  }
}
