export interface PathData {
  hash: string
  cost: number
}

export class PathNode<Data extends PathData> {
  data: Data | null = null
  parent: PathNode<Data> | null = null
  g = 0
  h = 0

  get f (): number {
    return this.g + this.h
  }

  set (
    g: number,
    h: number,
    data: Data | null = null,
    parent: PathNode<Data> | null = null
  ) {
    this.g = g
    this.h = h
    this.data = data
    this.parent = parent
    return this
  }
}
