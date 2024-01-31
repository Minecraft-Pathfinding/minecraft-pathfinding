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
import { JumpCalculator, findStraightLine } from "./movementUtils";

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

  /**
   * TOOD: not yet working.
   */
  private async facingCorrectDir() {

    return this.currentMove?.toPlace.length === 0
    const wanted = await this.interactPossible(15);

    if (wanted) {
      const test = await wanted!.performInfo(this.bot, 15);

      // cannot do interact while facing initial direction
      if (test.raycasts.length > 0) {

        // sort by dot product
        const works = test.raycasts
        const stateEyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0);
        const lookDir = this.bot.util.getViewDir();
        works.sort((a, b) => b.intersect.minus(stateEyePos).dot(lookDir) - a.intersect.minus(stateEyePos).dot(lookDir));


        const wanted = works[0].intersect;
        const xzLookDir = lookDir.offset(0, -lookDir.y, 0).normalize();

        // check if wanted is currently seeable given current vector

        const wantDir = wanted.minus(this.bot.entity.position).normalize();
        const xzWantDir = wantDir.offset(0, -wantDir.y, 0).normalize();

        console.log(xzWantDir, xzLookDir, xzWantDir.dot(xzLookDir), wanted, this.bot.entity.position, this.bot.entity.position.distanceTo(wanted) < 5)
        return xzWantDir.dot(xzLookDir) > 0.9;
      } else {
        return false;
      }
    }

    return this.toBreakLen() === 0 && this.toPlaceLen() === 0;
  }

  async align(thisMove: Move, tickCount: number, goal: goals.Goal) {
    let faceForward = await this.facingCorrectDir();

    if (faceForward) {
      void this.lookAt(thisMove.entryPos);
      this.bot.setControlState("forward", true);
      if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
      else this.bot.setControlState("sprint", true);
    } else {
      const offset = this.bot.entity.position.minus(thisMove.entryPos).plus(this.bot.entity.position);
      void this.lookAt(offset);
      this.bot.setControlState("forward", false);
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("back", true);
    }
    // console.log("align", this.bot.entity.position, thisMove.exitPos, this.bot.entity.position.xzDistanceTo(thisMove.exitPos), this.bot.entity.onGround)
    // return this.bot.entity.position.distanceTo(thisMove.entryPos) < 0.2 && this.bot.entity.onGround;

    const off0 = thisMove.exitPos.minus(this.bot.entity.position);
    const off1 = thisMove.exitPos.minus(thisMove.entryPos);
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);

    // console.log(off0.dot(off1), off0, off1)

    off0.translate(0, -off0.y, 0);
    off1.translate(0, -off1.y, 0);

    const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95;
    // console.log(similarDirection, thisMove.moveType.constructor.name);
    // if (!similarDirection) {
    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 });
    const bb1 = AABB.fromBlock(thisMove.entryPos.floored().translate(0, -1, 0));

    // console.log(bb0.collides(bb1), bb0, bb1, this.bot.entity.position.distanceTo(thisMove.entryPos))
    if (bb0.collides(bb1) && this.bot.entity.position.xzDistanceTo(thisMove.entryPos) < 0.2) {
      console.log("intersect");
      return this.isLookingAt(thisMove.entryPos);
    }

    return false;
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]) {
    // console.log("ForwardMove", thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length);

    this.bot.clearControlStates();
    this.currentIndex = 0;

    let faceForward = await this.facingCorrectDir();

    if (faceForward) {
      void this.lookAt(thisMove.entryPos);
      this.bot.setControlState("forward", true);
      if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
      else this.bot.setControlState("sprint", true);
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
      void this.lookAt(offset);
      this.bot.setControlState('forward', false)
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("back", true);
    }

    // console.log("done move prehandle!");
  }

  private async identMove(thisMove: Move, currentIndex: number, path: Move[]) {
    let lastMove = thisMove;
    let nextMove = path[++currentIndex];

    if (nextMove === undefined) return --currentIndex;

    const orgY = thisMove.entryPos.y;
    const width = 0.61;
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
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 1;
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize().scale(0.5), dist * 2)) as unknown as RayType;
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
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 1;
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize().scale(0.5), dist * 2, (block) =>
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
    if (this.cI && !this.cI.allowExternalInfluence(this.bot, 1)) {
      this.bot.clearControlStates();
      return false;
    } else if (!this.cI) {
      const start = performance.now();
      const test = await this.interactPossible(15);
      if (test) {
        void this.performInteraction(test);
        return false;
      }
    }

    if (tickCount > 160) throw new CancelError("ForwardMove: tickCount > 160");
    if (!this.bot.entity.onGround) {
      // console.log(this.bot.entity.position, this.bot.entity.velocity);
      throw new CancelError("ForwardMove: not on ground");
    }
    if ((this.bot.entity as any).isCollidedHorizontally) {
      // if (this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm() < 0.02)
      // throw new CancelError("ForwardMove: collided horizontally");
    }

    let faceForward = await this.facingCorrectDir();

    if (faceForward) {
      if (false) {
        this.bot.setControlState("back", false);
        this.bot.setControlState("sprint", true);
        this.bot.setControlState("forward", true);
        const idx = await this.identMove(thisMove, currentIndex, path);
        this.currentIndex = Math.max(idx, this.currentIndex);
        const nextMove = path[this.currentIndex];
        if (currentIndex !== this.currentIndex && nextMove !== undefined) {
          // this.lookAt(nextMove.exitPos, true);
          this.alignToPath(thisMove, nextMove);
          if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex;
          // if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2) return this.currentIndex - currentIndex;
        } else {
          // this.lookAt(thisMove.exitPos, true);
          this.alignToPath(thisMove);
          return this.isComplete(thisMove);
          // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
        }
      } else {
        this.lookAt(thisMove.exitPos);
        this.bot.setControlState("forward", true);
        this.bot.setControlState("sprint", true);
        this.bot.setControlState("back", false);
        return this.isComplete(thisMove);
        // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
      }
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
      void this.lookAt(offset);
      this.bot.setControlState('forward', false)
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("back", true);
      return this.isComplete(thisMove);
    }

 
    return false;
    // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
  }
}

export class ForwardJumpExecutor extends MovementExecutor {
  jumpInfo!: ReturnType<JumpCalculator["findJumpPoint"]>;

  private shitter: JumpCalculator = new JumpCalculator(this.sim, this.bot, this.world, this.simCtx);

  private flag = false;

  protected isComplete(startMove: Move, endMove?: Move): boolean {
    return super.isComplete(startMove, endMove, 0);
  }

  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    // const offset = thisMove.exi();
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 });
    // console.log(bb.containsVec(offset), bb, offset)
    // return this.bot.entity.onGround;
    if (this.flag) {
      void this.lookAt(thisMove.entryPos);
      this.bot.setControlState("forward", true);
      this.bot.setControlState("back", false);
      this.bot.setControlState("sprint", true);
      const bigBB = AABB.fromBlock(thisMove.entryPos.floored()).extend(0, 1, 0);
      return bigBB.contains(bb) && this.bot.entity.onGround;
      // if (this.bot.entity.position.xzDistanceTo(thisMove.entryPos) < 0.2) return true;
    } else if (this.bot.entity.onGround) {
      if (thisMove.toPlace.length === 0) {
        this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos);
        if (this.jumpInfo === null) {
          this.flag = true;
          return false;
        }
      }

      return true;
    }
    // this.lookAt(offset, true);
    // this.bot.setControlState("forward", false);
    // this.bot.setControlState("back", true);
    return false;

    // if (this.bot.entity.position.xzDistanceTo(thisMove.entryPos.offset(0.5, 0, 0.5)) < 0.2) return true;
    // this.lookAt(thisMove., true);
    // this.bot.setControlState('forward', true);
    // return this.bot.entity.onGround;
  }

  // TODO: re-optimize.
  private async performTwoPlace(thisMove: Move) {
    this.bot.setControlState("sprint", false);
    let info = await thisMove.toPlace[0].performInfo(this.bot, 0);
    if (info.raycasts.length === 0) {
      this.bot.setControlState("forward", true);
      await this.performInteraction(thisMove.toPlace[0]);
    } else {
      this.bot.setControlState("forward", false);
      await this.performInteraction(thisMove.toPlace[0], { info });
    }

    await this.lookAt(thisMove.exitPos);
    this.bot.setControlState("back", false);
    this.bot.setControlState("sprint", false);
    this.bot.setControlState("forward", true);
    this.bot.setControlState("jump", true);

    while (this.bot.entity.position.y - thisMove.exitPos.y < 0) {
      await this.lookAt(thisMove.exitPos);
      await this.bot.waitForTicks(1);
      // console.log('loop 0')
    }
    info = await thisMove.toPlace[1].performInfo(this.bot);
    while (info.raycasts.length === 0) {
      await this.lookAt(thisMove.exitPos);
      await this.bot.waitForTicks(1);

      info = await thisMove.toPlace[1].performInfo(this.bot);
      // console.log('loop 1', this.bot.entity.position)
    }

    // console.log("YAY", thisMove.entryPos, this.bot.entity.position, info.raycasts[0].intersect)

    await this.performInteraction(thisMove.toPlace[1], { info });

    await this.lookAt(thisMove.exitPos);
  }

  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {
    this.flag = false;
    this.bot.clearControlStates();

    // console.log("ForwardJumpMove", thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length);
    this.alignToPath(thisMove, thisMove);

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
        this.bot.setControlState("forward", true);
        this.bot.setControlState("jump", true);
        this.bot.setControlState("sprint", true);
      }

      // console.log("info", this.jumpInfo);
      for (const place of thisMove.toPlace) {
        const test = await place.performInfo(this.bot);
        if (test !== null) await this.performInteraction(place, { info: test });
      }
    }
  };

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) {
    if (this.cI && !(await this.cI.allowExternalInfluence(this.bot))) {
      this.bot.clearControlStates();
      return false;
    } else if (!this.cI) {
      const test = await this.interactPossible();
      if (test) {
        void this.performInteraction(test);
        return false;
      }
    }

    this.alignToPath(thisMove, thisMove);
    if (this.jumpInfo) {
      if (tickCount >= this.jumpInfo.sprintTick) {
        this.bot.setControlState("sprint", true);
        this.bot.setControlState("forward", true);
      } else {
        this.bot.setControlState("sprint", false);
        this.bot.setControlState("forward", false);
      }
      if (tickCount >= this.jumpInfo.jumpTick) {
        this.bot.setControlState("jump", this.bot.entity.position.y - thisMove.entryPos.y < 0.8);
      } else {
        this.bot.setControlState("jump", false);
      }
    }

    this.lookAt(thisMove.exitPos);

    if (tickCount > 160) throw new CancelError("ForwardJumpMove: tickCount > 160");

    // very lazy way of doing this.
    if (this.bot.entity.position.y - thisMove.exitPos.y < -1.25) throw new CancelError("ForwardJumpMove: too low (1)");

    if (tickCount > (this.jumpInfo?.jumpTick ?? 0) && this.bot.entity.onGround) {
      this.bot.setControlState("jump", false);
      this.bot.setControlState("sprint", true);

      // very lazy way of doing this.
      if (this.bot.entity.position.y - thisMove.exitPos.y < -0.25)
        throw new CancelError("ForwardJumpMove: too low (2) " + this.bot.entity.position.y, thisMove.exitPos.y);
    }

    return this.isComplete(thisMove, thisMove);
  }
}

export class ForwardDropDownExecutor extends MovementExecutor {
  private currentIndex!: number;

  async performInit(thisMove: Move, currentIndex: number, path: Move[]) {
    this.currentIndex = currentIndex;
    this.alignToPath(thisMove, { handleBack: true });

    // console.log(thisMove.exitPos, thisMove.x, thisMove.y, thisMove.z);
    // this.bot.setControlState("forward", true);
    // this.bot.setControlState("sprint", true);
  }

  private identMove(thisMove: Move, currentIndex: number, path: Move[]) {
    let lastMove = thisMove;
    let nextMove = path[++currentIndex];

    if (nextMove === undefined) return --currentIndex;

    const pos = this.bot.entity.position;

    while (
      lastMove.entryPos.xzDistanceTo(pos) > lastMove.entryPos.xzDistanceTo(lastMove.exitPos) &&
      lastMove.entryPos.y > nextMove.exitPos.y &&
      nextMove.moveType.toPlaceLen() === 0
    ) {
      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }

    if (lastMove.entryPos.y === nextMove.exitPos.y) currentIndex++;

    return --currentIndex;
  }

  async performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) {
    if (this.cI && !this.cI.allowExternalInfluence(this.bot, 0)) {
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

    if (false) {
      const idx = this.identMove(thisMove, currentIndex, path);
      this.currentIndex = Math.max(idx, this.currentIndex);
      const nextMove = path[this.currentIndex];
      // console.log(currentIndex, this.currentIndex, idx, path.length, thisMove !== nextMove);

      // make sure movements are in approximate conjunction.
      //off0.dot(off1) > 0.85 &&
      if (currentIndex !== this.currentIndex && nextMove !== undefined) {
        // TODO: perform fall damage check to ensure this is allowed.
        this.alignToPath(thisMove, nextMove);
        // console.log("hi", this.bot.entity.position, nextMove.exitPos, this.bot.entity.position.xzDistanceTo(nextMove.exitPos), this.bot.entity.position.y, nextMove.exitPos.y)
        // if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2 && this.bot.entity.position.y === nextMove.exitPos.y)
        if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex;

        // }
      } else {
        this.alignToPath(thisMove, thisMove);
        // console.log(this.bot.entity.position, thisMove.exitPos, thisMove.entryPos, thisMove.exitPos.xzDistanceTo(this.bot.entity.position), thisMove.entryPos.xzDistanceTo(this.bot.entity.position))
        // if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && this.bot.entity.position.y === thisMove.exitPos.y) return true;
        if (this.isComplete(thisMove, thisMove)) return true;
      }
    } else {
      const nextMove = path[currentIndex + 1];
      if (nextMove) this.alignToPath(nextMove, { target: nextMove.entryPos });
      else this.alignToPath(thisMove);

      if (this.isComplete(thisMove)) return true;
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

export class StraightDownExecutor extends MovementExecutor {
  align(thisMove: Move): boolean {
    this.bot.clearControlStates();
    // console.log('align down', this.bot.entity.position, thisMove.entryPos, this.bot.entity.position.xzDistanceTo(thisMove.entryPos))
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && xzVel.norm() < 0.1) {
      return true;
    }
    this.lookAt(thisMove.exitPos);

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

  async align(thisMove: Move) {
    this.bot.clearControlStates();
    this.lookAt(thisMove.entryPos);

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    if (this.bot.entity.position.xzDistanceTo(thisMove.entryPos) < 0.2 && xzVel.norm() < 0.1) {
      return this.isLookingAt(thisMove.entryPos);
    }

    // provided that velocity is not pointing towards goal OR distance to goal is greater than 0.5 (not near center of block)
    // adjust as quickly as possible to goal.
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0 || this.bot.entity.position.distanceTo(thisMove.entryPos) > 0.5) {
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
      await this.lookAt(breakH.vec.offset(0.5, 0, 0.5));
      await this.performInteraction(breakH);
    }

    // console.log(thisMove.toPlace.length)
    for (const place of thisMove.toPlace) {
      await this.lookAt(place.vec.offset(0.5, 0, 0.5));
      this.bot.setControlState("jump", true);
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
    await this.lookAt(thisMove.exitPos);
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

    // controls.getBotSmartMovement(this.bot, thisMove.exitPos, true)();
    // controls.getBotStrafeAim(this.bot, thisMove.exitPos)();

    if (tickCount > 160) throw new CancelError("ParkourForward: tickCount > 160");

    if (tickCount > 0 && this.bot.entity.onGround && closeToGoal) {
      this.bot.setControlState("jump", false);
    }

    return this.isComplete(thisMove, thisMove);
    // if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2) return true;
    return false;
  }
}
