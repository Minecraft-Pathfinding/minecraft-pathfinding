import { Bot } from 'mineflayer'
import type { BuildableMoveProvider, MovementOptions } from '../movements'
import { MovementExecutor } from '../movements'
import { World } from '../world/worldInterface'
import { MovementOptimizer } from './optimizer'

export type BuildableMoveOptimizer = new (bot: Bot, world: World, settings: Partial<MovementOptions>) => MovementOptimizer

export type RegisteredOptimizer = {
  optimizer: MovementOptimizer
  optimizedExecutor?: MovementExecutor
  priority: number
  order: number
}

export type OptimizationMap = Map<BuildableMoveProvider, RegisteredOptimizer[]>

export class OptimizationRegistry {
  private readonly entries: OptimizationMap = new Map()
  private nextOrder = 0

  constructor (
    private readonly bot: Bot,
    private readonly world: World,
    private settings: Partial<MovementOptions>
  ) {}

  private createOptimizerInstance (
    Optimizer: BuildableMoveOptimizer | MovementOptimizer
  ): MovementOptimizer {
    if (Optimizer instanceof MovementOptimizer) {
      return Optimizer
    }

    return new Optimizer(this.bot, this.world, this.settings)
  }

  private addEntry (
    provider: BuildableMoveProvider,
    optimizer: BuildableMoveOptimizer | MovementOptimizer,
    priority: number,
    optimizedExecutor?: MovementExecutor
  ): void {
    const entry = {
      optimizer: this.createOptimizerInstance(optimizer),
      optimizedExecutor,
      priority,
      order: this.nextOrder++
    }

    const current = this.entries.get(provider)
    if (current == null) {
      this.entries.set(provider, [entry])
      return
    }

    current.push(entry)
  }

  setSettings (settings: Partial<MovementOptions>): void {
    this.settings = settings
  }

  setOptimizer (
    provider: BuildableMoveProvider,
    optimizer: BuildableMoveOptimizer | MovementOptimizer,
    optimizedExecutor?: MovementExecutor,
    priority = 100
  ): void {
    this.entries.set(provider, [])
    this.addEntry(provider, optimizer, priority, optimizedExecutor)
  }

  addOptimizer (
    provider: BuildableMoveProvider,
    optimizer: BuildableMoveOptimizer | MovementOptimizer,
    optimizedExecutor?: MovementExecutor,
    priority = 100
  ): void {
    this.addEntry(provider, optimizer, priority, optimizedExecutor)
  }

  clear (): void {
    this.entries.clear()
  }

  snapshot (): OptimizationMap {
    const ret: OptimizationMap = new Map()

    for (const [provider, entries] of this.entries) {
      ret.set(
        provider,
        [...entries].sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority
          return a.order - b.order
        })
      )
    }

    return ret
  }
}
