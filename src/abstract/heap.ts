import { PathData, PathNode } from './node'

/**
 * Min-heap (by node `f`) used as A*'s open set.
 *
 * The heap is 1-indexed (slot 0 is an unused sentinel) so a node at index `i`
 * has children at `2i` and `2i + 1` and parent at `i >>> 1`.
 *
 * Every node remembers its own slot in `node.heapIdx`. That is the key detail:
 * A* calls {@link update} a lot (decrease-key, whenever it finds a cheaper route
 * to an already-open node), and tracking the index makes that O(log n) instead
 * of an O(n) `indexOf` scan over the whole open set.
 */
export class BinaryHeapOpenSet<Data extends PathData, N extends PathNode<Data>> {
  private readonly heap: N[] = [null as unknown as N] // slot 0 is an unused sentinel

  size (): number {
    return this.heap.length - 1
  }

  isEmpty (): boolean {
    return this.heap.length === 1
  }

  push (val: N): void {
    this.heap.push(val)
    this.siftUp(this.heap.length - 1)
  }

  /**
   * Restore the heap order after `val`'s `f` has DECREASED (A* found a cheaper
   * path to it). `val.heapIdx` tells us exactly where it sits, so we only need
   * to bubble it up — no search required.
   */
  update (val: N): void {
    this.siftUp(val.heapIdx)
  }

  pop (): N {
    const heap = this.heap
    const min = heap[1]
    const last = heap.pop() as N // remove the final element

    // If `min` was the only element, `last === min` and the heap is now empty.
    if (heap.length > 1) {
      heap[1] = last
      last.heapIdx = 1
      this.siftDown(1)
    }

    min.heapIdx = -1 // no longer in the heap
    return min
  }

  /** Bubble the node at `i` toward the root until its parent is no larger. */
  private siftUp (i: number): void {
    const heap = this.heap
    const node = heap[i]
    const f = node.f

    while (i > 1) {
      const parentIdx = i >>> 1
      const parent = heap[parentIdx]
      if (parent.f <= f) break
      heap[i] = parent
      parent.heapIdx = i
      i = parentIdx
    }

    heap[i] = node
    node.heapIdx = i
  }

  /** Push the node at `i` toward the leaves until both children are no smaller. */
  private siftDown (i: number): void {
    const heap = this.heap
    const size = heap.length - 1
    const node = heap[i]
    const f = node.f

    while (true) {
      let child = i << 1
      if (child > size) break

      // Pick the smaller of the two children. `child < size` guarantees the
      // right child (`child + 1`) is a real slot before we read it.
      if (child < size && heap[child + 1].f < heap[child].f) child++

      const childNode = heap[child]
      if (f <= childNode.f) break

      heap[i] = childNode
      childNode.heapIdx = i
      i = child
    }

    heap[i] = node
    node.heapIdx = i
  }
}
