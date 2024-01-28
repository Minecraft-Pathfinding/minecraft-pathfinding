import { Vec3 } from "vec3";
import { goals } from "../goals";
import { Move } from "../move";
import { Movement } from "./movement";
import { CancelError } from "./exceptions";
import { BlockInfo } from "../world/cacheWorld";
import { RayType } from "./interactionUtils";
import { AABB, AABBUtils } from "@nxg-org/mineflayer-util-plugin";
import * as controls from "./controls";
import { MovementExecutor } from "./movementExecutor";
import { JumpCalculator } from "./movementUtils";

export class IdleMovementExecutor extends Movement {
  provideMovements(start: Move, storage: Move[]): void {}
  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {};
  performPerTick = async (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) => {
    return true;
  };
}

export class ForwardExecutor extends MovementExecutor {
  private currentIndex!: number;


 
  // protected isComplete(startMove: Move, endMove: Move): boolean {
  //     return this.bot.entity.position.xzDistanceTo(endMove.exitPos) < 0.2 && this.bot.entity.position.y === endMove.exitPos.y;
  // }

  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    if (thisMove.toPlace.length > 0) {
      const off0 = thisMove.exitPos.minus(this.bot.entity.position);
      const off1 = thisMove.exitPos.minus(thisMove.entryPos);

      // console.log(off0.dot(off1), off0, off1)

      off0.translate(0, -off0.y, 0);
      off1.translate(0, -off1.y, 0);

      const similarDirection = off0.normalize().dot(off1.normalize()) > 0.9;

      if (similarDirection) {
        const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 });
        const bb1 = AABB.fromBlock(thisMove.exitPos.floored().translate(0, -1, 0));

        if (bb0.collides(bb1)) {
          // console.log("intersect")
          return true;
        }
      }

      if (thisMove.toPlace.length > 0) {
        const offset = this.bot.entity.position.minus(thisMove.entryPos).plus(this.bot.entity.position);

        void this.lookAt(offset, true);
        this.bot.setControlState("sprint", false);
        this.bot.setControlState("back", true);
      } else {
        void this.lookAt(thisMove.entryPos, true);
        this.bot.setControlState("forward", true);
        if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
        else this.bot.setControlState("sprint", true);
      }
    }

    // console.log("align", this.bot.entity.position, thisMove.exitPos, this.bot.entity.position.xzDistanceTo(thisMove.exitPos), this.bot.entity.onGround)
    // return this.bot.entity.position.distanceTo(thisMove.entryPos) < 0.2 && this.bot.entity.onGround;
    return this.bot.entity.onGround;
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]) {
    // console.log("ForwardMove", thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length);

    this.bot.clearControlStates();
    this.currentIndex = 0;

    if (thisMove.toPlace.length > 0) {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);

      await this.lookAt(offset, true);
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("back", true);
    } else {
      await this.lookAt(thisMove.exitPos, true);
      this.bot.setControlState("forward", true);
      if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
      else this.bot.setControlState("sprint", true);
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
      this.bot.entity.position.offset(-width / 2, -0.6, -width / 2),
      this.bot.entity.position.offset(width / 2, -0.6, -width / 2),
      this.bot.entity.position.offset(width / 2, -0.6, width / 2),
      this.bot.entity.position.offset(-width / 2, -0.6, width / 2),
    ];

    const pos0 = this.bot.entity.position;

    while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
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
    } else if (!this.cI) {
      const test = await this.interactPossible();
      if (test) {
        void this.performInteraction(test);
        return false;
      }
    }

    if (tickCount > 160) throw new CancelError("ForwardMove: tickCount > 160");
    if (!this.bot.entity.onGround) throw new CancelError("ForwardMove: not on ground");
    if ((this.bot.entity as any).isCollidedHorizontally) {
      // if (this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm() < 0.02)
        // throw new CancelError("ForwardMove: collided horizontally");
    }

    if (thisMove.toPlace.length > 0) {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
      this.lookAt(offset, true);
      if (this.isComplete(thisMove, thisMove)) return true;
      // if (this.bot.entity.position.xzDistanceTo(offset) < 0.2) return true;
    } else {
      if (true) {
        const idx = await this.identMove(thisMove, currentIndex, path);
        this.currentIndex = Math.max(idx, this.currentIndex);
        const nextMove = path[this.currentIndex];
        if (currentIndex !== this.currentIndex && nextMove !== undefined) {
          // this.lookAt(nextMove.exitPos, true);
          this.lookAt(nextMove.exitPos);
          if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex;
          // if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2) return this.currentIndex - currentIndex;
        } else {
          // this.lookAt(thisMove.exitPos, true);
          this.lookAt(thisMove.exitPos);
          return this.isComplete(thisMove, thisMove);
          // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
        }
      } else {
        this.lookAt(thisMove.exitPos);
        return this.isComplete(thisMove, thisMove);
        // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
      }
    }
    return false;
    // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
  }
}

export class ForwardJumpExecutor extends MovementExecutor {
  jumpInfo!: ReturnType<JumpCalculator["findJumpPoint"]>;

  private shitter: JumpCalculator = new JumpCalculator(this.sim, this.bot, this.world, this.simCtx);


  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    // const offset = thisMove.exi();
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 1, height: 1.8 });
    // console.log(bb.containsVec(offset), bb, offset)
    if (this.bot.entity.onGround) return true;
    // this.lookAt(offset, true);
    // this.bot.setControlState("forward", false);
    // this.bot.setControlState("back", true);
    return false;

    // if (this.bot.entity.position.xzDistanceTo(thisMove.entryPos.offset(0.5, 0, 0.5)) < 0.2) return true;
    // this.lookAt(thisMove., true);
    // this.bot.setControlState('forward', true);
    // return this.bot.entity.onGround;
  }

  private async performTwoPlace(thisMove: Move) {
    let info = await thisMove.toPlace[0].performInfo(this.bot, 0);
    if (info.raycasts.length === 0) {
      this.bot.setControlState("forward", true);
      await this.performInteraction(thisMove.toPlace[0]);
    } else {
      this.bot.setControlState("forward", false);
      await this.performInteraction(thisMove.toPlace[0], { info });
    }

    await this.lookAt(thisMove.exitPos, true);
    this.bot.setControlState("back", false);
    this.bot.setControlState("sprint", false);
    this.bot.setControlState("forward", true);
    this.bot.setControlState("jump", true);

    while (this.bot.entity.position.y - thisMove.exitPos.y < 0) {
      await this.lookAt(thisMove.exitPos, true);
      await this.bot.waitForTicks(1);
      // console.log('loop 0')
    }
    info = await thisMove.toPlace[1].performInfo(this.bot);
    while (info.raycasts.length === 0) {
      await this.lookAt(thisMove.exitPos, true);
      await this.bot.waitForTicks(1);

      info = await thisMove.toPlace[1].performInfo(this.bot);
      // console.log('loop 1', this.bot.entity.position)
    }

    // console.log("YAY", thisMove.entryPos, this.bot.entity.position, info.raycasts[0].intersect)
  
    await this.performInteraction(thisMove.toPlace[1], { info });

    await this.lookAt(thisMove.exitPos, true);
  }

  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {


    // console.log("ForwardJumpMove", thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length);
    await this.lookAt(thisMove.exitPos, true);

    if (thisMove.toBreak.length > 0) {
      await this.bot.clearControlStates();
      for (const breakH of thisMove.toBreak) {
        await this.performInteraction(breakH);
      }
    }

    // do some fancy handling here, will think of something later.
    if (thisMove.toPlace.length === 2) {
      await this.performTwoPlace(thisMove);
    } else {
      
      this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos);
      if (this.jumpInfo === null) {
        this.bot.setControlState("forward", true)
        this.bot.setControlState("jump", true)
        this.bot.setControlState("sprint", true)
      } 
      console.log("info", this.jumpInfo)
      for (const place of thisMove.toPlace) {
        await this.performInteraction(place);
      }
    }
  };

  performPerTick = (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) => {

    if (this.jumpInfo) {
      if (tickCount >= this.jumpInfo.sprintTick) {
        this.bot.setControlState("sprint", true);
        this.bot.setControlState("forward", true)
      } else {
        this.bot.setControlState("sprint", false);
        this.bot.setControlState("forward", false)
      }
      if (tickCount >= this.jumpInfo.jumpTick) {
        this.bot.setControlState("jump", true);
      } else {
        this.bot.setControlState("jump", false);
      }
    }
  
    this.lookAt(thisMove.exitPos, true);

    if (tickCount > 160) throw new CancelError("ForwardJumpMove: tickCount > 160");

    // very lazy way of doing this.
    if (this.bot.entity.position.y - thisMove.exitPos.y < -1.25) throw new CancelError("ForwardJumpMove: too low (1)");

    if (tickCount > 0 && this.bot.entity.onGround) {
      this.bot.setControlState("jump", false);
      this.bot.setControlState("sprint", true);

      // very lazy way of doing this.
      if (this.bot.entity.position.y - thisMove.exitPos.y < -0.25) throw new CancelError("ForwardJumpMove: too low (2) " + this.bot.entity.position.y, thisMove.exitPos.y);
    }

    return this.isComplete(thisMove, thisMove);
  };
}

export class ForwardDropDownExecutor extends MovementExecutor {
  private currentIndex!: number;

  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {
    this.currentIndex = currentIndex;
    await this.lookAt(thisMove.exitPos, true);

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
      lastMove.exitPos.y >= nextMove.exitPos.y &&
      nextMove.moveType.toPlaceLen() === 0 &&
      pos.y >= nextMove.entryPos.y
    ) {
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
    } else if (!this.cI) {
      const test = await this.interactPossible();
      if (test) {
        void this.performInteraction(test);
        return false;
      }
    }

    if (tickCount > 160) throw new CancelError("ForwardDropDown: tickCount > 160");

    if (true) {
      const idx = this.identMove(thisMove, currentIndex, path);
      this.currentIndex = Math.max(idx, this.currentIndex);
      const nextMove = path[this.currentIndex];
      // console.log(currentIndex, this.currentIndex, idx, path.length, thisMove !== nextMove);

      // make sure movements are in approximate conjunction.
      //off0.dot(off1) > 0.85 &&
      if (currentIndex !== this.currentIndex && nextMove !== undefined) {
        // TODO: perform fall damage check to ensure this is allowed.
        this.lookAt(nextMove.exitPos, true);
        // console.log("hi", this.bot.entity.position, nextMove.exitPos, this.bot.entity.position.xzDistanceTo(nextMove.exitPos), this.bot.entity.position.y, nextMove.exitPos.y)
        // if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2 && this.bot.entity.position.y === nextMove.exitPos.y)
        if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex;

        // }
      } else {
        // console.log(this.bot.entity.position, thisMove.exitPos, thisMove.entryPos, thisMove.exitPos.xzDistanceTo(this.bot.entity.position), thisMove.entryPos.xzDistanceTo(this.bot.entity.position))
        // if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && this.bot.entity.position.y === thisMove.exitPos.y) return true;
        if (this.isComplete(thisMove, thisMove)) return true;
        this.lookAt(thisMove.exitPos, true);
      }
    } else {
      this.lookAt(thisMove.exitPos, true);
      if (this.isComplete(thisMove, thisMove)) return true;
      // if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && this.bot.entity.position.y === thisMove.exitPos.y) return true;
    }

    this.bot.setControlState("forward", true);
    if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
    else this.bot.setControlState("sprint", true);

    return false;
  }

  getLandingBlock(node: Move, dir: Vec3) {
    let blockLand = this.getBlockInfo(node, dir.x, -2, dir.z);
    while (blockLand.position && blockLand.position.y > (this.bot.game as any).minY) {
      if (blockLand.liquid && blockLand.safe) return blockLand;
      if (blockLand.physical) {
        if (node.y - blockLand.position.y <= this.settings.maxDropDown) return this.getBlock(blockLand.position, 0, 1, 0);
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

  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    return this.bot.entity.onGround;
  }

  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {
    this.currentIndex = currentIndex;

    this.bot.clearControlStates();
    await this.lookAt(thisMove.exitPos, true);
    this.bot.setControlState("forward", true);
    this.bot.setControlState("sprint", this.bot.food > 6);
  };

  private async identMove(thisMove: Move, currentIndex: number, path: Move[]) {
    let lastMove = thisMove;
    let nextMove = path[++currentIndex];

    if (nextMove === undefined) return --currentIndex;

    const orgY = thisMove.entryPos.y;

    const width = 0.6;
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width, height: 1.8 });
    const verts = bb.expand(0, -1, 0).toVertices();
    const verts1 = [
      this.bot.entity.position.offset(-width / 2, -0.6, -width / 2),
      this.bot.entity.position.offset(width / 2, -0.6, -width / 2),
      this.bot.entity.position.offset(width / 2, -0.6, width / 2),
      this.bot.entity.position.offset(-width / 2, -0.6, width / 2),
    ];

    const pos0 = this.bot.entity.position;

    while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
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
    } else if (!this.cI) {
      const test = await this.interactPossible();
      if (test) {
        void this.performInteraction(test);
        return false;
      }
    }

    if (tickCount > 160) throw new CancelError("Diagonal: tickCount > 160");
    if (!this.bot.entity.onGround) throw new CancelError("Diagonal: not on ground");

    if (true) {
      const idx = await this.identMove(thisMove, currentIndex, path);
      this.currentIndex = Math.max(idx, this.currentIndex);
      const nextMove = path[this.currentIndex];
      console.log(currentIndex, this.currentIndex, idx, path.length, thisMove !== nextMove);
      if (currentIndex !== this.currentIndex && nextMove !== undefined) {
        // this.lookAt(nextMove.exitPos, true);
        this.lookAtPathPos(nextMove.exitPos);
        if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex;
      } else {
        // this.lookAt(thisMove.exitPos, true);
        this.lookAtPathPos(thisMove.exitPos);
        return this.isComplete(thisMove, thisMove);
      }
    } else {
      this.lookAtPathPos(thisMove.exitPos);
      if (this.isComplete(thisMove, thisMove)) return true;
    }

    return false;
  }
}

export class StraightDownExecutor extends MovementExecutor {
  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    this.bot.clearControlStates();
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && xzVel.norm() < 0.1) {
      return true;
    }
    this.lookAt(thisMove.exitPos, true);

    // provided that velocity is not pointing towards goal OR distance to goal is greater than 0.5 (not near center of block)
    // adjust as quickly as possible to goal.
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0 || this.bot.entity.position.distanceTo(thisMove.exitPos) > 0.5) {
      this.bot.setControlState("forward", true);
      this.bot.setControlState("sprint", true);
      this.bot.setControlState("sneak", false);
    }

    // if velocity is already heading towards the goal, slow down.
    else {
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
  }
  performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if (this.bot.entity.position.y < thisMove.exitPos.y) throw new CancelError("StraightDown: too low");
    return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y === thisMove.exitPos.y;
  }
}

export class StraightUpExecutor extends MovementExecutor {
  isAlreadyCompleted(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    return this.bot.entity.position.y >= thisMove.exitPos.y;
  }

  align(thisMove: Move): boolean {
    this.bot.clearControlStates();
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && xzVel.norm() < 0.1) {
      return true;
    }
    this.lookAt(thisMove.exitPos, true);

    // provided that velocity is not pointing towards goal OR distance to goal is greater than 0.5 (not near center of block)
    // adjust as quickly as possible to goal.
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0 || this.bot.entity.position.distanceTo(thisMove.exitPos) > 0.5) {
      this.bot.setControlState("forward", true);
      this.bot.setControlState("sprint", true);
      this.bot.setControlState("sneak", false);
    }

    // if velocity is already heading towards the goal, slow down.
    else {
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
    if (this.bot.entity.position.y < thisMove.entryPos.y) throw new CancelError("StraightUp: too low");
    // this.bot.setControlState('sneak', false)
    this.align(thisMove);
    return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y >= thisMove.exitPos.y;
  }
}

export class ParkourForwardExecutor extends MovementExecutor {
  allowSprinting = true;

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    await this.lookAt(thisMove.exitPos, true);
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

    return this.isComplete(thisMove, thisMove);
    // if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2) return true;
    return false;
  }
}
