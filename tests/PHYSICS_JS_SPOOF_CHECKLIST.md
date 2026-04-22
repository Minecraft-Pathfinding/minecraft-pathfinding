# physics.js spoof checklist

Goal: load `mineflayer/lib/plugins/physics` into the fake bot without crashing, while letting the plugin own `physicsTick`, `physicsTickBegin`, `look`, `lookAt`, `setControlState`, `getControlState`, `clearControlStates`, and `waitForTicks`.

Legend:
- `[x]` present in the fake rig before plugin load
- `[ ]` still needs spoofing
- `plugin` means the method or behavior is installed by `mineflayer/lib/plugins/physics`

## Required before `physics.js` injects

- [x] `bot` is an `EventEmitter`-like object in [`tests/setup.ts`](./setup.ts)
- [x] `bot.version` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.registry` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.position` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.velocity` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.onGround` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.yaw` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.pitch` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.effects` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.attributes` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.height` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.entity.width` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.inventory.slots` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.getEquipmentDestSlot()` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.blockAt()` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.supportFeature()` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.game.gameMode` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.inConfigurationPhase` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.physicsEnabled` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.isAlive` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.vehicle` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.moveVehicle()` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.dismount()` in [`tests/setup.ts`](./setup.ts)
- [x] `bot._client` with `on`, `once`, `off`, `removeListener`, and `write` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.jumpQueued` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.jumpTicks` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.flyJumpTriggerTime` in [`tests/setup.ts`](./setup.ts)
- [x] `bot.sprintTriggerTime` in [`tests/setup.ts`](./setup.ts)

## Behavior the plugin provides after load

- [x] `setControlState` - installed by `physics.js`
- [x] `getControlState` - installed by `physics.js`
- [x] `clearControlStates` - installed by `physics.js`
- [x] `waitForTicks` - installed by `physics.js`
- [x] `look` - installed by `physics.js`
- [x] `lookAt` - installed by `physics.js`
- [x] `controlState` - installed by `physics.js`
- [x] `physicsTickBegin` - emitted by `physics.js`
- [x] `physicsTick` - emitted by `physics.js`
- [x] `physicTick` - deprecated alias emitted by `physics.js`

## Notes

- The fake rig currently loads `mineflayer/lib/plugins/physics` inside [`tests/setup.ts`](./setup.ts), then emits `login` so the plugin starts its own physics timer.
- Because `physics.js` owns the tick loop, the fake rig should not keep a separate interval-based physics ticker.
- If a future path exercises vehicles, elytra, or packet-specific code more deeply, the remaining spoof surface will likely grow around `_client.write()` packet shapes and vehicle state.
