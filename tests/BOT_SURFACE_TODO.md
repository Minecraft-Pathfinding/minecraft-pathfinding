# TODO: fake Bot surface checklist

This tracks every `Bot`-instance method call made by the pathfinder code and whether the fake rig already covers it.

Legend:
- `[x]` implemented
- `[ ]` missing
- `EventEmitter` means the fake bot gets the method by extending `EventEmitter` in [`tests/setup.ts`](./setup.ts)
- `physics.js` means the method is installed by [`mineflayer/lib/plugins/physics`](../node_modules/mineflayer/lib/plugins/physics.js) when the fake rig loads it in [`tests/setup.ts`](./setup.ts)

## EventEmitter surface

- [x] `emit` - inherited from `EventEmitter` via [`tests/setup.ts`](./setup.ts)
- [x] `on` - inherited from `EventEmitter` via [`tests/setup.ts`](./setup.ts)
- [x] `off` - inherited from `EventEmitter` via [`tests/setup.ts`](./setup.ts)
- [x] `once` - inherited from `EventEmitter` via [`tests/setup.ts`](./setup.ts)
- [x] `prependListener` - inherited from `EventEmitter` via [`tests/setup.ts`](./setup.ts)
- [x] `listenerCount` - inherited from `EventEmitter` via [`tests/setup.ts`](./setup.ts)

## Bot methods currently implemented in the fake rig

- [x] `blockAt` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `chat` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `clearControlStates` - installed by `physics.js` via [`tests/setup.ts`](./setup.ts)
- [x] `getControlState` - installed by `physics.js` via [`tests/setup.ts`](./setup.ts)
- [x] `getEquipmentDestSlot` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `hasPlugin` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `loadPlugin` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `loadPlugins` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `nearestEntity` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `look` - installed by `physics.js` via [`tests/setup.ts`](./setup.ts)
- [x] `lookAt` - installed by `physics.js` via [`tests/setup.ts`](./setup.ts)
- [x] `setControlState` - installed by `physics.js` via [`tests/setup.ts`](./setup.ts)
- [x] `waitForTicks` - installed by `physics.js` via [`tests/setup.ts`](./setup.ts)
- [x] `whisper` - implemented in [`tests/setup.ts`](./setup.ts)

## Bot methods the pathfinder calls and the fake rig now implements

- [x] `equip` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `unequip` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `updateHeldItem` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `activateItem` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `dig` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `stopDigging` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `blockAtCursor` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `_placeBlockWithOptions` - implemented in [`tests/setup.ts`](./setup.ts)
- [x] `digTime` - implemented in [`tests/setup.ts`](./setup.ts) to support tool-sensitive dig duration

## Notes

- The fake rig already uses the real pathfinder-facing event surface through `EventEmitter`, so event subscription and emission are covered.
- Digging is intentionally tick-count based: the fake rig respects the block's `digTime` converted to Minecraft ticks, but completion depends on emitted `physicsTick` events instead of wall-clock timers.
