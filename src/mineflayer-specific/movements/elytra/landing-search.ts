import { Vec3 } from 'vec3'
import { World } from '../../world/worldInterface'

export interface LandingSearchOptions {
  budget: number
  requiredClearance?: number
  airRadius?: number
  maxNodes?: number
  horizontalRadius?: number
  targetY?: number
  targetYWindow?: number
}

export interface LandingColumn {
  position: Vec3
  aim: Vec3
  supportY: number
  score: number
  clearanceRadius: number
}

const HAZARDS = new Set([
  'lava',
  'flowing_lava',
  'fire',
  'soul_fire',
  'campfire',
  'soul_campfire',
  'magma_block',
  'cactus',
  'sweet_berry_bush',
  'powder_snow',
  'end_portal',
  'nether_portal'
])
const FULL_HEIGHT_EPSILON = 1e-3

function isHazard(block: any): boolean {
  return HAZARDS.has(String(block?.name ?? '').toLowerCase())
}

function isAir(block: any): boolean {
  return block != null && block.isUnknown !== true && block.physical !== true
}

function supportTopY(block: any): number {
  const baseY = Number.isFinite(block?.position?.y) ? block.position.y : 0
  const height = Number.isFinite(block?.height) ? block.height : 1
  return height >= baseY && height <= baseY + 1 + FULL_HEIGHT_EPSILON
    ? height
    : baseY + height
}

function isFullSupport(block: any): boolean {
  if (block == null || block.physical !== true || isHazard(block)) return false
  const height = Number.isFinite(block.height) ? block.height : 1
  if (height < 1 - FULL_HEIGHT_EPSILON) return false
  if (block.boundingBox != null && block.boundingBox !== 'block') return false
  const boxes = block.boxes ?? block.boundingBoxes
  if (Array.isArray(boxes) && boxes.length > 0) {
    return boxes.some((box: any) => {
      const minX = Number(box?.minX ?? box?.x0)
      const maxX = Number(box?.maxX ?? box?.x1)
      const minZ = Number(box?.minZ ?? box?.z0)
      const maxZ = Number(box?.maxZ ?? box?.z1)
      const minY = Number(box?.minY ?? box?.y0)
      const maxY = Number(box?.maxY ?? box?.y1)
      if (![minX, maxX, minZ, maxZ, minY, maxY].every(Number.isFinite))
        return true
      return maxX - minX >= 0.9 && maxZ - minZ >= 0.9 && maxY - minY >= 0.9
    })
  }
  return true
}

export class LandingSearch {
  private readonly queue: Array<{ x: number; z: number }> = []
  private readonly visited = new Set<string>()
  private readonly target: Vec3
  private queueHead = 0
  private complete = false
  private result: LandingColumn | null = null

  constructor(
    private readonly world: World,
    target: Vec3,
    private readonly options: LandingSearchOptions
  ) {
    this.target = target.clone()
    this.queue.push({ x: Math.floor(target.x), z: Math.floor(target.z) })
  }

  get done(): boolean {
    return this.complete
  }

  step(): LandingColumn | null {
    if (this.complete) return this.result
    const budget = Math.max(1, Math.floor(this.options.budget))
    const maxNodes = Math.max(1, Math.floor(this.options.maxNodes ?? 6000))
    const radius = Math.max(1, Math.floor(this.options.horizontalRadius ?? 14))
    const targetY = this.options.targetY ?? this.target.y
    const yWindow = Math.max(1, Math.floor(this.options.targetYWindow ?? 10))

    for (let i = 0; i < budget && this.queueHead < this.queue.length; i++) {
      if (this.visited.size >= maxNodes) {
        this.complete = true
        return this.result
      }

      const point = this.queue[this.queueHead++]
      const horizontalDistance = Math.hypot(
        point.x + 0.5 - this.target.x,
        point.z + 0.5 - this.target.z
      )
      if (horizontalDistance > radius) continue
      const key = `${point.x},${point.z}`
      if (this.visited.has(key)) continue
      this.visited.add(key)

      const column = this.findColumn(point.x, point.z, targetY, yWindow)
      if (column != null) {
        this.complete = true
        this.result = column
        return column
      }

      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ]) {
        const next = { x: point.x + dx, z: point.z + dz }
        const nextDistance = Math.hypot(
          next.x + 0.5 - this.target.x,
          next.z + 0.5 - this.target.z
        )
        if (nextDistance <= radius && !this.visited.has(`${next.x},${next.z}`))
          this.queue.push(next)
      }
    }

    if (this.queueHead >= this.queue.length) this.complete = true
    return this.result
  }

  private findColumn(
    x: number,
    z: number,
    targetY: number,
    yWindow: number
  ): LandingColumn | null {
    const candidates: LandingColumn[] = []
    for (let dy = -yWindow; dy <= yWindow; dy++) {
      const y = Math.floor(targetY) + dy
      const block = this.world.getBlockInfo(new Vec3(x, y, z))
      if (!isFullSupport(block)) continue

      const supportY = supportTopY(block)
      const aim = new Vec3(x + 0.5, supportY + 0.001, z + 0.5)
      const clearanceRadius = Math.max(
        0,
        Math.floor(this.options.airRadius ?? 1)
      )
      if (
        !this.hasVerticalClearance(
          aim,
          Math.max(3, Math.floor(this.options.requiredClearance ?? 3))
        )
      )
        continue
      if (!this.hasAirBubble(aim, clearanceRadius)) continue

      const horizontalDistance = Math.hypot(
        aim.x - this.target.x,
        aim.z - this.target.z
      )
      const verticalDistance = Math.abs(supportY - targetY)
      const edgeMargin = this.estimatedEdgeMargin(x, y, z)
      const score =
        horizontalDistance * 18 + verticalDistance * 5 - edgeMargin * 2
      candidates.push({
        position: new Vec3(x, y, z),
        aim,
        supportY,
        score,
        clearanceRadius
      })
    }
    candidates.sort((a, b) => a.score - b.score)
    return candidates[0] ?? null
  }

  private hasVerticalClearance(feet: Vec3, blocks: number): boolean {
    const x = Math.floor(feet.x)
    const y = Math.floor(feet.y + 1e-6)
    const z = Math.floor(feet.z)
    for (let dy = 0; dy < blocks; dy++) {
      if (!isAir(this.world.getBlockInfo(new Vec3(x, y + dy, z)))) return false
    }
    return true
  }

  private hasAirBubble(feet: Vec3, radius: number): boolean {
    if (radius <= 0) return true
    const cx = Math.floor(feet.x)
    const cy = Math.floor(feet.y + 1e-6)
    const cz = Math.floor(feet.z)
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + 0.25) continue
        if (!isAir(this.world.getBlockInfo(new Vec3(cx + dx, cy, cz + dz))))
          return false
      }
    }
    return true
  }

  private estimatedEdgeMargin(x: number, y: number, z: number): number {
    let supportNeighbours = 0
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const b = this.world.getBlockInfo(new Vec3(x + dx, y, z + dz))
      if (isFullSupport(b)) supportNeighbours++
    }
    return supportNeighbours
  }
}
