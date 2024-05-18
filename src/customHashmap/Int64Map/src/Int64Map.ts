
type primitive = boolean | number | string | bigint | symbol | object | null

interface Node<P extends primitive = primitive> {
  intLow: number
  intHigh: number
  value: P
  next?: Node<P>
}

interface Bucket<P extends primitive> {
  head?: Node<P>
}

const DEFAULT_SIZE = 1024
const LOAD_FACTOR = 0.5

console.log('running with load factor', LOAD_FACTOR)

class Int64Map<P extends primitive> {
  constructor (initialSize = DEFAULT_SIZE) {
    this.values = new Array<Bucket<P>>(initialSize)
    for (let i = 0; i < initialSize; i++) {
      this.values[i] = { }
    }
    this.INTIAL_SIZE = initialSize
    this.size = initialSize
  }

  private readonly values: Array<Bucket<P>>

  private readonly INTIAL_SIZE: number = DEFAULT_SIZE

  private size = 0

  get __size (): number {
    return this.size
  }

  private length = 0

  get __length (): number {
    return this.length
  }

  get (intLow: number, intHigh: number): P | null {
    const index = intLow & (this.size - 1)
    const bucket = this.values[index]
    let node = bucket.head
    while (node != null) {
      if (node.intHigh === intHigh) {
        return node.value
      }
      node = node.next
    }
    return null
  }

  set (intLow: number, intHigh: number, value: P): P | boolean {
    if (this.length > this.size * LOAD_FACTOR) {
      this.grow()
    }
    const index = intLow & (this.size - 1)
    const bucket = this.values[index]
    let node = bucket.head
    while (node != null) {
      if (node.intHigh === intHigh) {
        node.value = value
        return false
      }
      node = node.next
    }

    node = {
      intLow,
      intHigh,
      value,
      next: bucket.head
    }
    bucket.head = node
    // bucket.head = new Node(intLow, intHigh, value, bucket.head)//node
    this.length++
    return true
  }

  delete (intLow: number, intHigh: number): boolean {
    if (this.size > this.INTIAL_SIZE && this.size >= this.length * 4) {
      this.shrink()
    }
    const index = intLow & (this.size - 1)
    const bucket = this.values[index]
    let node = bucket.head
    if (node != null) {
      if (node.intHigh === intHigh) {
        bucket.head = node.next
        this.length--
        return true
      }
      let prev = node
      node = node.next
      while (node != null) {
        if (node.intHigh === intHigh) {
          prev.next = node.next
          this.length--
          return true
        }
        prev = node
        node = node.next
      }
    }
    return false
  }

  private clear (): void {
    for (let i = 0; i < this.size; i++) {
      delete this.values[i].head
    }
    this.length = 0
  }

  private grow (): void {
    const start = performance.now()
    const oldSize = this.size
    const newSize = oldSize * 2
    this.size = newSize
    this.values.length = newSize

    for (let i = oldSize; i < newSize; i++) {
      this.values[i] = { }
    }

    for (let i = 0; i < oldSize; i++) {
      const oldBucket = this.values[i]
      let node = oldBucket.head
      delete oldBucket.head
      // oldBucket.head = null
      while (node != null) {
        const { next } = node
        const newIndex = node.intLow & (newSize - 1)
        if (newIndex === i) {
          node.next = oldBucket.head
          oldBucket.head = node
        } else {
          const bucket = this.values[newIndex]
          node.next = bucket.head
          bucket.head = node
        }
        node = next
      }
    }

    const time = performance.now() - start
    console.log(`Took \x1B[32m${time.toFixed(0)}\x1B[0m ms to resize hashmap to \x1B[32m${newSize}\x1B[0m.`)
  }

  private shrink (): void {
    console.log('Shrink not implemented yet. (Not tested!)')
    // TODO
    const oldSize = this.size
    const newSize = oldSize / 2

    for (let i = oldSize; i >= newSize; i--) {
      let node = this.values[i].head
      while (node != null) {
        const next = node.next
        const newIndex = node.intLow % newSize
        const bucket = this.values[newIndex]
        node.next = bucket.head
        bucket.head = node
        node = next
      }

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.values[i]
    }
    this.values.length = newSize
    this.size = newSize
  }
}

export { Int64Map }
