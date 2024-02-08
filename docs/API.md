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
