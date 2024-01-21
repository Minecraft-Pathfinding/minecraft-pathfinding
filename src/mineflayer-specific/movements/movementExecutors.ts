import { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { goals } from "../goals";
import { Move } from "../move";
import { World } from "../world/worldInterface";
import { Movement, MovementOptions } from "./movement";
import { CancelError } from "./exceptions";
import { BlockInfo } from "../world/cacheWorld";
import { BreakHandler, PlaceHandler, RayType } from "./utils";
import { onceWithCleanup } from "../../utils";
import { AABBUtils } from "@nxg-org/mineflayer-util-plugin";
import { emptyVec } from "@nxg-org/mineflayer-physics-util/dist/physics/settings";
import * as controls from "./controls";
import { MovementExecutor } from "./movementExecutor";


export class IdleMovementExecutor extends Movement {
  provideMovements(start: Move, storage: Move[]): void {}
  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {};
  performPerTick = async (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) => {
    return true;
  };
}

export class ForwardExecutor extends MovementExecutor {
  private currentIndex!: number;

  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    if (xzVel.norm() > 0.17) {
      this.bot.clearControlStates();
      this.bot.setControlState('sneak', true)
      return false;
    } else {
      this.bot.setControlState('sneak', false)
    }

    if (this.bot.entity.position.distanceTo(thisMove.exitPos) < 0.2) return true;

    const offset = thisMove.toVec().offset(0.5, 0, 0.5);
    const bb = AABBUtils.getPlayerAABB({ position: this.bot.entity.position, width: 1, height: 1.8 });
    // console.log(bb.containsVec(offset), bb, offset)
    if (this.bot.entity.onGround && !bb.containsVec(offset)) {
      this.bot.clearControlStates();
      return true;
    }
    // await this.bot.lookAt(offset, true);
    this.bot.setControlState("forward", false);
    this.bot.setControlState("back", true);
    return false;

    // if (this.bot.entity.position.xzDistanceTo(thisMove.entryPos.offset(0.5, 0, 0.5)) < 0.2) return true;
    // this.bot.lookAt(thisMove., true);
    // this.bot.setControlState('forward', true);
    // return this.bot.entity.onGround;
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]) {
    // console.log("ForwardMove", thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length);

    this.currentIndex = 0;
    for (const breakH of thisMove.toBreak) {
      await this.performInteraction(breakH);
    }

    if (thisMove.toPlace.length > 0) {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);

      // console.log(thisMove.exitPos, offset, 'hi');

      await this.bot.lookAt(offset, true);
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("back", true);
    } else {
      await this.bot.lookAt(thisMove.exitPos, true);
      this.bot.setControlState("forward", true);
      if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
      else this.bot.setControlState("sprint", true);
    }

    for (const place of thisMove.toPlace) {
      await this.performInteraction(place);
    }

    // console.log("done move prehandle!");
  }

  private async identMove(thisMove: Move, currentIndex: number, path: Move[]) {
    let lastMove = thisMove;
    let nextMove = path[++currentIndex];


    if (nextMove === undefined) return --currentIndex;

    const orgY = thisMove.entryPos.y;
    const width = 0.6;
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width, height: 1.8 });
    const verts = bb.expand(0, -1, 0).toVertices();

    const verts1 = [
      this.bot.entity.position.offset(-width/2, -0.6, -width/2),
      this.bot.entity.position.offset(width/2, -0.6, -width/2),
      this.bot.entity.position.offset(width/2, -0.6, width/2),
      this.bot.entity.position.offset(-width/2, -0.6, width/2),
    ];

    const pos0 = this.bot.entity.position;

    while (lastMove.exitPos.y === orgY) {
      if (nextMove === undefined) return --currentIndex;
      for (const vert of verts) {
        const offset = vert.minus(this.bot.entity.position);
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
        const test = test1.plus(offset);
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 2;
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize(), dist)) as unknown as RayType;
        const valid0 = !raycast0 || raycast0.position.distanceTo(pos0) > dist;
        if (!valid0) {
          return --currentIndex;
        }
      }

      let counter = verts1.length;
      for (const vert of verts1) {
        const offset = vert.minus(this.bot.entity.position);
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
        const test = test1.plus(offset);
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 2;
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize(), dist, (block) =>
          BlockInfo.replaceables.has(block.type)
        )) as unknown as RayType;

        const valid0 = !raycast0 || raycast0.position.distanceTo(pos0) > dist;
        if (!valid0) counter--;
      }

      if (counter === 0) return --currentIndex;

      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }
    return --currentIndex;
  }

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) {
    if (this.cI && !this.cI.allowExternalInfluence(this.bot, 5)) {
      this.bot.clearControlStates();
      return false;
    }

    if (tickCount > 160) throw new CancelError("ForwardMove: tickCount > 160");
    if (!this.bot.entity.onGround) throw new CancelError("ForwardMove: not on ground");

    if (thisMove.toPlace.length > 0) {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
      this.bot.lookAt(offset, true);
      if (this.bot.entity.position.xzDistanceTo(offset) < 0.2) return true;
    } else {
      if (false) {
        const idx = await this.identMove(thisMove, currentIndex, path);
        this.currentIndex = Math.max(idx, this.currentIndex);
        const nextMove = path[this.currentIndex];
        console.log(currentIndex, this.currentIndex, idx, path.length, thisMove !== nextMove);
        console.log(nextMove.moveType.constructor.name)
        if (nextMove === undefined) {
          console.log(path.flatMap((m, idx) => [m.moveType.constructor.name, idx, m.entryPos, m.exitPos]));
        }
        if (currentIndex !== this.currentIndex && nextMove !== undefined) {
          // this.bot.lookAt(nextMove.exitPos, true);
          this.lookAtPathPos(nextMove.exitPos);
          if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2) return this.currentIndex - currentIndex;
        } else {
          // this.bot.lookAt(thisMove.exitPos, true);
          this.lookAtPathPos(thisMove.exitPos);
          return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
        }
      } else {
        this.lookAtPathPos(thisMove.exitPos);
        return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
      }
    }
    return false;
    // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
  }
}

export class ForwardJumpExecutor extends MovementExecutor {

  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    const offset = thisMove.toVec().offset(0.5, 0, 0.5);
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 1, height: 1.8 });
    // console.log(bb.containsVec(offset), bb, offset)
    if (this.bot.entity.onGround && !bb.containsVec(offset)) return true;
    this.bot.lookAt(offset, true);
    this.bot.setControlState("forward", false);
    this.bot.setControlState("back", true);
    return false;

    // if (this.bot.entity.position.xzDistanceTo(thisMove.entryPos.offset(0.5, 0, 0.5)) < 0.2) return true;
    // this.bot.lookAt(thisMove., true);
    // this.bot.setControlState('forward', true);
    // return this.bot.entity.onGround;
  }

  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {
    // console.log("ForwardJumpMove", thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length);
    await this.bot.lookAt(thisMove.exitPos, true);

    if (thisMove.toBreak.length > 0) {
      await this.bot.clearControlStates();
      for (const breakH of thisMove.toBreak) {
        await this.performInteraction(breakH);
      }
    }

    // do some fancy handling here, will think of something later.
    if (thisMove.toPlace.length === 2) {
      let info = await thisMove.toPlace[0].performInfo(this.bot, 0);
      if (info.raycasts.length === 0) {
        this.bot.setControlState("forward", true);
        await this.performInteraction(thisMove.toPlace[0]);
      } else {
        this.bot.setControlState("forward", false);
        await this.performInteraction(thisMove.toPlace[0], { info });
      }

      await this.bot.lookAt(thisMove.exitPos, true);
      this.bot.setControlState("back", false);
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("forward", true);
      this.bot.setControlState("jump", true);

      while (this.bot.entity.position.y - thisMove.exitPos.y < 0) {
        await this.bot.lookAt(thisMove.exitPos, true);
        await this.bot.waitForTicks(1);
        // console.log('loop 0')
      }
      info = await thisMove.toPlace[1].performInfo(this.bot);
      while (info.raycasts.length === 0) {
        await this.bot.lookAt(thisMove.exitPos, true);
        await this.bot.waitForTicks(1);

        info = await thisMove.toPlace[1].performInfo(this.bot);
        // console.log('loop 1', this.bot.entity.position)
      }

      // console.log("YAY", thisMove.entryPos, this.bot.entity.position, info.raycasts[0].intersect)
      this.bot.setControlState("forward", true);
      this.bot.setControlState("jump", false);
      this.bot.setControlState("sprint", true);
      await this.performInteraction(thisMove.toPlace[1], { info });

      await this.bot.lookAt(thisMove.exitPos, true);
    } else {
      this.bot.setControlState("forward", true);
      this.bot.setControlState("jump", true);
      this.bot.setControlState("sprint", true);
      for (const place of thisMove.toPlace) {
        await this.performInteraction(place);
      }
    }
  };

  performPerTick = (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) => {
    this.bot.lookAt(thisMove.exitPos, true);

    if (tickCount > 160) throw new CancelError("ForwardJumpMove: tickCount > 160");
    if (this.bot.entity.position.y - thisMove.exitPos.y < -1) throw new CancelError("ForwardJumpMove: too low (1)");

    if (tickCount > 0 && this.bot.entity.onGround) {
      this.bot.setControlState("jump", false);
      this.bot.setControlState("sprint", true);

      if (this.bot.entity.position.y - thisMove.exitPos.y < 0) throw new CancelError("ForwardJumpMove: too low (2)");
      if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.3) return true;
    }

    return false;
  };
}

export class ForwardDropDownExecutor extends MovementExecutor {
  maxDropDown = 3;
  infiniteLiquidDropdownDistance = true;

  private currentIndex!: number;

  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {
    this.currentIndex = currentIndex;
    await this.bot.lookAt(thisMove.exitPos, true);

    for (const breakH of thisMove.toBreak) {
      await this.performInteraction(breakH);
    }

    for (const place of thisMove.toPlace) {
      await this.performInteraction(place);
    }

    // console.log(thisMove.exitPos, thisMove.x, thisMove.y, thisMove.z);
    this.bot.setControlState("forward", true);
    this.bot.setControlState("sprint", true);
  };

  private identMove(thisMove: Move, currentIndex: number, path: Move[]) {
    let lastMove = thisMove;
    let nextMove = path[++currentIndex];

    if (nextMove === undefined) return --currentIndex;

    const pos = this.bot.entity.position;

    while (
      lastMove.entryPos.xzDistanceTo(pos) > lastMove.entryPos.xzDistanceTo(lastMove.exitPos) &&
      lastMove.entryPos.y >= nextMove.exitPos.y
    ) {
      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }

    return --currentIndex;
  }

  performPerTick = (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) => {
    if (this.cI && !this.cI.allowExternalInfluence(this.bot, 5)) {
      this.bot.clearControlStates();
      return false;
    }

    if (tickCount > 160) throw new CancelError("ForwardDropDown: tickCount > 160");

    if (false) {
      const idx = this.identMove(thisMove, currentIndex, path);
      this.currentIndex = Math.max(idx, this.currentIndex);
      const nextMove = path[this.currentIndex];
      console.log(currentIndex, this.currentIndex, idx, path.length, thisMove !== nextMove);

   
      // make sure movements are in approximate conjunction.
      //off0.dot(off1) > 0.85 &&
      if (currentIndex !== this.currentIndex && nextMove !== undefined) {
        // TODO: perform fall damage check to ensure this is allowed.
        this.bot.lookAt(nextMove.exitPos, true);
        // console.log("hi", this.bot.entity.position, nextMove.exitPos, this.bot.entity.position.xzDistanceTo(nextMove.exitPos), this.bot.entity.position.y, nextMove.exitPos.y)
        if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2 && this.bot.entity.position.y === nextMove.exitPos.y)
          return this.currentIndex - currentIndex;

        // }
      } else {
        // console.log(this.bot.entity.position, thisMove.exitPos, thisMove.entryPos, thisMove.exitPos.xzDistanceTo(this.bot.entity.position), thisMove.entryPos.xzDistanceTo(this.bot.entity.position))
        if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && this.bot.entity.position.y === thisMove.exitPos.y) return true;
        this.bot.lookAt(thisMove.exitPos, true);
      }
    } else {
      this.bot.lookAt(thisMove.exitPos, true);
      if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && this.bot.entity.position.y === thisMove.exitPos.y) return true;
    }

    this.bot.setControlState("forward", true);
    if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
    else this.bot.setControlState("sprint", true);

    return false;
  };

  getLandingBlock(node: Move, dir: Vec3) {
    let blockLand = this.getBlockInfo(node, dir.x, -2, dir.z);
    while (blockLand.position && blockLand.position.y > (this.bot.game as any).minY) {
      if (blockLand.liquid && blockLand.safe) return blockLand;
      if (blockLand.physical) {
        if (node.y - blockLand.position.y <= this.maxDropDown) return this.getBlock(blockLand.position, 0, 1, 0);
        return null;
      }
      if (!blockLand.safe) return null;
      blockLand = this.getBlockInfo(blockLand.position, 0, -1, 0);
    }
    return null;
  }
}

export class DiagonalExecutor extends MovementExecutor {
  static diagonalCost = 1.4142135623730951; // sqrt(2)

  private currentIndex!: number;
 

  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {
    this.currentIndex = currentIndex;

    await this.bot.lookAt(thisMove.exitPos, true);
    this.bot.setControlState("forward", true);
    this.bot.setControlState("sprint", this.bot.food > 6);

    for (const breakH of thisMove.toBreak) {
      await this.performInteraction(breakH);
    }
  };

  private async identMove(thisMove: Move, currentIndex: number, path: Move[]) {
    let lastMove = thisMove;
    let nextMove = path[++currentIndex];

    if (nextMove === undefined) return --currentIndex;

    const orgY = thisMove.entryPos.y;

    const width = 0.6
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width, height: 1.8 });
    const verts = bb.expand(0, -1, 0).toVertices();
    const verts1 = [
      this.bot.entity.position.offset(-width/2, -0.6, -width/2),
      this.bot.entity.position.offset(width/2, -0.6, -width/2),
      this.bot.entity.position.offset(width/2 ,-0.6, width/2),
      this.bot.entity.position.offset(-width/2 ,-0.6, width/2),
    ];


    const pos0 = this.bot.entity.position;

    while (lastMove.exitPos.y === orgY) {
      if (nextMove === undefined) return --currentIndex;
      for (const vert of verts) {
        const offset = vert.minus(this.bot.entity.position);
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
        const test = test1.plus(offset);
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 2;
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize(), dist)) as unknown as RayType;
        const valid0 = !raycast0 || raycast0.position.distanceTo(pos0) > dist;
        if (!valid0) {
          return --currentIndex;
        }
      }

      let counter = verts1.length;
      for (const vert of verts1) {
        const offset = vert.minus(this.bot.entity.position);
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
        const test = test1.plus(offset);
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 2;
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize(), dist, (block) =>
          BlockInfo.replaceables.has(block.type)
        )) as unknown as RayType;

        const valid0 = !raycast0 || raycast0.position.distanceTo(pos0) > dist;
        if (!valid0) counter--;
      }

      if (counter === 0) return --currentIndex;

      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }
    return --currentIndex;
  }

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) {
    if (this.cI && !this.cI.allowExternalInfluence(this.bot, 5)) {
      this.bot.clearControlStates();
      return false;
    }

    if (tickCount > 160) throw new CancelError("Diagonal: tickCount > 160");
    if (!this.bot.entity.onGround) throw new CancelError("Diagonal: not on ground");

    if (false) {
      const idx = await this.identMove(thisMove, currentIndex, path);
      this.currentIndex = Math.max(idx, this.currentIndex);
      const nextMove = path[this.currentIndex];
      console.log(currentIndex, this.currentIndex, idx, path.length, thisMove !== nextMove);
      if (currentIndex !== this.currentIndex && nextMove !== undefined) {
        // this.bot.lookAt(nextMove.exitPos, true);
        this.lookAtPathPos(nextMove.exitPos);
        if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2) return this.currentIndex - currentIndex;
      } else {
        // this.bot.lookAt(thisMove.exitPos, true);
        this.lookAtPathPos(thisMove.exitPos);
        return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
      }
    } else {
      this.lookAtPathPos(thisMove.exitPos);
      if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2) return true;
    }

    return false;
  }
}

export class StraightDownExecutor extends MovementExecutor {
  maxDropDown = 3;

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    for (const breakH of thisMove.toBreak) {
      await this.performInteraction(breakH);
    }
  }
  performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    return tickCount > 0 && this.bot.entity.onGround;
  }
}

export class StraightUpExecutor extends MovementExecutor {
  allow1by1towers = true;


  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    this.bot.clearControlStates();
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.3 && xzVel.norm() < 0.05) {
      return true;
    }
    this.bot.lookAt(thisMove.exitPos, true);
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0.2) {
      this.bot.setControlState("forward", true);
      this.bot.setControlState("sprint", true);
      this.bot.setControlState("sneak", false);
    } else {
      this.bot.setControlState("forward", true);
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("sneak", true);
    }
    return false;
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    for (const breakH of thisMove.toBreak) {
      await this.performInteraction(breakH);
    }

    this.bot.setControlState("jump", true);

    // console.log(thisMove.toPlace.length)
    for (const place of thisMove.toPlace) {
      await this.performInteraction(place);
    }
  }
  performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    // this.bot.setControlState('sneak', false)
    return tickCount > 0 && this.bot.entity.onGround;
  }

}

export class ParkourForwardExecutor extends MovementExecutor {
  allowSprinting = true;

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    await this.bot.lookAt(thisMove.exitPos, true);
    controls.getBotSmartMovement(this.bot, thisMove.exitPos, true)();
    controls.getBotStrafeAim(this.bot, thisMove.exitPos)();
    this.bot.chat(`/particle flame ${thisMove.exitPos.x} ${thisMove.exitPos.y} ${thisMove.exitPos.z} 0 0.5 0 0 10 force`);
  }

  // TODO: Fix this. Good thing I've done this before. >:)
  performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if (this.cI && !this.cI.allowExternalInfluence(this.bot, 5)) {
      this.bot.clearControlStates();
      return false;
    }

    const closeToGoal = thisMove.entryPos.distanceTo(this.bot.entity.position) > thisMove.exitPos.distanceTo(this.bot.entity.position);

    if (this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm() > 145) {
      this.bot.setControlState("jump", true);
    }

    controls.getBotSmartMovement(this.bot, thisMove.exitPos, true)();
    controls.getBotStrafeAim(this.bot, thisMove.exitPos)();

    if (tickCount > 160) throw new CancelError("ParkourForward: tickCount > 160");

    if (tickCount > 0 && this.bot.entity.onGround && closeToGoal) {
      this.bot.setControlState("jump", false);
    }

    if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2) return true;
    return false;
  }
}
