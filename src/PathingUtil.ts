import { Bot } from 'mineflayer'
import { Block } from './types'
import type { Item } from 'prismarine-item'
import * as nbt from 'prismarine-nbt'

export class PathingUtil {
  private items: Item[] = []
  private tools: Item[] = []

  private memoedDigSpeed: { [key: string]: number } = {}
  private memoedBestTool: { [key: string]: Item | null } = {}

  constructor (private readonly bot: Bot) {
    this.refresh()
  }

  public refresh (): void {
    this.items = this.bot.inventory.items()
    this.tools = this.items.filter(
      (item) => item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('shovel') || item.name.includes('hoe') || item.name.includes('shears')
    )
    this.memoedDigSpeed = {}
    this.memoedBestTool = {}
  }

  /**
   * TODO: Handle underwater digging.
   */
  public bestHarvestingTool (block: Block): Item | null {
    if (block === null) return null
    if (this.memoedBestTool[block.type] != null) return this.memoedBestTool[block.type]

    const availableTools = this.tools
    const effects = this.bot.entity.effects

    const creative = this.bot.game.gameMode === 'creative'

    let fastest = Number.MAX_VALUE
    let bestTool = null as unknown as Item

    // if (creative === false)
    for (const tool of availableTools) {
      const enchants = tool.nbt != null ? nbt.simplify(tool.nbt).Enchantments : []
      const digTime = block.digTime(tool.type, creative, false, false, enchants, effects)
      if (digTime < fastest) {
        fastest = digTime
        bestTool = tool
      }
    }

    // // default to no tools used in creative.
    if (fastest === Number.MAX_VALUE) {
      fastest = block.digTime(null, creative, false, false, [], effects)
    }

    this.memoedBestTool[block.type] = bestTool
    this.memoedDigSpeed[block.type] = fastest
    return bestTool
  }

  public digCost (block: Block): number {
    if (this.memoedDigSpeed[block.type] != null) return this.memoedDigSpeed[block.type]
    this.bestHarvestingTool(block) // run it to fill everything in.

    return this.memoedDigSpeed[block.type]
  }
}
