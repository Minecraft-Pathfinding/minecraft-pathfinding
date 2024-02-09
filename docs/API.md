<h3>Table of contents</h3>

- [Pathfinder](#pathfinder)
- [Goals](#goals)
  - [GoalBlock](#goalblock)
- [Settings](#settings)

<h1 align="center">Pathfinder</h1>

Base class of the Pathfinder in `bot.pathfinder` after the plugin has loaded.

<h3>Methods</h3>

▸ **getPathTo(`vec: Vec3`): `PathGenerator`**

Return an async generator that generates partial paths until a successful path is found, or no path is found.

▸ **getPathFromTo(`startVec: Vec3, endVec: Vec3`): `PathGenerator`**

Return an async generator that generates partial paths until a successful path is found, or no path is found.

▸ **goto(`goal: Goal`): `Promise<void>`**

Moves the bot to the goal.

<h3>Example</h3>

```ts
await bot.pathfinder.goto(GoalBlock.fromVec(0,0,0))
```


<h1 align="center">Goals</h1>

<h2>GoalBlock</h2>

This goal will have the bot stand on top of the block chosen.

<h3>Constructor</h3>

| Parameter | Type |
| --- | --- |
| x | number |
| y | number |
| z | number |

<h3>Methods</h3>

▸ **fromVec(`vec: Vec3`): `GoalBlock`**

▸ **fromBlock(`block: Block | { position: Vec3 }`): `GoalBlock`**

<h3>Example</h3>

```ts
GoalBlock.fromVec(new Vec3(0, 0, 0))
```


<h2>GoalNear</h2>

This goal will have the bot approach the coordinates chosen, and finish when within a given radius.

<h3>Constructor</h3>

| Parameter | Type |
| --- | --- |
| x | number |
| y | number |
| z | number |
| distance | number |

<h3>Methods</h3>

▸ **fromVec(`vec: Vec3`): `GoalNear`**

▸ **fromEntity(`entity: Entity | { position: Vec3 }`, `distance: number`): `GoalNear`**

▸ **fromBlock(`block: Block | { position: Vec3 }`): `GoalNear`**

<h3>Example</h3>

```ts
GoalNear.fromVec(new Vec3(0, 0, 0), 4)
GoalNear.fromEntity(bot.entities[...], 4)
GoalNear.fromBlock(bot.blockAt(new Vec3(0,0,0)), 4)
```

<h2>GoalNearXZ</h2>

This goal will have the bot approach the coordinates chosen, and finish when within a given radius on the XZ plane.

<h3>Constructor</h3>

| Parameter | Type |
| --- | --- |
| x | number |
| z | number |
| distance | number |

<h3>Methods</h3>

▸ **fromVec(`vec: Vec3`): `GoalNearXZ`**

<h3>Example</h3>

```ts
GoalNearXZ.fromVec(new Vec3(0, 0, 0), 4)
```

<h2>GoalLookAt</h2>

This goal will have the bot approach the coordinates chosen, finish when within a given radius, and finally look at the coordinates chosen.

<h3>Constructor</h3>

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

<h3>Methods</h3>

▸ **fromEntity(`world: World`, `entity: Entity | { position: Vec3 }`, `width: number`, `distance?: number`, `height?: number`): `GoalLookAt`**

▸ **fromBlock(`world: World`, `block: Block | { position: Vec3 }`, `distance?: number`, `height?: number`): `GoalLookAt`**

<h3>Example</h3>

```ts
// setup for targeting a player (width is 0.6 blocks)
GoalLookAt.fromEntity(bot.world, bot.entities[...], 0.6)
GoalLookAt.fromBlock(bot.world, bot.blockAt(new Vec3(0,0,0)))
```


<h2>GoalMineBlock</h2>

This goal will have the bot approach the coordinates chosen, finish when within a given radius, look at the coordinates chosen, and then finally break the block.

<h3>Constructor</h3>

| Parameter | Type |
| --- | --- |
| world | World |
| block | Block |
| distance | number |
| eyeHeight | number |

<h3>Methods</h3>


▸ **fromBlock(`world: World`, `block: Block`, `distance?: number`, `height?: number`): `GoalLookAt`**

<h3>Example</h3>

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
