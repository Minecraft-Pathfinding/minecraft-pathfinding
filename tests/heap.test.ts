import assert from 'node:assert/strict'
import test from 'node:test'

import { BinaryHeapOpenSet } from '../src/abstract/heap'
import { CPathNode } from '../src/abstract/node'

function makeHeap () {
  return new BinaryHeapOpenSet<any, CPathNode<any>>()
}

function drain (heap: ReturnType<typeof makeHeap>): number[] {
  const out: number[] = []
  while (!heap.isEmpty()) out.push(heap.pop().f)
  return out
}

test('pops nodes in ascending f order', () => {
  const heap = makeHeap()
  const fs = [7, 1, 8, 2, 9, 5, 3, 4, 6, 0]
  for (const f of fs) heap.push(new CPathNode(f, 0))
  assert.deepEqual(drain(heap), [...fs].sort((a, b) => a - b))
})

test('pop keeps the minimum at the root even when the smaller child is the last slot', () => {
  // Regression: the old sift-down used `smallerChild < size - 1`, which skipped
  // the right child when it was the final slot, so this used to return [1, 8, ...].
  const heap = makeHeap()
  for (const f of [1, 8, 2, 9]) heap.push(new CPathNode(f, 0))
  assert.deepEqual(drain(heap), [1, 2, 8, 9])
})

test('update() re-heaps after a decrease-key (index-based, no scan)', () => {
  const heap = makeHeap()
  const a = new CPathNode(5, 0)
  const b = new CPathNode(4, 0)
  const c = new CPathNode(3, 0)
  heap.push(a)
  heap.push(b)
  heap.push(c)

  a.update(0, 0, null, null) // a.f: 5 -> 0, now the smallest
  heap.update(a)

  assert.equal(heap.pop(), a) // a must surface first
  assert.deepEqual(drain(heap), [3, 4])
})

test('size/isEmpty track the count and heapIdx clears on pop', () => {
  const heap = makeHeap()
  const n = new CPathNode(1, 0)
  assert.equal(heap.isEmpty(), true)
  heap.push(n)
  assert.equal(heap.size(), 1)
  assert.ok(n.heapIdx > 0)
  assert.equal(heap.pop(), n)
  assert.equal(heap.isEmpty(), true)
  assert.equal(n.heapIdx, -1)
})

test('stress: random pushes and decrease-keys always pop in sorted order', () => {
  const heap = makeHeap()
  const nodes: Array<CPathNode<any>> = []
  for (let i = 0; i < 200; i++) {
    const node = new CPathNode(Math.floor(Math.random() * 1000), 0)
    nodes.push(node)
    heap.push(node)
  }
  // Decrease the key of a handful of still-open nodes.
  for (let i = 0; i < 40; i++) {
    const node = nodes[Math.floor(Math.random() * nodes.length)]
    if (node.heapIdx === -1) continue
    // Always a strict decrease-key (what A* does); update() only bubbles up.
    node.update(node.g - 1 - Math.floor(Math.random() * 10), 0, null, null)
    heap.update(node)
  }
  const out = drain(heap)
  const sorted = [...out].sort((a, b) => a - b)
  assert.deepEqual(out, sorted)
})
