<h4>Table of contents</h4>

- [Pathfinder](#pathfinder)
- [Types](#types)
  - [Abstract](#abstract)
    - [APath](#apath)
    - [PathStatus](#pathStatus)
    - [PathGenerator](#pathGenerator)
    - [PathGeneratorResult](#pathGeneratorResult)
  - [Mineflayer-Specific](#mineflayer-specific)
    - [Path](#path)
    - [PathGenerator](#pathGenerator)
    - [PathGeneratorResult](#pathGeneratorResult)
    - [ResetReason](#resetReason)
- [Goals](#goals)
  - [GoalBlock](#goalblock)
  - [GoalNear](#goalnear)
  - [GoalNearXZ](#goalnearxz)
  - [GoalLookAt](#goallookat)
  - [GoalMineBlock](#goalmineblock)
- [Settings](#settings)
- [Events](#events)
  - [pathGenerated](#pathGenerated)
  - [goalSet](#goalSet)
  - [goalFinished](#goalFinished)
  - [goalAborted](#goalAborted)
  - [enteredRecovery](#enteredRecovery)
  - [exitedRecovery](#exitedRecovery)
  - [resetPath](#resetPath)

<h1 align="center">Pathfinder</h1>

Base class of the Pathfinder in `bot.pathfinder` after the plugin has loaded.

<h4>Methods</h4>

▸ **getPathTo(`vec: Vec3`): `PathGenerator`**

Return an async generator that generates partial paths until a successful path is found, or no path is found.

▸ **getPathFromTo(`startVec: Vec3, endVec: Vec3`): `PathGenerator`**

Return an async generator that generates partial paths until a successful path is found, or no path is found.

▸ **goto(`goal: Goal`): `Promise<void>`**

Moves the bot to the goal.

<h4>Example</h4>

```ts
await bot.pathfinder.goto(GoalBlock.fromVec(0,0,0))
```



<h1 align="center">Types</h1>

<h2 align="center">Abstract</h2>

<h4>APath</h4>

```ts
type Path<Data extends PathData, Alg extends Algorithm<Data>>
```

<h4>Generics</h4>
| Generics | Base | Description |
| --- | --- | --- |
| `Data` | `PathData` | The data type of the path. |
| `Alg` | `Algorithm<Data>` | The algorithm type of the path. |


<h4>Elements</h4>
| Property | Type | Description |
| --- | --- | --- |
| `status`` | [PathStatus](#pathStatus) | The status of the path. |
| `cost` | `number` | The cost of the path. |
| `calcTime` | `number` | The time it took to calculate the path. |
| `visitedNodes` | `number` | The number of nodes visited. |
| `generatedNodes` | `number` | The number of nodes generated. |
| `movementProvider` | `MovementProvider<Data>` | The movement provider. |
| `path` | `Data[]` | The path. |
| `context` | `Alg` | The algorithm context. |


<h4>ResetReason</h4>

```ts
type ResetReason = 'blockUpdate' | 'chunkLoad' | 'goalUpdated'
```

The reason the path was reset. String value.

| Value | Description |
| --- | --- |
| `blockUpdate` | A block update was detected. |
| `goalUpdated` | The goal was updated. |
| `chunkLoad` | A chunk was unloaded. |




<h2 align="center">Mineflayer-Specific</h2>


<h3>Path</h3>



<h3>PathStatus</h3>

The status of a path. String value.

| Value | Description |
| --- | --- |
| `success` | The path was successful. |
| `partial` | The path is partial. |
| `partialSuccess` | The path is partial, but this section will be used to get to the goal. |
| `noPath` | No path was found. |
| `timeout` | The pathfinder timed out. |


<h3>PathGenerator</h3>

An async generator that generates partial paths until a successful path is found, or no path is found.

| Method | Description |
| --- | --- |
| `next() => Promise<PathGeneratorResult>` | Returns a promise that resolves to the next path result. |


<h3>PathGeneratorResult</h3>

The result of a path generator.

| Property | Type | Description |
| --- | --- | --- |
| `result` | [Path](#path) | The result of the path. |
| `astarContext` | AStar<Move> | The astar context. |





<h1 align="center">Goals</h1>

<h3>GoalBlock</h3>

This goal will have the bot stand on top of the block chosen.

<h4>Constructor</h4>

| Parameter | Type |
| --- | --- |
| x | number |
| y | number |
| z | number |

<h4>Methods</h4>

▸ **fromVec(`vec: Vec3`): `GoalBlock`**

▸ **fromBlock(`block: Block | { position: Vec3 }`): `GoalBlock`**

<h4>Example</h4>

```ts
GoalBlock.fromVec(new Vec3(0, 0, 0))
```


<h3>GoalNear</h3>

This goal will have the bot approach the coordinates chosen, and finish when within a given radius.

<h4>Constructor</h4>

| Parameter | Type |
| --- | --- |
| x | number |
| y | number |
| z | number |
| distance | number |

<h4>Methods</h4>

▸ **fromVec(`vec: Vec3`): `GoalNear`**

▸ **fromEntity(`entity: Entity | { position: Vec3 }`, `distance: number`): `GoalNear`**

▸ **fromBlock(`block: Block | { position: Vec3 }`): `GoalNear`**

<h4>Example</h4>

```ts
GoalNear.fromVec(new Vec3(0, 0, 0), 4)
GoalNear.fromEntity(bot.entities[...], 4)
GoalNear.fromBlock(bot.blockAt(new Vec3(0,0,0)), 4)
```

<h3>GoalNearXZ</h3>

This goal will have the bot approach the coordinates chosen, and finish when within a given radius on the XZ plane.

<h4>Constructor</h4>

| Parameter | Type |
| --- | --- |
| x | number |
| z | number |
| distance | number |

<h4>Methods</h4>

▸ **fromVec(`vec: Vec3`): `GoalNearXZ`**

<h4>Example</h4>

```ts
GoalNearXZ.fromVec(new Vec3(0, 0, 0), 4)
```

<h3>GoalLookAt</h3>

This goal will have the bot approach the coordinates chosen, finish when within a given radius, and finally look at the coordinates chosen.

<h4>Constructor</h4>

| Parameter | Type |
| --- | --- |
| world | World |
| x | number |
| y | number |
| z | number |
| width | number |
| height | number |
| distance | number |
| eyeHeight | number |

<h4>Methods</h4>

▸ **fromEntity(`world: World`, `entity: Entity | { position: Vec3 }`, `width: number`, `distance?: number`, `height?: number`): `GoalLookAt`**

▸ **fromBlock(`world: World`, `block: Block | { position: Vec3 }`, `distance?: number`, `height?: number`): `GoalLookAt`**

<h4>Example</h4>

```ts
// setup for targeting a player (width is 0.6 blocks)
GoalLookAt.fromEntity(bot.world, bot.entities[...], 0.6)
GoalLookAt.fromBlock(bot.world, bot.blockAt(new Vec3(0,0,0)))
```


<h3>GoalMineBlock</h3>

This goal will have the bot approach the coordinates chosen, finish when within a given radius, look at the coordinates chosen, and then finally break the block.

<h4>Constructor</h4>

| Parameter | Type |
| --- | --- |
| world | World |
| block | Block |
| distance | number |
| eyeHeight | number |

<h4>Methods</h4>


▸ **fromBlock(`world: World`, `block: Block`, `distance?: number`, `height?: number`): `GoalLookAt`**

<h4>Example</h4>

```ts
GoalMineBlock.fromBlock(bot.world, bot.blockAt(new Vec3(0,0,0)))
```


<h1 align="center">Settings</h1>

These are the currently available settings.

| Property | Type | Description | Default |
| --- | --- | --- | --- |
| `forceLook` | `boolean` | Whether or not the pathfinder uses `force` in `bot.lookAt`. | `true` |
| `jumpCost` | `number` | Heuristic cost for jumping. | `0.5` |
| `placeCost` | `number` | Heuristic cost for placing. | `2` |
| `canOpenDoors` | `boolean` | Not used yet. | `true` |
| `canDig` | `boolean` | Whether or not the bot can dig. | `true` |
| `dontCreateFlow` | `boolean` | Care about liquid flowing when breaking blocks (keep this on). | `true` |
| `dontMineUnderFallingBlock` | `boolean` | Don't mine a block that could cause gravity-affected blocks to fall (keep this on). | `true` |
| `allow1by1towers` | `boolean` | Allow 1 by 1 towers. Keep it on, no issue with it not being on. | `true` |
| `maxDropDown` | `number` | Max continuous dropdown. | `3` |
| `infiniteLiquidDropdownDistance` | `boolean` | Dropdown distance is infinite if it finds a liquid at the bottom. | `true` |
| `allowSprinting` | `boolean` | Allow sprinting. | `true` |
| `careAboutLookAlignment` | `boolean` | With this off, moves can be started without having the proper look vector established. With `forceLook` on, this means nothing. With `forceLook` off, movements may become unreliable in exchange for faster execution while still being compliant with anticheats. | `true` |


```ts
export interface MovementOptions {
  forceLook: boolean
  jumpCost: number
  placeCost: number
  canOpenDoors: boolean
  canDig: boolean
  dontCreateFlow: boolean
  dontMineUnderFallingBlock: boolean
  allow1by1towers: boolean
  maxDropDown: number
  infiniteLiquidDropdownDistance: boolean
  allowSprinting: boolean
  careAboutLookAlignment: boolean
}
```



<h1 align="center">Events</h1>


<h3>pathGenerated</h3>

Fired when a path is generated.

<h4>Arguments</h4>

| Parameter | Type |
| --- | --- |
| path | [Path](#path) |

<h4>Example</h4>

```ts
bot.on('pathGenerated', (path) => {
  console.log(`Path generated: ${path}`)
})
```



<h3>goalSet</h3>

Fired when a new goal is set.

<h4>Arguments</h4>

| Parameter | Type |
| --- | --- |
| goal | goals.Goal |


<h4>Example</h4>

```ts
bot.on('goalSet', (goal) => {
  console.log(`New goal set: ${goal}`)
})
```

<h3>goalFinished</h3>

Fired when a goal is finished.

<h4>Arguments</h4>

| Parameter | Type |
| --- | --- |
| goal | goals.Goal |

<h4>Example</h4>

```ts
bot.on('goalFinished', (goal) => {
  console.log(`Goal finished: ${goal}`)
})
```

<h3>goalAborted</h3>

Fired when a goal is aborted.

<h4>Arguments</h4>

| Parameter | Type |
| --- | --- |
| goal | goals.Goal |

<h4>Example</h4>

```ts
bot.on('goalAborted', (goal) => {
  console.log(`Goal aborted: ${goal}`)
})
```

<h3>enteredRecovery</h3>

Fired when the bot enters recovery mode.

<h4>Example</h4>

```ts
bot.on('enteredRecovery', () => {
  console.log(`Entered recovery mode`)
})
```

<h3>exitedRecovery</h3>

Fired when the bot exits recovery mode.

<h4>Example</h4>

```ts
bot.on('exitedRecovery', () => {
  console.log(`Exited recovery mode`)
})
```

<h3>resetPath</h3>

Fired when the bot resets the path.

<h4>Arguments</h4>

| Parameter | Type |
| --- | --- |
| reason | [ResetReason](#resetReason) |

<h4>Example</h4>

```ts
bot.on('resetPath', (reason) => {
  console.log(`Path reset: ${reason}`)
})
```





