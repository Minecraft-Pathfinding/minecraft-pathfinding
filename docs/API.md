<h3>Table of contents</h3>

- [Goals](#goals)
- [Settings](#settings)

## Goals
There is currently only one goal: `goals.GoalBlock`. You can easily make a goal via: `GoalBlock.fromVec(<vec3>)`

This goal will have the bot stand on top of the block chosen.

Code example:
```ts
const {Vec3} = require('vec3')
const {goals} = require('@nxg-org/mineflayer-pathfinder')

const {GoalBlock} = goals;


// ...

const goal = GoalBlock.fromVec(new Vec3(0, 0, 0))
```


### Pathfinder Usage
There is currently:
- bot.pathfinder.getPathTo(\<vec>)
- bot.pathfinder.getPathFromTo(\<startVec>, \<endVec>)

Both of these provide an async generator that generates partial paths until a successful path is found, or no path is found.

To move around, use:
- bot.pathfinder.goto(\<goal>)

This returns a Promise\<void>, so you can wait until it reaches its destination.

Code example:

```ts
const {createPlugin, goals} = require('@nxg-org/mineflayer-pathfinder')

const {GoalBlock} = goals;
const pathfinder = createPlugin();


bot.loadPlugin(pathfinder)

// ...

await bot.pathfinder.goto(GoalBlock.fromVec(0,0,0))
```

## Settings
There are already a lot of settings, but there will be *plenty* more.

```ts
export interface MovementOptions {
  forceLook: boolean;
  jumpCost: number;
  placeCost: number;
  canOpenDoors: boolean;
  canDig: boolean;
  dontCreateFlow: boolean;
  dontMineUnderFallingBlock: boolean;
  allow1by1towers:boolean
  maxDropDown:number;
  infiniteLiquidDropdownDistance:boolean;
  allowSprinting: boolean;
  careAboutLookAlignment: boolean;
}
```
- forceLook: whether or not the pathfinder uses `force` in `bot.lookAt`
- jumpCost: heuristic cost for jumping
- placeCost: heuristic cost for placing
- canOpenDoors: not used yet.
- canDig: whether or not the bot can dig.
- dontCreateFlow: care about liquid flowing when breaking blocks (keep this on).
- dontMineUnderFallingBlock: ouch, sand! (keep this on).
- allow1by1towers: figure it out. Keep it on, no issue with it not being on.
- maxDropDown: DEFAULT IS 4. max continous drop-down. 
- infiniteLiquidDropdownDistance: it's in the name.
- allowSprinting: yes.
- careAboutLookAlignment: With this off, moves can be started without having the proper look vector established. With forceLook on, this means nothing. With forceLook off, movements may become unreliable in exchange for faster execution while still being compliant with anticheats.
