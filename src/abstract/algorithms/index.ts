import { PathData, PathNode } from '../node'

export function reconstructPath<Data extends PathData> (node: PathNode<Data>): Data[] {
  const path: Data[] = []
  while (node.parent != null) {
    if (node.data == null) throw new Error('Node data is null!') // should never occur.
    path.push(node.data)
    node = node.parent
  }
  return path.reverse()
}
