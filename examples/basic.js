const { createBot } = require("mineflayer");
const { createPlugin, goals } = require("../dist");
const { GoalBlock } = goals;

const bot = createBot({ username: "testing" });
const pathfinder = createPlugin();

bot.once("spawn", () => {
  bot.loadPlugin(pathfinder);
  bot.physics.yawSpeed = 3000;
  
});

bot.on("chat", (username, msg) => {
  const [cmd, ...args] = msg.split(" ");
  const author = bot.nearestEntity((e) => e.username === username);

  switch (cmd) {
    case "path":
      bot.chat("hi");
      const res = bot.pathfinder.getPathTo(new GoalBlock(Number(args[0]), Number(args[1]), Number(args[2])));
      let test;
      while ((test = res.next()).done === false) {
        console.log(test);
      }
      break;

    case "pathtome":
      if (!author) return bot.chat("failed to find player.");
      bot.chat("hi");
      const res1 = bot.pathfinder.getPathTo(GoalBlock.fromVec(author.position));
      let test1;
      while ((test1 = res1.next()).done === false) {
        console.log(test1);
      }
      break;

    case "test":
    if (!author) return bot.chat("failed to find player.");
    bot.chat("hi");
    bot.pathfinder.goto(GoalBlock.fromVec(author.position))

  }
});
