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

## Bot methods the pathfinder calls but the fake rig still does not implement

- [ ] `equip` - called from [`src/mineflayer-specific/goals.ts`](../src/mineflayer-specific/goals.ts) and [`src/mineflayer-specific/movements/interactionUtils.ts`](../src/mineflayer-specific/movements/interactionUtils.ts)
- [ ] `unequip` - called from [`src/mineflayer-specific/goals.ts`](../src/mineflayer-specific/goals.ts) and [`src/mineflayer-specific/movements/interactionUtils.ts`](../src/mineflayer-specific/movements/interactionUtils.ts)
- [ ] `updateHeldItem` - called from [`src/mineflayer-specific/goals.ts`](../src/mineflayer-specific/goals.ts) and [`src/mineflayer-specific/movements/interactionUtils.ts`](../src/mineflayer-specific/movements/interactionUtils.ts)
- [ ] `activateItem` - called from [`src/mineflayer-specific/movements/interactionUtils.ts`](../src/mineflayer-specific/movements/interactionUtils.ts)
- [ ] `dig` - called from [`src/mineflayer-specific/goals.ts`](../src/mineflayer-specific/goals.ts) and [`src/mineflayer-specific/movements/interactionUtils.ts`](../src/mineflayer-specific/movements/interactionUtils.ts)
- [ ] `stopDigging` - called from [`src/mineflayer-specific/movements/interactionUtils.ts`](../src/mineflayer-specific/movements/interactionUtils.ts)
- [ ] `blockAtCursor` - called from [`src/mineflayer-specific/movements/movementExecutor.ts`](../src/mineflayer-specific/movements/movementExecutor.ts)
- [ ] `_placeBlockWithOptions` - called from [`src/mineflayer-specific/movements/interactionUtils.ts`](../src/mineflayer-specific/movements/interactionUtils.ts)

## Notes

- The fake rig already uses the real pathfinder-facing event surface through `EventEmitter`, so event subscription and emission are covered.
- If any of the missing methods become required by a test or by a new code path, they should be added to [`tests/setup.ts`](./setup.ts) with the smallest useful behavior for simulation.
