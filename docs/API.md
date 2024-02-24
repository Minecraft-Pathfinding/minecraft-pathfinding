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
  - [GoalPlaceBlock](#goalplaceblock)
  - [GoalFollow](#goalfollow)
  - [GoalInvert](#goalinvert)
  - [GoalCompositeAny](#goalcompositeany)
  - [GoalCompositeAll](#goalcompositeall)
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


<h4>Properties</h4>

| Property | Type | Description |
| --- | --- | --- |
| `status` | [PathStatus](#pathStatus) | The status of the path. |
| `cost` | `number` | The cost of the path. |
| `calcTime` | `number` | The time it took to calculate the path. |
| `visitedNodes` | `number` | The number of nodes visited. |
| `generatedNodes` | `number` | The number of nodes generated. |
| `movementProvider` | `MovementProvider<Data>` | The movement provider. |
| `path` | `Data[]` | The path. |
| `context` | `Alg` | The algorithm context. |



<h2 align="center">Mineflayer-Specific</h2>


<h3>Path</h3>

```ts
interface Path extends APath<Move, AStar> {}
```

| Property | Type | Description |
| --- | --- | --- |
| `status` | [PathStatus](#pathStatus) | The status of the path. |
| `cost` | `number` | The cost of the path. |
| `calcTime` | `number` | The time it took to calculate the path. |
| `visitedNodes` | `number` | The number of nodes visited. |
| `generatedNodes` | `number` | The number of nodes generated. |
| `movementProvider` | `MovementProvider<Move>` | The movement provider. |
| `path` | `Move[]` | The path. |
| `context` | `AStar<Move>` | The astar context. |





<h3>PathStatus</h3>

```ts
type PathStatus = 'noPath' | 'timeout' | 'partial' | 'success' | 'partialSuccess'
```

The status of a path.

| Value | Description |
| --- | --- |
| `success` | The path was successful. |
| `partial` | The path is partial. |
| `partialSuccess` | The path is partial, but this section will be used to get to the goal. |
| `noPath` | No path was found. |
| `timeout` | The pathfinder timed out. |


<h3>PathGenerator</h3>

```ts
type PathGenerator = AsyncGenerator<PathGeneratorResult, PathGeneratorResult, void>

```

An async generator that generates partial paths until a successful path is found, or no path is found.

| Method | Description |
| --- | --- |
| `next() => Promise<PathGeneratorResult>` | Returns a promise that resolves to the next path result. |


<h3>PathGeneratorResult</h3>

```ts
interface PathGeneratorResult {
  result: Path
  astarContext: AAStar<Move>
}
```

The result of a path generator.

| Property | Type | Description |
| --- | --- | --- |
| `result` | [Path](#path) | The result of the path. |
| `astarContext` | AStar<Move> | The astar context. |


<h3>ResetReason</h3>

```ts
type ResetReason = 'blockUpdate' | 'chunkLoad' | 'goalUpdated'
```

The reason the path was reset. String value.

| Value | Description |
| --- | --- |
| `blockUpdate` | A block update was detected. |
| `goalUpdated` | The goal was updated. |
| `chunkLoad` | A chunk was unloaded. |






<h1 align="center">Goals</h1>

<h3>GoalBlock</h3>

`dynamic?:` No.
`automatically finishes?:` Yes.

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

`dynamic?:` No.
`automatically finishes?:` Yes.

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

`dynamic?:` No.
`automatically finishes?:` Yes.

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

`dynamic?:` No.
`automatically finishes?:` Yes.

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

 <h3>GoalPlaceBlock</h3>

 `dynamic?:` No.
`automatically finishes?:` Yes.

This goal will have the bot approach the coordinates chosen, finish when within a given radius, look at the coordinates chosen, and then finally place the block.


<h4>Constructor</h4>

| Parameter | Type | Description |
| --- | --- | --- |
| world | World | The world the block is in. |
| bPos | Vec3 | The position of the block. |
| item | Item | The item to place. |
| distance | number | The distance to the block. |
| height | number | The height of the block. |

<h4>Methods</h4>

▸ **fromInfo(`world: World`, `bPos: Vec3`, `item: Item`, `distance?: number`, `height?: number`): `GoalPlaceBlock`**

<h4>Example</h4>

```ts
GoalPlaceBlock.fromInfo(bot.world, new Vec3(0,0,0), bot.inventory.items()[0])
```


<h3>GoalFollow</h3>

`dynamic?:` Yes.
`automatically finishes?:` No. (customizable)

This goal will have the bot follow the entity chosen.

<h4>Constructor</h4>

| Parameter | Type | Description |
| --- | --- | --- |
| entity | Entity | The entity to follow. |
| range | number | The range to follow the entity. |
| opts | GoalDynamicOpts | The options for the goal. |




<h1 align="center">Settings</h1>

These are the currently available settings.


| Property | Type | Description | Default |
| --- | --- | --- | --- |
| `allowDiagonalBridging` | `boolean` | Whether or not to allow diagonal bridging. | `true` |
| `allowJumpSprint` | `boolean` | Whether or not to allow jump sprinting. | `true` |
| `allow1by1towers` | `boolean` | Whether or not to allow 1x1 towers. | `true` |
| `liquidCost` | `number` | The cost of moving through liquid. | `3` |
| `digCost` | `number` | The cost of digging. | `1` |
| `forceLook` | `boolean` | Whether or not to force the bot to look at the goal. | `true` |
| `jumpCost` | `number` | The cost of jumping. | `0.5` |
| `placeCost` | `number` | The cost of placing a block. | `2` |
| `velocityKillCost` | `number` | The cost of being killed by velocity. | `2` |
| `canOpenDoors` | `boolean` | Whether or not the bot can open doors. | `true` |
| `canDig` | `boolean` | Whether or not the bot can dig. | `true` |
| `canPlace` | `boolean` | Whether or not the bot can place blocks. | `true` |
| `dontCreateFlow` | `boolean` | Whether or not to create flow. | `false` |
| `dontMineUnderFallingBlock` | `boolean` | Whether or not to mine under a falling block. | `false` |
| `maxDropDown` | `number` | The maximum drop down distance. | `3` |
| `infiniteLiquidDropdownDistance` | `boolean` | Whether or not to have an infinite liquid dropdown distance. | `true` |
| `allowSprinting` | `boolean` | Whether or not to allow sprinting. | `true` |
| `careAboutLookAlignment` | `boolean` | Whether or not to care about look alignment. | `true` |


```ts
interface MovementOptions {
  allowDiagonalBridging: boolean
  allowJumpSprint: boolean
  allow1by1towers: boolean
  liquidCost: number
  digCost: number
  forceLook: boolean
  jumpCost: number
  placeCost: number
  velocityKillCost: number
  canOpenDoors: boolean
  canDig: boolean
  canPlace: boolean
  dontCreateFlow: boolean
  dontMineUnderFallingBlock: boolean

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





