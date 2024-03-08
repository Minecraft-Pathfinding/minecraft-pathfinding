"use strict";
const { createBot } = require("mineflayer");
const { createPlugin, goals, custom } = require("../dist");
const { GoalBlock, GoalLookAt } = goals;
const { MovementProvider, MovementExecutor } = custom;
const { Vec3 } = require("vec3");
const rl = require("readline");
const { Move } = require("../dist/mineflayer-specific/move");
const { CancelError } = require("../dist/mineflayer-specific/exceptions");


const bot = createBot({
  username: "testing1",
  auth: "offline",
  version: "1.20.1",
  host: "node2.meowbot.de",
  port: 5000

});


const pathfinder = createPlugin();



class MyProvider extends MovementProvider {
  offsets = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
  ];

  // provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;

  /**
   * @param {Move} start 
   * @param {Move[]} storage 
   * @param {goals.Goal} goal 
   * @param {Set<string>} closed 
   */
  provideMovements(start, storage, goal, closed) {
    for (const dir of this.offsets) {
      const off = start.cachedVec.offset(dir.x, dir.y, dir.z); // cachedVec is already floored.
      if (closed.has(off.toString())) continue;
      this.checkAhead(start, dir, storage, goal, closed)
    }

  }

    /**
     * 
     * @param {Move} start 
     * @param {{x: number, y: number, z: number}} dir 
     * @param {Move[]} storage 
     * @param {goals.Goal} goal 
     * @param {Set<string>} closed 
     */
    checkAhead(start, dir, storage, goal, closed) {
      const blockN1 = this.getBlockInfo(start, 0, -1, 0);
      if (!blockN1.physical) return // no point in trying walk movement if block below is not physical.

      const targetN1 = this.getBlockInfo(start, dir.x, -1, dir.z);

      if (!targetN1.physical) return // don't walk to block that isn't physical

      const toPlace = [];
      const toBreak = [];

      let cost = 1 // move cost

      const target0 = this.getBlockInfo(start, dir.x, 0, dir.z);
      const target1 = this.getBlockInfo(start, dir.x, 1, dir.z);

      if ((cost += this.safeOrBreak(target0, toBreak)) > 100) return// auto-assigns break as necessary, returns cost of break

      // ! verbose version of above line:
      // if (!target0.safe) {
      //   if (!target0.physical) return // cannot break block that is not physical and not safe

      //   const { BreakHandler } = require("@nxg-org/mineflayer-pathfinder/dist/mineflayer-specific/movements/interactionUtils");

      //   cost += this.breakCost(target0);
      //   if (cost > 100) return
      //   toBreak.push(BreakHandler.fromVec(target0.position, 'solid'))
      // }


      if ((cost += this.safeOrBreak(target1, toBreak)) > 100) return // return if cost is too high

      const wantedExitPos = start.cachedVec.offset(dir.x + 0.5, 0, dir.z + 0.5) // center of block

      storage.push(Move.fromPrevious(cost, wantedExitPos, start, this, toPlace, toBreak))
  }
}

class MyExecutor extends MovementExecutor {

 
  /**
   * Example code on how to easily provide movements for an executor.
   * 
   * @param {Move} thisMove 
   * @param {number} currentIndex current index of move in path
   * @param {Move[]} path Full path currently known
   * 
   * @returns {void | Promise<void>}
   */
  async performInit(thisMove, currentIndex, path) {

    if (this.toBreakLen() > 0) {
      for (const breakH of this.toBreak()) {
        const info = await breakH.performInfo(this.bot);
        if (info.ticks !== Infinity) await this.performInteraction(breakH)
      }
    }

    this.lookAtPathPos(thisMove.exitPos) // look at Vec3 on yaw axis, looks straight ahead pitch-wise

    this.bot.setControlState('forward', true)
    this.bot.setControlState('sprint', true)

  }

  
  /**
   * @param {Move} thisMove 
   * @param {number} tickCount 
   * @param {number} currentIndex 
   * @param {Move[]} path 
   * @returns {boolean | number | Promise<boolean | number>}
   */
  async performPerTick(thisMove, tickCount, currentIndex, path) {
    if (tickCount > 40) throw new CancelError('Custom movement executor: took too long!') // cancel error ends current excution.

    if (this.bot.entity.position.y < thisMove.exitPos.y) throw new CancelError('too low!') 

    void this.postInitAlignToPath(thisMove) // auto-handle alignment to exit position on this movement.

    // ! verbose usage of above:
    // void this.postInitAlignToPath(thisMove, {lookAtYaw: thisMove.exitPos}) // auto-handle alignment to exit position on this movement.

    return this.isComplete(thisMove) // ensure to return true if movement is completed
  }

}



bot.once("spawn", async () => {
  bot.loadPlugin(pathfinder);

  // clear all loaded movement providers
  bot.pathfinder.dropAllMovements();

  bot.pathfinder.setExecutor(MyProvider, MyExecutor)

  bot.physics.autojumpCooldown = 0;


  const rlline = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rlline.on("line", (line) => {
    if (line === "exit") {
      bot.quit();
      process.exit();
    }

    bot.chat(line);
  });

  await bot.waitForChunksToLoad();
  bot.chat('rocky1928')
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

      await bot.pathfinder.goto(new GoalBlock(x, y, z));

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

bot.on("error", (err) => {
  console.log("Bot error", err);
});
bot.on("kicked", (reason) => {
  console.log("Bot kicked", reason);
});
