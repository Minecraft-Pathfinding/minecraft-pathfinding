"use strict";
const { createBot } = require("mineflayer");
const { createPlugin, goals } = require("../dist");
const { GoalBlock, GoalLookAt, GoalPlaceBlock } = goals;
const { Vec3 } = require("vec3");
const rl = require('readline')
const { default: loader, EntityState, EPhysicsCtx, EntityPhysics } = require("@nxg-org/mineflayer-physics-util");
const { GoalMineBlock } = require("../dist/mineflayer-specific/goals");
const { ThePathfinder } = require("../dist/ThePathfinder");
const { performance } = require("perf_hooks");

const bot = createBot({
  username: "testing1",
  auth: "offline",
  host: 'Ic3TankD2HO.aternos.me',
  version: '1.19.4'
});
const pathfinder = createPlugin({ partialPathProducer: true });

function chatEverywhere(message) {
  bot.chat(message);
  console.log(message);
}

async function debugPath(goal) {
  bot.pathfinder.world.setEnabled(true)
  console.info('Target:', new Vec3(goal.x, goal.y, goal.z).toString())
  const generator = bot.pathfinder.getPathFromTo(bot.entity.position, new Vec3(0, 0, 0), goal)

  const start = performance.now()
  let lastResult = undefined
  let nodeOverlap = 0

  let foo
  while ((!foo?.done || lastResult?.status !== 'success') && (foo = await generator.next())) {
    if (foo.value?.result) {
      const nodeSet = new Set()
      foo.value.result.path.forEach(node => {
        if (nodeSet.has(node.toString())) {
          nodeOverlap++
        } else {
          nodeSet.add(node.toString())
        }
      })
      
      lastResult = foo.value.result
    }
  }

  const end = performance.now()

  const isDone = lastResult?.status === 'success'
  const visitedNodes = lastResult?.visitedNodes ?? 0
  if (isDone) {
    chatEverywhere(`Calc done: ✔️, Overlap: ${nodeOverlap} Visited: ${visitedNodes} (${(visitedNodes / ((end - start) / 1000)).toFixed(1)} n/s)`)
    chatEverywhere(`Time: ${end - start}ms`)
  } else {
    chatEverywhere(`Calc done: ❌, Overlap: ${nodeOverlap} Visited: ${visitedNodes} (${(visitedNodes / ((end - start) / 1000)).toFixed(1)} n/s)`)
  }
}

bot.once("spawn", async () => {
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(loader);
  EntityState.prototype.apply = function (bot) {
    this.applyToBot(bot);
  };

  bot.on('resetPath', (reason)=>console.log('reset path!', reason))

  bot.physics.autojumpCooldown = 0;

  const val = new EntityPhysics(bot.registry)
  const oldSim = bot.physics.simulatePlayer;
  bot.physics.simulatePlayer = (...args) => {
    bot.jumpTicks = 0
    const ctx = EPhysicsCtx.FROM_BOT(val, bot)
    ctx.state.jumpTicks = 0; // allow immediate jumping
    // ctx.state.control.set('sneak', true)
    return val.simulate(ctx, bot.world).applyToBot(bot);
    return oldSim(...args);
  };
  bot.pathfinder.setDefaultMoveOptions({
    canDig: false,
    canPlaceOn: false,
  })

  setTimeout(async () => {
    await bot.waitForChunksToLoad();
    await debugPath(new GoalBlock(-311, 69, 304))
  }, 1000)
});

bot.on('chat', (username, message) => {
  if (username === bot.username) return;
  const args = message.split(" ");
  switch (args[0].toLowerCase()) {
    case "cachesize": {
      bot.whisper(username, bot.pathfinder.getCacheSize());
      break;
    }

    case "togglecache":
    case "cache": {
      bot.pathfinder.setCacheEnabled(!bot.pathfinder.isCacheEnabled());
      bot.whisper(username, `pathfinder cache is now ${bot.pathfinder.isCacheEnabled() ? "enabled" : "disabled"}`);
      break;
    }
  }
})

bot._client.on("animation", (data) => {
  if (data.animation !== 0) return;
  const entity = bot.entities[data.entityId];
  if (!entity || entity.type !== "player") return;
  if (!entity.heldItem || entity.heldItem.name !== "stick") return;
  const block = rayTraceEntitySight({ entity });
  if (!block) return;
  const goal = new goals.GoalBlock(block.position.x, block.position.y + 1, block.position.z)
  debugPath(goal).catch(console.error);
});

/**
 * @param { { entity: import('mineflayer').Entity } } options
 */
function rayTraceEntitySight(options) {
  if (bot.world?.raycast) {
    const { height, position, yaw, pitch } = options.entity;
    const x = -Math.sin(yaw) * Math.cos(pitch);
    const y = Math.sin(pitch);
    const z = -Math.cos(yaw) * Math.cos(pitch);
    const rayBlock = bot.world.raycast(position.offset(0, height, 0), new Vec3(x, y, z), 4098);
    if (rayBlock) {
      return rayBlock;
    }
  }
  return null;
}

bot.on("kicked", console.log);
