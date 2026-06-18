<h1 align="center">Movement Costs</h1>

How the pathfinder decides which way to go: every possible move is given a
**cost**, and A\* looks for the route with the smallest total cost.

This page explains what that cost means, where the numbers come from, and the
few knobs you can turn.

- [The big idea: cost = time](#the-big-idea-cost--time)
- [The tick constants](#the-tick-constants)
- [What each move costs](#what-each-move-costs)
- [The heuristic (A\*'s guess)](#the-heuristic-as-guess)
- [Knobs you can tune](#knobs-you-can-tune)

## The big idea: cost = time

A cost is **how long the bot is busy doing the move, measured in game ticks**.

Minecraft runs at **20 ticks per second**, so one tick is 1/20 of a second.
Lower cost = faster = better.

Everything is measured in the same unit (ticks), which is the whole point. When
walking, jumping, falling, and digging are all expressed as *time*, the
pathfinder can compare them honestly. It can answer questions like "is it faster
to dig straight through this hill, or walk around it?" — because both options are
just numbers of ticks.

> Before this, moves used made-up numbers (walk = `1`, diagonal = `1.41`, a jump
> was `+0.5`, a 3-block drop was `+1.5`, ...). Those numbers had no real-world
> meaning, so the bot sometimes preferred routes that *looked* cheap but were
> actually slow.

The numbers come from [Baritone](https://github.com/cabaletta/baritone), a
mature Minecraft pathfinder. They are hardcoded estimates (`20 / speed`) rather
than a live physics simulation — close enough to reality, and very fast to
compute. They live in
[`src/mineflayer-specific/movements/costs.ts`](../src/mineflayer-specific/movements/costs.ts).

## The tick constants

| Constant | Ticks | Meaning |
| --- | --- | --- |
| `SPRINT_ONE_BLOCK_COST` | 3.564 | Sprint one block (fastest ground travel). |
| `WALK_ONE_BLOCK_COST` | 4.633 | Walk one block. |
| `WALK_OFF_BLOCK_COST` | 3.706 | Step off the edge of a block (start of a drop). |
| `CENTER_AFTER_FALL_COST` | 0.927 | Re-center after landing. |
| `JUMP_ONE_BLOCK_COST` | 3.163 | The upward arc of a jump. |
| `LADDER_UP_ONE_COST` | 8.511 | Climb up one block on a ladder/vine. |
| `LADDER_DOWN_ONE_COST` | 6.667 | Climb down one block. |
| `WALK_ONE_IN_WATER_COST` | 9.091 | Swim/walk one block while in water. |
| `WALK_ONE_OVER_SOUL_SAND_COST` | 9.266 | Walk one block over soul sand. |
| `SNEAK_ONE_BLOCK_COST` | 15.385 | Sneak one block. |
| `FALL_N_BLOCKS_COST[n]` | table | Ticks to fall `n` blocks (not linear — you speed up). |
| `COST_INF` | 1,000,000 | "Impossible." Any move this expensive is thrown away. |

## What each move costs

Each movement provider in
[`movementProviders.ts`](../src/mineflayer-specific/movements/movementProviders.ts)
adds up the ticks for the thing it does:

| Move | Base cost (ticks) |
| --- | --- |
| **Forward** | `travelCost(1)` — sprint/walk one block. |
| **Diagonal** | `travelCost(√2)` — a diagonal block is √2 blocks of travel. |
| **ForwardJump** (up 1) | `max(JUMP, WALK)` — you rise and move at once, so it's the slower of the two, not the sum. |
| **ForwardDropDown** | `WALK_OFF_BLOCK_COST + FALL_N_BLOCKS_COST[height]`. |
| **StraightDown** | `FALL_N_BLOCKS_COST[height]` — pure falling, no sideways travel. |
| **StraightUp** | ladder → `LADDER_UP_ONE_COST`; otherwise `JUMP_ONE_BLOCK_COST` + a place cost to tower up. |
| **ParkourForward** | `JUMP_ONE_BLOCK_COST + travelCost(gap)` — the jump plus sprinting across the gap. |
| **ParkourDiagonal** | `JUMP_ONE_BLOCK_COST + travelCost(gap)`. |

On top of the base cost a move also pays for any blocks it must **break**
(`breakCost`, the block's real mining time in ticks) or **place**
(`placeCost`). `travelCost(blocks)` is a small helper on `Movement` that returns
`blocks × (sprinting ? SPRINT : WALK)`.

## The heuristic (A\*'s guess)

A\* also needs to *guess* the remaining cost from any point to the goal. That
guess is the **heuristic** (in [`goals.ts`](../src/mineflayer-specific/goals.ts)):

```
heuristic = straight_line_distance × COST_HEURISTIC
```

`COST_HEURISTIC` is the **walk** cost per block (4.633), not the cheaper
**sprint** cost (3.564). That choice is deliberate:

- A\* finds the *truly* shortest route only when its guess never costs more than
  the cheapest real move (sprinting). Guessing with the slightly-higher walk
  cost makes A\* a lightly **"weighted"** search: it leans harder toward the
  goal and explores far fewer dead-ends, so it stays **fast**.
- The price is that returned paths can be up to `walk / sprint = 4.633 / 3.564
  ≈ 1.3×` the perfect optimum. That is a small, bounded amount.
- Back when move costs were made-up numbers (~1 per block) but the heuristic was
  already ~4.633 per block, that same ratio was ~**4.6×** — paths could be far
  from optimal. Putting move costs in ticks shrinks the bound from ~4.6× to
  ~1.3× **without making the search any slower.**

In short: same speed, much better paths.

## Knobs you can tune

Pass these in `moveSettings` (see [AdvancedUsage](./AdvancedUsage.md)). All are
in ticks; the defaults are tuned to match reality, so you rarely need to change
them.

| Option | Default | What it does |
| --- | --- | --- |
| `liquidCost` | `WALK_ONE_IN_WATER - WALK_ONE_BLOCK` (≈ 4.46) | Extra ticks per block for moving through water. |
| `placeCost` | `20` | Ticks charged for placing a block. Placing interrupts movement, so it is deliberately expensive (Baritone's value). |
| `digCost` | `1` | Multiplier on a block's real mining time. Raise it to make digging look worse and prefer going around. |
| `jumpCost` | `0` | Extra ticks per jump on top of the physical jump arc. Raise it to discourage jumpy paths. |

Example — make the bot hate digging and never want to swim:

```js
bot.pathfinder.setMoveOptions({
  digCost: 5,      // mining looks 5x slower than it is
  liquidCost: 40   // water is very costly per block
})
```
