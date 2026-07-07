<p align="center">
  <img src="https://avatars.githubusercontent.com/u/79112097?s=200&v=4" />
</p>

<h2 align="center">minecraft-pathfinding :tm:</h2>
<h4 align="center">A pathfinder to get a Minecraft bot from point A to point B with unnecessarily stylish movement</h4>

<p align="center">
  <a href="https://discord.gg/zDzugD3ywn">
    <img src="https://img.shields.io/badge/discord-000000?style=for-the-badge&logo=discord" alt="Discord">
  </a>
  <a href="https://ko-fi.com/generel">
    <img src="https://img.shields.io/badge/ko--fi-000000?style=for-the-badge&logo=ko-fi" alt="Ko-fi">
  </a>
</p>

> [!WARNING]
> This pathfinder is still in **HEAVY** development. It is not meant to be used in production. However, you can use the code in `examples` to understand how the pathfinder works.

<h3 align="center">Why use this pathfinder?</h3>

-----

Presently, its execution is better than both Baritone's and mineflayer-pathfinder's. It also follows an entirely different paradigm - each move's execution is split into individual parts, which combined with a modular movement provider/executor/optimizer system, it makes this pathfinder ***extremely*** customizable. So as long as a single movement's execution handles all entry cases (which is possible), it can be immediately integrated into this bot.

Examples will be added as the project undergoes more development.

<h3 align="center">What is left to be done?</h3>

-----

**Many** things.

- [X] Proper breaking of blocks (Cost + Execution)
- [X] Water movement
- [X] Parkour
- [X] Proper jump sprinting
- [ ] Offloading the world thread


<h3 align="center">API and Examples</h3>

-----

| Link | Description |
| --- | --- |
| [API](https://github.com/GenerelSchwerz/minecraft-pathfinding/blob/main/docs/API.md) | The documentation with the available methods and properties. |
| [Advanced Usage](https://github.com/GenerelSchwerz/minecraft-pathfinding/blob/main/docs/AdvancedUsage.md) | The documentation with the advanced usage of the pathfinder, including the customization of goals and movements. |
| [Movement Costs](https://github.com/GenerelSchwerz/minecraft-pathfinding/blob/main/docs/MovementCosts.md) | How move costs and the A\* heuristic work (tick-based, credited to Baritone). |
| [Examples](https://github.com/GenerelSchwerz/minecraft-pathfinding/tree/main/examples) | The folder with the examples. |

<h3 align="center">Credits</h3>

-----

The movement **cost constants** and the A\* **heuristic shape** are taken from
[Baritone](https://github.com/cabaletta/baritone), the Minecraft pathfinding mod
by Leijurv and contributors (LGPL-3.0). See its `ActionCosts`, `GoalXZ` and
`GoalYLevel`. Details, and where we deliberately differ, are in [Movement Costs](https://github.com/GenerelSchwerz/minecraft-pathfinding/blob/main/docs/MovementCosts.md).
