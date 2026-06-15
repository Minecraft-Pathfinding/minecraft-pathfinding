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
    - [GoalDynamicOpts](#goalDynamicOpts)
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
- [Exclusion Zones](#exclusion-zones)
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
The pathfinder snapshots the active movement and optimizer maps at the start of each `goto`, so runtime changes only affect future calls.

▸ **setExecutor(`provider: BuildableMoveProvider, executor: BuildableMoveExecutor | MovementExecutor`): `void`**

Registers or replaces the executor for a movement provider.

▸ **setOptimizer(`provider: BuildableMoveProvider, optimizer: BuildableMoveOptimizer | MovementOptimizer, executor?: BuildableMoveExecutor | MovementExecutor`): `void`**

Registers or replaces the optimizer for a movement provider. The optional third argument only applies to optimized moves.

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
| `visitedNodes` | `number` | The `number` of nodes visited. |
| `generatedNodes` | `number` | The `number` of nodes generated. |
| `movementProvider` | `MovementProvider<Data>` | The movement provider. |
| `path` | `Data[]` | The path. |
| `context` | `Alg` | The algorithm context. |



<h2 align="center">Mineflayer-Specific</h2>


<h3>Path</h3>

```ts
interface Path<T extends AStar = AStar> extends APath<Move, MovementHandler, T> {
  movementProvider: MovementHandler
}
```

| Property | Type | Description |
| --- | --- | --- |
| `status` | [PathStatus](#pathStatus) | The status of the path. |
| `cost` | `number` | The cost of the path. |
| `calcTime` | `number` | The time it took to calculate the path. |
| `visitedNodes` | `number` | The `number` of nodes visited. |
| `generatedNodes` | `number` | The `number` of nodes generated. |
| `movementProvider` | `MovementHandler` | The movement provider. |
| `path` | `Move[]` | The path. |
| `context` | `AStar` | The astar context. |





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
type PathGenerator = AsyncGenerator<PathGeneratorResult, PathGeneratorResult | null, unknown>

```

An async generator that generates partial paths until a successful path is found, or no path is found.

| Method | Description |
| --- | --- |
| `next() => Promise<PathGeneratorResult>` | Returns a promise that resolves to the next path result. |


<h3>PathGeneratorResult</h3>

```ts
interface PathGeneratorResult {
  result: Path
  astarContext: AAStar<Move, MovementHandler>
}
```

The result of a path generator.

| Property | Type | Description |
| --- | --- | --- |
| `result` | [Path](#path) | The result of the path. |
| `astarContext` | `AAStar<Move, MovementHandler>` | The astar context. |


<h3>ResetReason</h3>

```ts
type ResetReason = 'blockUpdate' | 'chunkLoad' | 'goalUpdated'
```

The reason the path was reset. String value.

| Value | Description |
| --- | --- |
| `blockUpdate` | A `block` update was detected. |
| `goalUpdated` | The goal was updated. |
| `chunkLoad` | A chunk was unloaded. |


<h3>GoalDynamicOpts</h3>

```ts
interface GoalDynamicOpts {
  dynamic: boolean
  neverfinish: boolean
}
```

The options for a dynamic goal.

| Property | Type | Description | Default |
| --- | --- | --- | --- |
| `dynamic` | `boolean` | Whether or not the goal is dynamic. | `true` |
| `neverfinish` | `boolean` | Whether or not the goal will never finish. | `false` |




<h1 align="center">Goals</h1>

<h2>Goal Properties</h2>

| Property | Type | Description |
| --- | --- | --- |
| `dynamic` | `boolean` | Whether or not the goal is capable of moving. |
| `neverfinish` | `boolean` | Whether or not the goal will never finish. (Used for goals like following) |


<h3>GoalBlock</h3>

`dynamic?:` No.

`automatically finishes?:` Yes.

This goal will have the bot stand on top of the `block` chosen.

<h4>Constructor</h4>

| Parameter | Type |
| --- | --- |
| `x`| `number` |
| `y`  | `number` |
| `y`| `number` |

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
| `x`| `number` |
| `y`  | `number` |
| `y`| `number` |
| `distance` | `number` |

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
| `x`| `number` |
| `y`| `number` |
| `distance` | `number` |

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
| `world` | `World` |
| `x`| `number` |
| `y`  | `number` |
| `y`| `number` |
| `width` | `number` |
| `height` | `number` |
| `distance` | `number` |
| `eyeHeight` | `number` |

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
| `world` | `World` |
| `block` | `Block` |
| `distance` | `number` |
| `eyeHeight` | `number` |

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
| `world` | `World` | The world the block is in. |
| `bPos` | `Vec3` | The position of the block. |
| `item` | `Item` | The item to place. |
| `distance` | `number` | The distance to the block. |
| `height` | `number` | The height of the block. |

<h4>Methods</h4>

▸ **fromInfo(`world: World`, `bPos: Vec3`, `item: Item`, `distance?: number`, `height?: number`): `GoalPlaceBlock`**

<h4>Example</h4>

```ts
GoalPlaceBlock.fromInfo(bot.world, new Vec3(0,0,0), bot.inventory.items()[0])
```


<h3>GoalFollow</h3>

`dynamic?:` Yes. (customizable)

`automatically finishes?:` No. (customizable)

This goal will have the bot follow the entity chosen.

<h4>Constructor</h4>

| Parameter | Type | Description |
| --- | --- | --- |
| entity | Entity | The entity to follow. |
| range | `number` | The range to follow the entity. |
| opts | [GoalDynamicOpts](#goalDynamicOpts) | The options for the goal. |


<h4>Methods</h4>

▸ **fromEntity(`entity: Entity`, `range: number`, `opts?: GoalDynamicOpts`): `GoalFollow`**


<h4>Example</h4>

```ts
GoalFollow.fromEntity(bot.entities[...], 4)
```

<h3>GoalInvert</h3>

`dynamic?:` Based on given goals.

`automatically finishes?:` Based on given goals.

This goal will have the bot invert the goal chosen.

<h4>Generics></h4>

| Generics | Base | Description |
| --- | --- | --- |
| `G` | `Goal` | The goal to invert. (for ease-of-use, not necessary) |


<h4>Constructor</h4>

| Parameter | Type | Description |
| --- | --- | --- |
| goal | [Goal](#goal) | The goal to invert. |

<h4>Methods</h4>

▸ **from(`goal: G1`): `GoalInvert<G1>`**

<h4>Example</h4>

```ts
GoalInvert.from(GoalBlock.fromVec(new Vec3(0,0,0)))
```

<h3>GoalCompositeAny</h3>

`dynamic?:` Based on given goals.

`automatically finishes?:` Based on given goals.

This goal will have the bot complete any of the goals chosen.

<h4>Generics></h4>

| Generics | Base | Description |
| --- | --- | --- |
| `Gls` | `Goal[]` | The typings for the goals given. |


<h4>Constructor</h4>

| Parameter | Type | Description |
| --- | --- | --- |
| goals | `Gls` | The goals to complete. |

<h4>Methods</h4>

▸ **from(`...goals: Gls`): `GoalCompositeAny<Gls>`**


<h4>Example</h4>

```ts

const goal0 = GoalBlock.fromVec(new Vec3(0,0,0))
const goal1 = GoalBlock.fromVec(new Vec3(0,0,0))

const gls = [goal0, goal1]

GoalCompositeAny.from(...gls), 
```

<h3>GoalCompositeAll</h3>

`dynamic?:` Based on given goals.

`automatically finishes?:` Based on given goals.

This goal will have the bot complete all of the goals chosen.

<h4>Generics></h4>

| Generics | Base | Description |
| --- | --- | --- |
| `Gls` | `Goal[]` | The typings for the goals given. |

<h4>Constructor</h4>

| Parameter | Type | Description |
| --- | --- | --- |
| goals | `Gls` | The goals to complete. |

<h4>Methods</h4>

▸ **from(`...goals: Gls`): `GoalCompositeAll<Gls>`**

<h4>Example</h4>

```ts

const goal0 = GoalBlock.fromVec(new Vec3(0,0,0))
const goal1 = GoalBlock.fromVec(new Vec3(0,0,0))

const gls = [goal0, goal1]

GoalCompositeAll.from(...gls), 
```





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
| `exclusionAreasStep` | `ExclusionArea[]` | "Keep out" rules for blocks the bot would **stand in**. See [Exclusion Zones](#exclusion-zones). | `[]` |
| `exclusionAreasBreak` | `ExclusionArea[]` | "Keep out" rules for blocks the bot would **break** (mine). | `[]` |
| `exclusionAreasPlace` | `ExclusionArea[]` | "Keep out" rules for blocks the bot would **place** (build on). | `[]` |


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

  movementTimeoutMs: number

  // "Keep out" zones. Empty by default. See the Exclusion Zones section below.
  exclusionAreasStep: ExclusionArea[]
  exclusionAreasBreak: ExclusionArea[]
  exclusionAreasPlace: ExclusionArea[]
}

```



<h1 align="center">Exclusion Zones</h1>

Exclusion zones let you tell the bot **"keep out of here"** — either softly (an
area is allowed but more expensive, so the bot prefers to go around) or hard
(an area is completely off-limits). This is the same idea as upstream
[`PrismarineJS/mineflayer-pathfinder`](https://github.com/PrismarineJS/mineflayer-pathfinder),
so exclusion functions you wrote for that library keep working here.

<h3>How it works</h3>

An **exclusion area** is just a function. You give it one block, and it returns
the *extra cost* of using that block:

```ts
type ExclusionArea = (block: BlockInfo) => number
```

- return `0` &rarr; "I don't care about this block."
- return a positive number (e.g. `50`) &rarr; a **soft** zone: the bot may use the block, but it costs that much more, so it avoids it when there is a cheaper way around.
- return `EXCLUSION_NEVER` (a.k.a. `Infinity`) &rarr; a **hard** zone: the bot will never use this block. Any value `>= COST_INF` counts as "never".

There are three independent lists in the settings, one per kind of action:

| Setting | Asked about every block the bot would… |
| --- | --- |
| `exclusionAreasStep` | **stand in** / walk into (checked on the block the bot's feet end up in, for every movement type: walking, jumping, dropping, parkour, towers). |
| `exclusionAreasBreak` | **break** (mine). |
| `exclusionAreasPlace` | **place** (build on). |

> When all three lists are empty (the default), exclusion costs nothing to
> evaluate — there is zero overhead for normal pathfinding.

<h3>Ready-made zone shapes</h3>

You usually don't need to write the function yourself. These helpers build the
common shapes for you (all are exported from the package root):

▸ **createBoxExclusion(`corner1: Vec3, corner2: Vec3, cost = EXCLUSION_NEVER`): `ExclusionArea`**

A box between two opposite corners (inclusive, any order — like a WorldEdit selection).

▸ **createRadiusExclusion(`center: Vec3, radius: number, cost = EXCLUSION_NEVER`): `ExclusionArea`**

A ball (sphere): every block within `radius` of `center`. Height counts.

▸ **createColumnRadiusExclusion(`center: Vec3, radius: number, cost = EXCLUSION_NEVER`): `ExclusionArea`**

A pillar (vertical column): like the ball, but it ignores height — only X/Z distance matters.

<h3>Examples</h3>

```ts
const { Vec3 } = require('vec3')
const {
  createBoxExclusion,
  createRadiusExclusion,
  createColumnRadiusExclusion
} = require('@nxg-org/mineflayer-pathfinder')

// 1) Hard no-go box: the bot will never set foot in this region.
const spawnArea = createBoxExclusion(new Vec3(-10, 60, -10), new Vec3(10, 80, 10))

// 2) Soft danger zone: the bot may pass within 8 blocks of the turret,
//    but only if going around would be even more expensive.
const turret = createRadiusExclusion(new Vec3(100, 64, 100), 8, 60)

// 3) Never dig or build inside the protected spawn box.
const protectedBox = createBoxExclusion(new Vec3(-10, 0, -10), new Vec3(10, 320, 10))

bot.pathfinder.setMoveOptions({
  exclusionAreasStep: [spawnArea, turret],
  exclusionAreasBreak: [protectedBox],
  exclusionAreasPlace: [protectedBox]
})
```

You can also write a fully custom rule — any function `(block) => number` works:

```ts
// Avoid stepping on farmland so the bot never tramples crops.
const farmlandId = bot.registry.blocksByName.farmland.id
const dontTrample = (block) => block.type === farmlandId ? 100 : 0

bot.pathfinder.setMoveOptions({ exclusionAreasStep: [dontTrample] })
```

> **Note:** `exclusionAreasStep` is checked on the block the bot's **feet** land
> in. If you need to guarantee the bot's head also stays out of a region, make
> the box one block taller at the bottom.



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





