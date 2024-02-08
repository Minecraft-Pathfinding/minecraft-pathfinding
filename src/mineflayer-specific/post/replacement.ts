import { Move } from '../move'
import { Algorithm, Path } from '../../abstract'
import { ReplacementMap } from '.'
import { Bot } from 'mineflayer'
import { World } from '../world/worldInterface'
import { BuildableMoveProvider } from '../movements'

/**
 * Provide an intrascture for replacing optimized moves in a path with various new moves.
 *
 * This will be A* based.
 */

// temp typing
interface Result {
  referencePath: Move[]
  replacements: Map<number, Path<Move, MovementReplacement>>
  context: Replacer
}

export interface MovementReplacement extends Algorithm<Move> {
  canReplace: (move: Move) => boolean
  initialize: (move: Move) => void
  compute: () => Path<Move, MovementReplacement> | null
}

export class Replacer {
  repMap: ReplacementMap

  private pathCopy!: Move[]
  private currentIndex: number

  constructor (bot: Bot, world: World, optMap: ReplacementMap) {
    this.currentIndex = 0
    this.repMap = optMap
  }

  loadPath (path: Move[]): void {
    // console.log('original path length', path.length)
    this.pathCopy = path
    this.currentIndex = 0
  }

  sanitize (): boolean {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    return !!this.pathCopy
  }

  makeResult (this: Replacer, repRetMap: Map<number, Path<Move, MovementReplacement>>): Result {
    return {
      referencePath: this.pathCopy,
      replacements: repRetMap,
      context: this
    }
  }

  async compute (): Promise<Result> {
    if (!this.sanitize()) {
      throw new Error('Optimizer not sanitized')
    }

    const ret = new Map<number, Path<Move, MovementReplacement>>()

    while (this.currentIndex < this.pathCopy.length) {
      const move = this.pathCopy[this.currentIndex]
      const opt = this.repMap.get(move.moveType.constructor as BuildableMoveProvider)
      // console.log(opt?.constructor.name, this.currentIndex)
      if (opt == null) {
        this.currentIndex++
        continue
      }

      if (!opt.canReplace(move)) {
        this.currentIndex++
        continue
      }

      opt.initialize(move)
      const path = opt.compute()

      if (path === null) {
        this.currentIndex++
        continue
      }

      ret.set(this.currentIndex, path)

      // console.log('found replacement for:', opt?.constructor.name, this.currentIndex, ': here using', path.path.length, 'moves')

      this.currentIndex++
    }

    // console.log('optimized path length', this.pathCopy.length)
    return this.makeResult(ret)
  }
}
