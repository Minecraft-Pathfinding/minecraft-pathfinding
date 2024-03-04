"use strict";
const { createBot } = require("mineflayer");
const { createPlugin, goals, custom } = require("@nxg-org/mineflayer-pathfinder");
const { GoalBlock, GoalLookAt } = goals;
const {MovementProvider, MovementExecutor} = custom
const { Vec3 } = require("vec3");
const rl = require('readline')


class MyProvider extends MovementProvider {
  // provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
  provideMovements(start, storage, goal, closed) {
    

  }
}

class MyExecutor extends MovementExecutor {

}


const bot = createBot({
  username: "testing1",
  auth: "offline",
  // host: 'it-mil-1.halex.gg',
  // port: 25046
  version: '1.19.4',

  // host: "node2.endelon-hosting.de", port: 5000
  host: 'Ic3TankD2HO.aternos.me',
  // port: 44656
  // host: "us1.node.minecraft.sneakyhub.com",
  // port: 25607,
});
const pathfinder = createPlugin();

const validTypes = ["block" , "lookat"]
let type = "block"
function getGoal(world, x, y, z) {
  const block = bot.blockAt(new Vec3(x, y, z));
  if (block === null) return new GoalBlock(x, y+1, z);
  switch (type) {
    case "block":
      return new GoalBlock(x, y+1, z);
    case "lookat":
      return GoalLookAt.fromBlock(world, block);
  }

  return new GoalBlock(x, y+1, z);
}


bot.on("inject_allowed", () => {});
bot.once('login', () => {
  console.info('Bot logged in');
});
bot.on('messagestr', (message) => {
  console.info('Chat:', message);
})
bot.on('actionBar', (message) => {
  console.info('Action bar:', message);
})
bot.once("spawn", async () => {
  bot.loadPlugin(pathfinder);

  bot.physics.autojumpCooldown = 0;

  const rlline = rl.createInterface({
    input: process.stdin,
    output: process.stdout
  
  })
 
  
  rlline.on('line', (line) => {
    if (line === "exit") {
      bot.quit()
      process.exit()
    }
  
    bot.chat(line)
  })


});


async function cmdHandler(username, msg) {
  if (username === bot.username) return;

  const [cmd1, ...args] = msg.split(" ");

  const cmd = cmd1.toLowerCase().replace(prefix, "");

  switch (cmd) {
    case "cancel":
    case "stop": {
      bot.whisper(username, "Canceling path");
      await bot.pathfinder.cancel();
      bot.clearControlStates();
      break;
    }
  
    case "pos": {
      bot.whisper(username, `I am at ${bot.entity.position}`);
      console.log(`/tp ${bot.username} ${bot.entity.position.x} ${bot.entity.position.y} ${bot.entity.position.z}`);
      break;
    }

    case "goto": {
      const x = Math.floor(Number(args[0]));
      const y = Math.floor(Number(args[1]));
      const z = Math.floor(Number(args[2]));
      if (isNaN(x) || isNaN(y) || isNaN(z)) return bot.whisper(username, "goto <x> <y> <z> failed | invalid args");
      
      bot.whisper(username, `going to ${args[0]} ${args[1]} ${args[2]}`);

      await bot.pathfinder.goto(new GoalBlock(x,y,z));
   
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

bot.on('error', (err) => {
  console.log('Bot error', err)
})
bot.on('kicked', (reason) => {
  console.log('Bot kicked', reason)
})