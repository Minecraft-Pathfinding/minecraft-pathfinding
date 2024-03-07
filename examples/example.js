"use strict";
const { createBot } = require("mineflayer");
const { createPlugin, goals, custom } = require("../dist");
const { GoalBlock, GoalLookAt, GoalPlaceBlock, GoalInvert } = goals
const { Vec3 } = require("vec3");
const rl = require('readline')
const { default: loader, EntityState, EPhysicsCtx, EntityPhysics } = require("@nxg-org/mineflayer-physics-util");
const { GoalMineBlock, GoalFollowEntity, GoalCompositeAll } = require("../dist/mineflayer-specific/goals");


const bot = createBot({
  username: "testing1",
  auth: "offline",
  // host: 'fr-msr-1.halex.gg',
  // port: 25497

  host: "node2.meowbot.de", port: 5000
  // host: 'Ic3TankD2HO.aternos.me'
  // host: "us1.node.minecraft.sneakyhub.com",
  // port: 25607,
});
const pathfinder = createPlugin();


const validTypes = ["block" , "lookat", "place", "break"]
let mode = "block"

function getGoal(world,x,y,z,modes=mode) {
  const ret = _getGoal(world,x,y,z,modes)
  bot.chat(`Going to: ${ret.x} ${ret.y} ${ret.z}`)
  console.log(ret)
  return ret;
}
function _getGoal(world, x, y, z,modes) {
  const block = bot.blockAt(new Vec3(x, y, z));
  if (block === null) return new GoalBlock(x, y+1, z);
  let item;
  switch (modes) {
    case "block":
      return new GoalBlock(x, y+1, z);
    case "lookat":
      return GoalLookAt.fromBlock(world, block);
    case "place":
      item = bot.inventory.items().find(item => item.name === 'dirt');
      return GoalPlaceBlock.fromInfo(world, block.position.offset(0, 1, 0), item);
    case "break":
      return GoalMineBlock.fromBlock(world, block);
  }

  return new GoalBlock(x, y+1, z);
}


bot.on("inject_allowed", () => {});

bot.once("spawn", async () => {


  // // to get a path to the best node considered (updated per producer.advance() call)
  // bot.pathfinder.currentProducer.getCurrentPath();


  // // to get a path to the most recent node considered
  // bot.pathfinder.reconstructPath(bot.pathfinder.currentAStar?.mostRecentNode)


  bot.on('physicsTick', () => {
    if (bot.getControlState('forward') && bot.getControlState('back')) {
      console.log(bot.pathfinder.currentExecutor.constructor.name)
  
      // throw new Error('both forward and back are true')

    }
  })
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(loader);

/*  miningStates[bot.username] = setInterval(async () => { // if the blockupdate doesnt work this can be an alternative too
    try {
      if (bot.pathfinder.isBuilding()) {
        const blockInHand = bot.heldItem;

        if (blockInHand) {
          const lookAtBlockPos = bot.blockAtCursor();
          if (lookAtBlockPos && lookAtBlockPos.position) {
            const blockPosStr = lookAtBlockPos.position.toString();
            if (!placedBlocks.has(blockPosStr)) {
              await bot.placeBlock(bot.blockAt(lookAtBlockPos.position), new Vec3(0, 1, 0)).catch();
              placedBlocks.add(blockPosStr);
            }
          }
        }
      }
    } catch (e) { }
  }, 100);*/

  let placedBlocks = new Set();
  
  bot.on('blockUpdate', (oldBlock, newBlock) => { // fix for bot failing on trying to place blocks
    if (newBlock && !oldBlock) {
      placedBlocks.add(newBlock.position.toString());
      //mineBlocks(bot, blockType, newBlock);
    }
    else if (!newBlock && oldBlock) {
      placedBlocks.delete(oldBlock.position.toString());
    }
  });
  
  bot.pathfinder.setPathfinderOptions({
    partialPathProducer: true,
    partialPathLength: 30
  })

  bot.pathfinder.setCacheEnabled(true);


  bot.on('goalFinished', (goal) => {
    console.log('goal finished', goal)
    bot.chat('goal finished')
  })
  // bot.physics.yawSpeed = 3;
  // bot.physics.pitchSpeed = 3

  // apply hot-fix to mineflayer's physics engine.
  // const val = new EntityPhysics(bot.registry)
  EntityState.prototype.apply = function (bot) {
    this.applyToBot(bot);
  };

  // bot.on('entityMoved', e=> {
  //   if (e ===bot.entity) return
  //   console.log(e.name, e.position)
  // })

  bot.on('resetPath', (reason)=>console.log('reset path!', reason))

  // EntityPhysics.prototype.simulate = function (ctx, world) {
  //   bot.physics.simulatePlayer(ctx.state, world);
  // }

  bot.physics.autojumpCooldown = 0;
  // (bot.physics).jumpTicks = 0;

  // bot.jumpTicks = 0;

  const val = new EntityPhysics(bot.registry)
  const oldSim = bot.physics.simulatePlayer;
  bot.physics.simulatePlayer = (...args) => {
    // bot.jumpTicks = 0
    // const ctx = EPhysicsCtx.FROM_BOT(val, bot)
    // ctx.state.jumpTicks = 0; // allow immediate jumping
    // // ctx.state.control.set('sneak', true)
    // return val.simulate(ctx, bot.world).applyToBot(bot);
    return oldSim(...args);
  };

  const rlline = rl.createInterface({
    input: process.stdin,
    output: process.stdout
  
  })
  
  rlline.on('line', (line) => {
    // console.log('line!', line)
    if (line === "exit") {
      bot.quit()
      process.exit()
    }
  
    bot.chat(line)
  })

  await bot.waitForChunksToLoad();
  bot.chat('rocky1928')
});

/** @type { Vec3 | null } */
let lastStart = null;

async function cmdHandler(username, msg) {
  // console.log(msg)
  if (username === bot.username) return;

  const [cmd1, ...args] = msg.split(" ");
  const author = bot.nearestEntity((e) => e.username === username);

  const cmd = cmd1.toLowerCase().replace(prefix, "");

  switch (cmd) {

    case "followme": {
      if (!author) return bot.whisper(username, "failed to find player");
      const dist = parseInt(args[0]) || 1;
      const goal = GoalFollowEntity.fromEntity(author, dist, {neverfinish: true});
      await bot.pathfinder.goto(goal, {errorOnAbort: false, errorOnReset: false});
      break;
    }

    case "avoidme": {
      if (!author) return bot.whisper(username, "failed to find player");
      const dist = parseInt(args[0]) || 5;
      const goal = GoalFollowEntity.fromEntity(author, dist, {neverfinish: true});
      const goal1 = GoalInvert.from(goal)
      console.log(goal1)
      await bot.pathfinder.goto(goal1);
      break;
    }

    case "boundaryme": {
      if (!author) return bot.whisper(username, "failed to find player");
      const dist = parseInt(args[0]) || 5;
      const goal = GoalFollowEntity.fromEntity(author, dist, {neverfinish: true});
      const goal1 = GoalInvert.from(GoalFollowEntity.fromEntity(author, dist - 1, {neverfinish: true}))
     
      await bot.pathfinder.goto(new GoalCompositeAll(goal, goal1));
      break;
    }

    case "blockatme": {
      if (!author) return bot.whisper(username, "failed to find player");
      const block = bot.blockAt(author.position);
      console.log(username, `Block at you: ${block.position.x} ${block.position.y} ${block.position.z}`, block);
      console.log(block.getProperties())
      break;
    }
    case "mode": {
      if (args.length === 0) {
        bot.whisper(username, `mode is ${mode}`);
        break;
      }
      if (!validTypes.includes(args[0])) return bot.whisper(username, `Invalid mode ${args[0]}`);
      mode = args[0];
      bot.whisper(username, `mode is now ${mode}`);
      break;
    }
    case "hi": {
      bot.whisper(username, "hi");
      break;
    }

    case "set":
    case "setting": {
      const stuff = Object.entries(bot.pathfinder.defaultMoveSettings);
      const stuff1 = Object.entries(bot.pathfinder.pathfinderSettings);
      const stuff2 = Object.entries(bot.physics);
      const keys = stuff.map(([key]) => key);
      const keys1 = stuff1.map(([key]) => key);
      const keys2 = stuff2.map(([key]) => key);
      const [key, value] = args;

      if (key === "list") {
        bot.whisper(username, "Movement settings: " + keys.join(", "));
        bot.whisper(username, "Pathfinder settings: " + keys1.join(", "));
        bot.whisper(username, "Physics settings: " + keys2.join(", "));
        break;
      }

      if (!keys.includes(key) && !keys1.includes(key) && !keys2.includes(key)) return bot.whisper(username, `Invalid setting ${key}`);

      let setter = null;

      if (value === "true") {
        setter = true;
      }

      if (value === "false") {
        setter = false;
      }

      if (!isNaN(Number(value))) {
        setter = Number(value);
      }

      if (keys.includes(key)) {
        if (value === undefined) {
          bot.whisper(username, `${key} is ${bot.pathfinder.defaultMoveSettings[key]}`);
          break;
        }
        const newSets = { ...bot.pathfinder.defaultMoveSettings };

        bot.whisper(username, `${key} is now ${value}, was ${bot.pathfinder.defaultMoveSettings[key]}`);
        newSets[key] = setter;
        bot.pathfinder.setDefaultMoveOptions(newSets);
      } else if (keys1.includes(key)) {
        if (value === undefined) {
          bot.whisper(username, `${key} is ${bot.pathfinder.pathfinderSettings[key]}`);
          break;
        }
        const newSets = { ...bot.pathfinder.pathfinderSettings };
        bot.whisper(username, `${key} is now ${value}, was ${bot.pathfinder.pathfinderSettings[key]}`);
        newSets[key] = setter;
        bot.pathfinder.setPathfinderOptions(newSets);

      } else {
        if (value === undefined) {
          bot.whisper(username, `${key} is ${bot.physics[key]}`);
          break;
        }
        bot.whisper(username, `${key} is now ${value}, was ${bot.physics[key]}`);
        bot.physics[key] = setter;
      }
      break;
    }

    case "walkto": {
      if (args.length === 0) {
        if (!author) return bot.whisper(username, "failed to find player");
        bot.lookAt(author.position);
      } else if (args.length === 3) {
        bot.lookAt(new Vec3(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])));
      } else {
        bot.whisper(username, "walkto <x> <y> <z> | walkto <player>");
      }
      bot.setControlState("forward", true);
      break;
    }

    case "jump": {
      bot.setControlState("jump", true);
      break
    }
    case "cancel":
    case "stop": {
      bot.whisper(username, "Canceling path");
      bot.pathfinder.cancel();
      bot.clearControlStates();
      break;
    }
    case "lookat": {
      bot.lookAt(new Vec3(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])));
      break;
    }

    case "pos": {
      bot.whisper(username, `I am at ${bot.entity.position}`);
      console.log(`/tp ${bot.username} ${bot.entity.position.x} ${bot.entity.position.y} ${bot.entity.position.z}`);
      break;
    }

    case "path": {
      lastStart = bot.entity.position.clone();
      const goal = getGoal(bot.world, Number(args[0]), Number(args[1]), Number(args[2]));
      const res = bot.pathfinder.getPathTo(goal);
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
      if (isNaN(x) || isNaN(y) || isNaN(z)) return bot.whisper(username, "goto <x> <y> <z> failed | invalid args");
      
      const block = bot.blockAt(new Vec3(x, y, z));
      if (block === null && mode !== 'block') return bot.whisper(username, "goto <x> <y> <z> failed | invalid block");
    
      bot.whisper(username, `going to ${args[0]} ${args[1]} ${args[2]}`);

      const startTime = performance.now();
      const goal = getGoal(bot.world, x, y, z);
      await bot.pathfinder.goto(goal);
      const endTime = performance.now();
      bot.whisper(
        username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      );
      break;
    }

    case "pathtome": {
      if (!author) return bot.whisper(username, "failed to find player.");
      bot.whisper(username, "hi");
      const startTime = performance.now();
      const goal = getGoal(bot.world, author.position.x, author.position.y-1, author.position.z);
      const res1 = bot.pathfinder.getPathTo(goal);
      let test;
      let test1;
      const test2 = [];
      do {
        test = await res1.next()
        if (!test.done) test1=test
        // console.log(test1)
        if (test1.value) test2.push(...test1.value.result.path);
      } while (test.done === false)
    
      const endTime = performance.now();

    

      if (args.find(val=>val==='debug')) {
        console.log('hey')
        console.log(test1.value.result.path.map((v) => `(${v.moveType.constructor.name}: ${v.toPlace.length} ${v.toBreak.length} | ${v.entryPos} ${v.exitPos})`).join("\n"));

   
        const poses = [];
        const listener = () => {
          for (const pos of poses) {
            bot.chat('/particle minecraft:flame ' + (pos.entryPos.x-0.5) + ' ' + (pos.entryPos.y +0.5) + ' ' + (pos.entryPos.z-0.5) + ' 0 0 0 0 1 force')
          }
        }
        const interval = setInterval(listener, 500)
        if (args.find(val=>val==='trail')) {
          const stagger = 2
          for (const pos of test1.value.result.path) {
            poses.push(pos)
            bot.chat('/particle minecraft:flame ' + (pos.entryPos.x-0.5) + ' ' + (pos.entryPos.y +0.5) + ' ' + (pos.entryPos.z-0.5) + ' 0 0 0 0 1 force')
            await bot.waitForTicks(stagger);
          }
          clearInterval(interval)
        }
      }

      bot.whisper(
        username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      );

      bot.whisper(username, bot.pathfinder.world.getCacheSize());
      console.log(test1.length);
      break;
    }

    case "pathtothere": {
      const startTime = performance.now();

      let rayBlock;
      let info = new Vec3(0, 0, 0);
      if (args.length >= 3) {
        info = new Vec3(parseInt(args[0]), parseInt(args[1]), parseInt(args[2]));
        rayBlock = bot.blockAt(info);
      } else {
        if (!author) return bot.whisper(username, "failed to find player.");

        rayBlock = await rayTraceEntitySight({ entity: author });
        if (!rayBlock) return bot.whisper(username, "No block in sight");
        info = rayBlock.position;

      } 
      
      // else {
      //   bot.whisper(username, "pathtothere <x> <y> <z> | pathtothere");
      //   return;
      // }

     
      bot.whisper(username, `pathing to ${info.x} ${info.y} ${info.z}`);
      const goal = getGoal(bot.world, info.x, info.y, info.z);
      const res1 = bot.pathfinder.getPathTo(goal);
      let test;
      let test1;
      const test2 = [];
      do {
        test = await res1.next()
        if (!test.done) test1=test
        // console.log(test1)
        if (test1.value) test2.push(...test1.value.result.path);
      } while (test.done === false)
    
      const endTime = performance.now();

    

      if (args.find(val=>val==='debug')) {
        console.log('hey')
        console.log(test1.value.result.path.map((v) => `(${v.moveType.constructor.name}: ${v.toPlace.length} ${v.toBreak.length} | ${v.entryPos} ${v.exitPos})`).join("\n"));

   
        const poses = [];
        const listener = () => {
          for (const pos of poses) {
            bot.chat('/particle minecraft:flame ' + (pos.entryPos.x-0.5) + ' ' + (pos.entryPos.y +0.5) + ' ' + (pos.entryPos.z-0.5) + ' 0 0 0 0 1 force')
          }
        }
        const interval = setInterval(listener, 500)
        if (args.find(val=>val==='trail')) {
          const stagger = 2
          for (const pos of test1.value.result.path) {
            poses.push(pos)
            bot.chat('/particle minecraft:flame ' + (pos.entryPos.x-0.5) + ' ' + (pos.entryPos.y +0.5) + ' ' + (pos.entryPos.z-0.5) + ' 0 0 0 0 1 force')
            await bot.waitForTicks(stagger);
          }
          clearInterval(interval)
        }
      }

      bot.whisper(
        username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      );

      bot.whisper(username, bot.pathfinder.world.getCacheSize());
      console.log(test2.length);
      break;
    }

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

    case "therepos": {
      if (!author) return bot.whisper(username, "failed to find player");
      const rayBlock = rayTraceEntitySight({ entity: author });
      if (!rayBlock) return bot.whisper(username, "No block in sight");
      else return bot.whisper(username, `Block in sight: ${rayBlock.position.x} ${rayBlock.position.y} ${rayBlock.position.z}`);
    }
    case "there": {
      if (!author) return bot.whisper(username, "failed to find player");
      const rayBlock = rayTraceEntitySight({ entity: author });
      if (!rayBlock) return bot.whisper(username, "No block in sight");
      lastStart = rayBlock.position.clone().offset(0.5, 1, 0.5);
      const startTime = performance.now();
      const goal = getGoal(bot.world, rayBlock.position.x, rayBlock.position.y, rayBlock.position.z);
      await bot.pathfinder.goto(goal);
      const endTime = performance.now();
      bot.whisper(
        username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      );
      break;
    }

    case "test": {
      if (!author) return bot.whisper(username, "failed to find player.");
      lastStart = author.position.clone();
      bot.whisper(username, "hi");
      const startTime = performance.now();
      const goal = getGoal(bot.world, author.position.x, author.position.y-1, author.position.z);
      console.log(goal)
      await bot.pathfinder.goto(goal);
      const endTime = performance.now();
      bot.whisper(
        username,
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
  }
}
const prefix = "!";
bot.on("chat", async (username, msg) => {
  await cmdHandler(username, msg);
});

bot.on("messagestr", async (msg, pos, jsonMsg) => {
  const username = bot.nearestEntity((e) => e.type === "player" && e !== bot.entity)?.username ?? "unknown";
  await cmdHandler(username, msg);
});

bot._client.on("animation", (data) => {
  if (data.animation !== 0) return;
  const entity = bot.entities[data.entityId];
  if (!entity || entity.type !== "player") return;
  if (!entity.heldItem || entity.heldItem.name !== "stick") return;
  const block = rayTraceEntitySight({ entity });
  if (!block) return;
  const goal = getGoal(bot.world, block.position.x, block.position.y, block.position.z);
  bot.pathfinder.goto(goal);
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


