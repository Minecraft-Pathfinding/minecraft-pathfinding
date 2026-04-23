import registry from 'prismarine-registry'
import block, { Block as PBlock } from 'prismarine-block'
import { initSetup } from '@nxg-org/mineflayer-physics-util/dist'

import { BlockInfo } from '../../src/mineflayer-specific/world/cacheWorld'

const initializedVersions = new Set<string>()

export function loadMcData(version: string) {
  const mcData = registry(version)
  if (!initializedVersions.has(version)) {
    initSetup(mcData)
    BlockInfo.init(mcData)
    initializedVersions.add(version)
  }

  return {
    mcData,
    Block: block(version) as typeof PBlock
  }
}

export type LoadedMcData = ReturnType<typeof loadMcData>
