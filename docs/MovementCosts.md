<h1 align="center">Movement Costs</h1>

How the pathfinder decides which way to go. Every possible move is given a
**cost**, and A\* looks for the route with the smallest total cost.

This page explains what that cost means, where the numbers come from, and the
few knobs you can turn.

- [Cost means time](#cost-means-time)
- [The tick constants](#the-tick-constants)
- [What each move costs](#what-each-move-costs)
- [The heuristic](#the-heuristic)
- [Knobs you can tune](#knobs-you-can-tune)

## Cost means time

A cost is **how long the bot is busy doing the move, measured in game ticks**.

Minecraft runs at **20 ticks per second**, so one tick is 1/20 of a second.
Lower cost means faster, which means better.

Everything is measured in the same unit (ticks), which is the whole point. When
walking, jumping, falling and digging are all expressed as *time*, the pathfinder
can compare them honestly. It can answer a question like "is it faster to dig
straight through this hill or walk around it", because both options are just
numbers of ticks.

> Before this, moves used made-up numbers (walk was `1`, diagonal `1.41`, a jump
> `+0.5`, a 3-block drop `+1.5`). Those numbers had no real-world meaning, so the
> bot sometimes preferred routes that *looked* cheap but were actually slow.

### Credit

These cost numbers, and the heuristic shape further down, come from
[**Baritone**](https://github.com/cabaletta/baritone), the Minecraft pathfinding
mod by **Leijurv and contributors** (licensed **LGPL-3.0**). The constants come
from its `ActionCosts` interface
(`src/main/java/baritone/pathing/movement/ActionCosts.java`), and the heuristic
from its `GoalXZ` and `GoalYLevel`. They are hardcoded estimates (`20 / speed`)
rather than a live physics simulation, so they are close to reality and very
fast to compute. They live in
[`src/mineflayer-specific/movements/costs.ts`](../src/mineflayer-specific/movements/costs.ts).

## The tick constants

| Constant | Ticks | Meaning |
| --- | --- | --- |
| `SPRINT_ONE_BLOCK_COST` | 3.564 | Sprint one block, the fastest ground travel. |
| `WALK_ONE_BLOCK_COST` | 4.633 | Walk one block. |
| `WALK_OFF_BLOCK_COST` | 3.706 | Step off the edge of a block (start of a drop). |
| `CENTER_AFTER_FALL_COST` | 0.927 | Re-center after landing. |
| `JUMP_ONE_BLOCK_COST` | 3.163 | The upward arc of a jump. |
| `LADDER_UP_ONE_COST` | 8.511 | Climb up one block on a ladder or vine. |
| `LADDER_DOWN_ONE_COST` | 6.667 | Climb down one block. |
| `WALK_ONE_IN_WATER_COST` | 9.091 | Swim or walk one block while in water. |
| `WALK_ONE_OVER_SOUL_SAND_COST` | 9.266 | Walk one block over soul sand. |
| `SNEAK_ONE_BLOCK_COST` | 15.385 | Sneak one block. |
| `FALL_N_BLOCKS_COST[n]` | table | Ticks to fall `n` blocks. Not linear, because you speed up as you fall. |
| `COST_INF` | 1,000,000 | "Impossible." Any move this expensive is thrown away. |

## What each move costs

Each movement provider in
[`movementProviders.ts`](../src/mineflayer-specific/movements/movementProviders.ts)
adds up the ticks for the thing it does.

| Move | Base cost (ticks) |
| --- | --- |
| **Forward** | `travelCost(1)`, sprint or walk one block. |
| **Diagonal** | `travelCost(√2)`, because a diagonal block is √2 blocks of travel. |
| **ForwardJump** (up 1) | `max(JUMP, WALK)`. You rise and move at the same time, so it is the slower of the two, not the sum. |
| **ForwardDropDown** | `WALK_OFF_BLOCK_COST + FALL_N_BLOCKS_COST[height]`. |
| **StraightDown** | `FALL_N_BLOCKS_COST[height]`, pure falling with no sideways travel. |
| **StraightUp** | On a ladder, `LADDER_UP_ONE_COST`. Otherwise `JUMP_ONE_BLOCK_COST` plus a place cost to tower up. |
| **ParkourForward** | `JUMP_ONE_BLOCK_COST + travelCost(gap)`, the jump plus sprinting across the gap. |
| **ParkourDiagonal** | `JUMP_ONE_BLOCK_COST + travelCost(gap)`. |

On top of the base cost a move also pays for any blocks it must **break**
(`breakCost`, the block's real mining time in ticks) or **place** (`placeCost`).
`travelCost(blocks)` is a small helper on `Movement` that returns
`blocks × (sprinting ? SPRINT : WALK)`.

## The heuristic

A\* also needs to *guess* the remaining cost from any point to the goal. That
guess is the **heuristic** (in [`goals.ts`](../src/mineflayer-specific/goals.ts)).
Its shape is Baritone's (`GoalXZ` and `GoalYLevel`). It splits the guess into a
horizontal part and a vertical part instead of one 3D straight-line distance,
because the bot moves that way. It travels along the 8 compass directions on the
ground, and up or down is a separate jump or fall.

```
heuristic = heuristicXZ(dx, dz) + heuristicY(dy)

heuristicXZ   split into a diagonal run (shorter axis, √2 per block) and a
              straight run (the rest), then times COST_HEURISTIC    (octile)
heuristicY    going up    costs dy × JUMP_ONE_BLOCK_COST
              going down  costs dy × FALL_N_BLOCKS_COST[2] / 2
```

### Walk weight vs sprint weight (where we differ from Baritone)

`COST_HEURISTIC` is the **walk** cost per block (4.633), not the cheaper
**sprint** cost (3.564). **Baritone uses sprint** (its `costHeuristic` default is
about 3.563), which never over-estimates the cheapest move, so Baritone's A\* is
guaranteed to return the optimal path. We deliberately use walk instead, and the
reason is measured, not guessed.

- This A\* uses a plain binary heap with **no f-tie-breaker**. With the admissible
  sprint weight, open ground fills with a plateau of equal-cost nodes and the
  search floods through them. On a flat `150×40` goal that was about **4300 nodes
  visited**. The walk weight visits about **150** for the same path, roughly
  **28×** less work. Baritone dodges this with tie-breaking and short path
  segments that this implementation does not have.
- Using walk runs a lightly **weighted** A\*. It leans toward the goal and
  beelines, which is fast. The price is that paths can be up to about `1.3×`
  (`walk / sprint`) the optimum, which is small and bounded.
- Before move costs were in ticks (about 1 per block) the heuristic was already
  about 4.633, so that ratio was about **4.6×**. Tick costs already shrank it to
  about **1.3×**.

In short, we took Baritone's heuristic shape, which is a clear win, and kept a
walk weight for speed because our A\* cannot afford the admissible version. Node
counts stay as fast as before, with much better path quality.

## Knobs you can tune

Pass these in `moveSettings` (see [AdvancedUsage](./AdvancedUsage.md)). All are
in ticks. The defaults are tuned to match reality, so you rarely need to change
them.

| Option | Default | What it does |
| --- | --- | --- |
| `liquidCost` | `WALK_ONE_IN_WATER - WALK_ONE_BLOCK` (about 4.46) | Extra ticks per block for moving through water. |
| `placeCost` | `20` | Ticks charged for placing a block. Placing interrupts movement, so it is deliberately expensive (Baritone's value). |
| `digCost` | `1` | Multiplier on a block's real mining time. Raise it to make digging look worse and prefer going around. |
| `jumpCost` | `0` | Extra ticks per jump on top of the physical jump arc. Raise it to discourage jumpy paths. |

An example that makes the bot hate digging and never want to swim:

```js
bot.pathfinder.setMoveOptions({
  digCost: 5,      // mining looks 5x slower than it is
  liquidCost: 40   // water is very costly per block
})
```
