const { createBot } = require("mineflayer");
const { createPlugin, goals } = require("../dist");
const { Vec3 } = require("vec3");
const { GoalBlock } = goals;

const bot = createBot({ username: "testing" });
const pathfinder = createPlugin();

bot.once("spawn", () => {
  bot.loadPlugin(pathfinder);
  bot.physics.yawSpeed = 3000;
  
});

/** @type { Vec3 | null } */
let lastStart = null;

bot.on("chat", (username, msg) => {
  const [cmd, ...args] = msg.split(" ");
  const author = bot.nearestEntity((e) => e.username === username);

  if (cmd === "path") {
    lastStart = bot.entity.position.clone();
    bot.chat("hi");
    const res = bot.pathfinder.getPathTo(new GoalBlock(Number(args[0]), Number(args[1]), Number(args[2])));
    let test;
    while ((test = res.next()).done === false) {
      console.log(test);
    }
  } else if (cmd === "pathtome") {
    if (!author) return bot.chat("failed to find player.");
    bot.chat("hi");
    const res1 = bot.pathfinder.getPathTo(GoalBlock.fromVec(author.position));
    let test1;
    while ((test1 = res1.next()).done === false) {
      console.log(test1);
    }
  } else if (cmd === "test") {
    if (!author) return bot.chat("failed to find player.");
    lastStart = author.position.clone();
    bot.chat("hi");
    bot.pathfinder.goto(GoalBlock.fromVec(author.position));
  } else if (cmd === "repath") {
    if (!lastStart) {
      bot.chat("no last start");
      return;
    }
    const res = bot.pathfinder.getPathFromTo(lastStart, bot.entity.velocity, GoalBlock.fromVec(author.position));
    let test;
    while ((test = res.next()).done === false) {
      console.log(test);
    }
  } else if (cmd === 'cachesize') {
    bot.chat(bot.pathfinder.getCacheSize())
  } else if (cmd == 'togglecache') {
    bot.pathfinder.setCacheEnabled(!bot.pathfinder.isCacheEnabled())
    bot.chat(`cache is now ${bot.pathfinder.isCacheEnabled() ? 'enabled' : 'disabled'}`)
  }
});
