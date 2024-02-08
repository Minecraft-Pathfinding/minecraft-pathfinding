//@ts-nocheck
"use strict";
import {createBot} from 'mineflayer'
import {createPlugin, goals} from '../src'
const { GoalBlock } = goals;
import { Vec3 } from 'vec3';

import { default as loader, EntityPhysics, EPhysicsCtx, EntityState, ControlStateHandler } from "@nxg-org/mineflayer-physics-util";

const bot = createBot({ username: "testing1", auth: "offline", 
// host: "Ic3TankD2HO.aternos.me", 
// port: 44656 

host: "us1.node.minecraft.sneakyhub.com",
port: 25607
});
const pathfinder = createPlugin();

bot.on("inject_allowed", () => {});

bot.once("spawn", () => {
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(loader);
  // bot.physics.yawSpeed = 5;

  // apply hot-fix to mineflayer's physics engine.
  const val = new EntityPhysics(bot.registry);
  EntityState.prototype.apply = function (bot) {
    this.applyToBot(bot);
  };

  // EntityPhysics.prototype.simulate = function (ctx, world) {
  //   bot.physics.simulatePlayer(ctx.state, world);
  // }

  bot.physics.autojumpCooldown = 0;
  // (bot.physics).jumpTicks = 0;

  // bot.jumpTicks = 0;
  const oldSim = bot.physics.simulatePlayer;
  bot.physics.simulatePlayer = (...args) => {
    bot.jumpTicks = 0
    const ctx = EPhysicsCtx.FROM_BOT(val, bot)
    ctx.state.jumpTicks = 0; // allow immediate jumping
    // ctx.state.control.set('sneak', true)
    return val.simulate(ctx, bot.world)
    return oldSim(...args);
  };
});

/** @type { Vec3 | null } */
let lastStart = null;

bot.on("chat", async (username, msg) => {
  const [cmd, ...args] = msg.split(" ");
  const author = bot.nearestEntity((e) => e.username === username);


  switch (cmd) {

    case "cancel": 
    case "stop": {
      bot.chat('Canceling path')
      bot.pathfinder.cancel();
      break;
    }
    case "lookat": {
      bot.lookAt(new Vec3(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])));
      break;
    }

    case "pos": {
      bot.chat(`I am at ${bot.entity.position}`);
      console.log(`/tp ${bot.username} ${bot.entity.position.x} ${bot.entity.position.y} ${bot.entity.position.z}`);
      break;
    }

    case "path": {
      lastStart = bot.entity.position.clone();
      const res = bot.pathfinder.getPathTo(new GoalBlock(Number(args[0]), Number(args[1]), Number(args[2])));
      let test;
      while ((test = await res.next()).done === false) {
        console.log(test);
      }
      break;
    }

    case "goto":
    case "#goto": {
      const x = Math.floor(Number(args[0]));
      const y = Math.floor(Number(args[1]));
      const z = Math.floor(Number(args[2]));
      if (isNaN(x) || isNaN(y) || isNaN(z)) return bot.chat("goto <x> <y> <z> failed | invalid args");
      bot.chat(`going to ${args[0]} ${args[1]} ${args[2]}`);

      const startTime = performance.now();
      await bot.pathfinder.goto(new GoalBlock(x, y, z));
      const endTime = performance.now();
      bot.chat(
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      );
      break;
    }

    case "pathtome": {
      if (!author) return bot.chat("failed to find player.");
      bot.chat("hi");
      const startTime = performance.now();
      const res1 = bot.pathfinder.getPathTo(GoalBlock.fromVec(author.position));
      let test1;
      let test2 = [];
      while ((test1 = await res1.next()).done === false) {
        test2.concat(test1.value.result.path);
      }
      const endTime = performance.now();
      bot.chat(
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      );
      bot.chat(bot.pathfinder.world.getCacheSize());
      console.log(test2.length);
      break;
    }

    case "repath": {
      if (!lastStart) {
        bot.chat("no last start");
        return;
      }
      const res = bot.pathfinder.getPathFromTo(lastStart, bot.entity.velocity, GoalBlock.fromVec(author.position));
      let test;
      while ((test = await res.next()).done === false) {
        console.log(test);
      }
      break;
    }

    case "cachesize": {
      bot.chat(bot.pathfinder.getCacheSize());
      break;
    } 

    case "togglecache":
    case "cache": {
      bot.pathfinder.setCacheEnabled(!bot.pathfinder.isCacheEnabled());
      bot.chat(`pathfinder cache is now ${bot.pathfinder.isCacheEnabled() ? "enabled" : "disabled"}`);
      break;
    }

    case "therepos": {
      if (!author) return bot.chat("failed to find player");
      const authorPos = author.position.clone();
      const rayBlock = rayTraceEntitySight({ entity: author });
      if (!rayBlock) return bot.chat("No block in sight");
      else return bot.chat(`Block in sight: ${rayBlock.position.x} ${rayBlock.position.y} ${rayBlock.position.z}`);
    }
    case "there": {
      if (!author) return bot.chat("failed to find player");
      const authorPos = author.position.clone();
      const rayBlock = rayTraceEntitySight({ entity: author });
      if (!rayBlock) return bot.chat("No block in sigth");
      lastStart = rayBlock.position.clone().offset(0.5, 1, 0.5);
      const startTime = performance.now();
      await bot.pathfinder.goto(GoalBlock.fromVec(lastStart));
      const endTime = performance.now();
      bot.chat(
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      );
      break;
    }

    case "test": {
      if (!author) return bot.chat("failed to find player.");
      lastStart = author.position.clone();
      bot.chat("hi");
      const startTime = performance.now();
      await bot.pathfinder.goto(GoalBlock.fromVec(author.position));
      const endTime = performance.now();
      bot.chat(
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      );
      break;
    }

    case "placeblock": {
      await bot.equip(bot.registry.itemsByName.dirt.id, "hand");
      await bot.placeBlock(bot.blockAtCursor(5), new Vec3(parseInt(args[0]), parseInt(args[1]), parseInt(args[2])));
      break;
    }

    case "jump": {
      bot.physics.jump();
      break;
    }

    case "stop": {
      bot.pathfinder.stop();
      break;
    }
  }
});

bot._client.on('animation', (data) => {
  if (data.animation !== 0) return
  const entity = bot.entities[data.entityId]
  if (!entity || entity.type !== 'player') return
  if (!entity.heldItem || entity.heldItem.name !== 'stick') return
  const block = rayTraceEntitySight({ entity: entity });
  if (!block) return
  bot.pathfinder.goto(GoalBlock.fromVec(block.position.offset(0.5, 1, 0.5)));
})

/**
 * @param { { entity: import('mineflayer').Entity } } options
 */
function rayTraceEntitySight(options) {
  if (bot.world?.raycast) {
    const { height, position, yaw, pitch } = options.entity;
    const x = -Math.sin(yaw) * Math.cos(pitch);
    const y = Math.sin(pitch);
    const z = -Math.cos(yaw) * Math.cos(pitch);
    const rayBlock = bot.world.raycast(position.offset(0, height, 0), new Vec3(x, y, z), 120);
    if (rayBlock) {
      return rayBlock;
    }
  }
  return null;
}

bot.on("kicked", console.log);
