import { Vec3 } from "vec3";
import { goals } from "../goals";
import { Move } from "../move";
import { Movement } from "./movement";
import { CancelError } from "./exceptions";
import { BlockInfo } from "../world/cacheWorld";
import { BreakHandler, RayType } from "./interactionUtils";
import { AABB, AABBUtils } from "@nxg-org/mineflayer-util-plugin";
import * as controls from "./controls";
import { MovementExecutor } from "./movementExecutor";
import { JumpCalculator, ParkourJumpHelper } from "./movementUtils";
import { EPhysicsCtx } from "@nxg-org/mineflayer-physics-util";

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
    return this.currentMove?.toPlace.length === 0;
    const wanted = await this.interactPossible(15);

    if (wanted) {
      const test = await wanted!.performInfo(this.bot, 15);

      // cannot do interact while facing initial direction
      if (test.raycasts.length > 0) {
        // sort by dot product
        const works = test.raycasts;
        const stateEyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0);
        const lookDir = this.bot.util.getViewDir();
        works.sort((a, b) => b.intersect.minus(stateEyePos).dot(lookDir) - a.intersect.minus(stateEyePos).dot(lookDir));

        const wanted = works[0].intersect;
        const xzLookDir = lookDir.offset(0, -lookDir.y, 0).normalize();

        // check if wanted is currently seeable given current vector

        const wantDir = wanted.minus(this.bot.entity.position).normalize();
        const xzWantDir = wantDir.offset(0, -wantDir.y, 0).normalize();

        console.log(
          xzWantDir,
          xzLookDir,
          xzWantDir.dot(xzLookDir),
          wanted,
          this.bot.entity.position,
          this.bot.entity.position.distanceTo(wanted) < 5
        );
        return xzWantDir.dot(xzLookDir) > 0.9;
      } else {
        return false;
      }
    }

    return this.toBreakLen() === 0 && this.toPlaceLen() === 0;
  }

  async align(thisMove: Move, tickCount: number, goal: goals.Goal) {
    let faceForward = await this.facingCorrectDir();

    const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5);
    if (faceForward) {
      void this.lookAt(target);
      this.bot.setControlState("forward", true);
      if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
      else this.bot.setControlState("sprint", true);
    } else {
      const offset = this.bot.entity.position.minus(target).plus(this.bot.entity.position);
      void this.lookAt(offset);
      this.bot.setControlState("forward", false);
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("back", true);
    }
    // console.log("align", this.bot.entity.position, thisMove.exitPos, this.bot.entity.position.xzDistanceTo(thisMove.exitPos), this.bot.entity.onGround)
    // return this.bot.entity.position.distanceTo(thisMove.entryPos) < 0.2 && this.bot.entity.onGround;

    const off0 = thisMove.exitPos.minus(this.bot.entity.position);
    const off1 = thisMove.exitPos.minus(target);
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);

    // console.log(off0.dot(off1), off0, off1)

    off0.translate(0, -off0.y, 0);
    off1.translate(0, -off1.y, 0);

    const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95;
    // console.log(similarDirection, thisMove.moveType.constructor.name);
    // if (!similarDirection) {
    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 });

    const bb1bl = this.getBlockInfo(target, 0, -1, 0);
    const bb1 = bb1bl.getBBs();
    if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position));
    const bb1physical = bb1bl.physical || bb1bl.liquid;

    const bb2bl = thisMove.moveType.getBlockInfo(thisMove.exitPos.floored(), 0, -1, 0);
    const bb2 = bb2bl.getBBs();
    if (bb2.length === 0) bb2.push(AABB.fromBlock(bb1bl.position));
    const bb2physical = bb2bl.physical || bb2bl.liquid;

    // console.log(this.toPlaceLen(), bb1bl, bb1, bb0, (bb1.some(b=>b.collides(bb0)) && bb1physical) || (bb2.some(b=>b.collides(bb0))&& bb2physical));
    // console.log(bb0.collides(bb1), bb0, bb1, this.bot.entity.position.distanceTo(thisMove.entryPos))
    if ((bb1.some((b) => b.collides(bb0)) && bb1physical) || (bb2.some((b) => b.collides(bb0)) && bb2physical)) {
      if (similarDirection) return true;
      else if (this.bot.entity.position.xzDistanceTo(target) < 0.2) return this.isLookingAt(target);
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
      this.bot.setControlState("forward", false);
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
      this.bot.setControlState("sneak", true);
      return false;
    } else if (!this.cI) {
      const start = performance.now();
      const test = await this.interactPossible(15);
      if (test) {
        void this.performInteraction(test);
        return false;
      }
    }

    // if (tickCount > 160) throw new CancelError("ForwardMove: tickCount > 160");

    if (!this.bot.entity.onGround && this.bot.entity.position.y !== Math.round(this.bot.entity.position.y)) {
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
      this.bot.setControlState("forward", false);
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
      void this.lookAt(thisMove.entryPos.floored().offset(0.5, 0, 0.5));
      this.bot.setControlState("forward", true);
      this.bot.setControlState("back", false);
      this.bot.setControlState("sprint", true);

      const bl = this.getBlockInfo(thisMove.entryPos.floored(), 0, -1, 0);
      const bigBBs = bl.getBBs().map((b) => b.extend(0, 10, 0));
      console.log(
        bigBBs,
        this.bot.entity.onGround,
        bb,
        bigBBs.some((b) => b.contains(bb))
      );
      return bigBBs.some((b) => b.contains(bb)) && this.bot.entity.onGround;
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
    // console.log(tickCount, this.jumpInfo, this.bot.entity.position, this.bot.entity.velocity, this.bot.blockAt(this.bot.entity.position))
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
    } else {
      // this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos);
    }

    this.lookAt(thisMove.exitPos);

    // if (tickCount > 160) throw new CancelError("ForwardJumpMove: tickCount > 160");

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

    // if (tickCount > 160) throw new CancelError("ForwardDropDown: tickCount > 160");

    this.bot.setControlState("forward", true);
    if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
    else this.bot.setControlState("sprint", true);

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
      if (nextMove) this.alignToPath(nextMove, { target: nextMove.entryPos, handleBack: true });
      else this.alignToPath(thisMove);

      if (this.isComplete(thisMove)) return true;
      // if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && this.bot.entity.position.y === thisMove.exitPos.y) return true;
    }

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

    const target = thisMove.entryPos.floored().offset(0.5, 0, 0.5)
    this.bot.clearControlStates();

    this.lookAt(target);

    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 });
    const bb1bl = this.getBlockInfo(target, 0, -1, 0);

    const bb1 = bb1bl.getBBs();
    if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position));
    bb1.forEach((b) => b.extend(0, 10, 0));

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    // console.log(bb1.some((b) => b.contains(bb0)), this.isLookingAt(target))
    if (bb1.some((b) => b.contains(bb0))) {
      return this.isLookingAt(target);
    }

    


    // provided that velocity is not pointing towards goal OR distance to goal is greater than 0.5 (not near center of block)
    // adjust as quickly as possible to goal.
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0 || this.bot.entity.position.distanceTo(target) > 0.5) {
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

    console.log(this.bot.getControlState('sneak'), this.bot.getControlState('sprint'), this.bot.getControlState('forward'))
    return false;
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    for (const breakH of thisMove.toBreak) {
      await this.lookAt(breakH.vec.offset(0.5, 0, 0.5));
      await this.performInteraction(breakH);
    }

    if (thisMove.toPlace.length > 1) throw new CancelError("StraightUp: toPlace.length > 1");
    // console.log(thisMove.toPlace.length)
    for (const place of thisMove.toPlace) {
      await this.lookAt(place.vec.offset(0.5, 0, 0.5));
      this.bot.setControlState("jump", true);
      console.log('sup')
      this.performInteraction(place);
    }
  }
  performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if (this.bot.entity.position.y < thisMove.entryPos.y) throw new CancelError("StraightUp: too low");
    // this.bot.setControlState('sneak', false)
    this.align(thisMove);

    // console.log(this.bot.entity.position.y, thisMove.exitPos.y, this.bot.entity.position.y < thisMove.exitPos.y)
    this.bot.setControlState("jump", this.bot.entity.position.y < thisMove.exitPos.y);
    return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y >= thisMove.exitPos.y;
  }
}

export class ParkourForwardExecutor extends MovementExecutor {

  private shitterTwo: ParkourJumpHelper = new ParkourJumpHelper(this.bot, this.world);

  private backUpTarget?: Vec3;

  private reachedBackup = false;
  private jumped = false;

  protected isComplete(startMove: Move, endMove?: Move, ticks?: number): boolean {
    return super.isComplete(startMove, endMove, 0);
  }

  async align(thisMove: Move, tickCount: number, goal: goals.Goal) {
    this.jumped = false;

    const target = thisMove.exitPos.offset(0, -1, 0);

    const targetVec = this.shitterTwo.findGoalVertex(AABB.fromBlockPos(target));

    // console.log('CALLED TEST IN ALIGN')
    const test = this.shitterTwo.simJumpImmediately(target);

    // return true;

    const bbs = this.shitterTwo.getUnderlyingBBs(this.bot.entity.position, 0.6);

    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos));
    }

    const test1 = this.shitterTwo.simJumpFromEdge(bbs, target);

    console.log("align", test, test1, this.bot.entity.onGround);


    if (!this.bot.entity.onGround) return false;

    if (test) {
      this.bot.setControlState("sprint", true);
      this.bot.setControlState("forward", true);
      this.bot.setControlState("jump", true);
      this.bot.setControlState("sneak", false);
      this.bot.setControlState("jump", false);
      this.lookAt(target);
      this.jumped = true;
      return true;
    }
    if (test1) {
      this.bot.setControlState("sprint", true);
      this.bot.setControlState("forward", true);
      // this.bot.setControlState("sneak", false);
      this.lookAt(target);
      return true;
    }

    // return true;


  
    const bb = AABBUtils.getPlayerAABB({position:this.bot.entity.position, width:0.15, height: 1.8}).extend(0, -0.252, 0)
    const xzvdir = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).normalize();
    const dir = target.minus(this.bot.entity.position).normalize();
   
    if (this.backUpTarget && bb.containsVec(this.backUpTarget)) {
      const dist = this.bot.entity.position.xzDistanceTo(this.backUpTarget);
      console.log("here1", this.backUpTarget, this.bot.entity.position, dist, xzvdir.dot(dir));
      this.bot.clearControlStates();
      this.lookAt(target);

      this.bot.setControlState("forward", true);

      this.reachedBackup = true;
      this.bot.setControlState("sprint", dist > 0);
      this.bot.setControlState('sneak', xzvdir.dot(dir) < 0.5 && true);

      return false;
    } else if (!this.backUpTarget) {
      this.backUpTarget = this.shitterTwo.findBackupVertex(bbs, targetVec);
      const dist = this.bot.entity.position.xzDistanceTo(this.backUpTarget);
      console.log('here2', this.backUpTarget)

      if (this.world.getBlockInfo(this.backUpTarget.offset(0, 1, 0)).physical) {
        console.log('sup')
        await this.performInteraction(BreakHandler.fromVec(this.backUpTarget.offset(0, 1, 0), "solid"))
      }

      
      this.reachedBackup = false;
      this.bot.setControlState("forward", true);
      this.bot.setControlState("sprint", dist > 0);
      this.bot.setControlState("sneak", dist < 0.2 && xzvdir.dot(dir) < 0.5);

      await this.lookAt(this.backUpTarget);
      
      console.log("here2", this.backUpTarget, this.bot.entity.position);
      return false;
    } else if (!this.reachedBackup) {
      const dist = this.bot.entity.position.xzDistanceTo(this.backUpTarget);
      // console.log("here3", this.backUpTarget, this.bot.entity.position, bb);
      if (this.world.getBlockInfo(this.backUpTarget.offset(0, 1, 0)).physical) {
        console.log('sup')
        await this.performInteraction(BreakHandler.fromVec(this.backUpTarget.offset(0, 1, 0), "solid"))
      }

    
      this.bot.setControlState("forward", true);
      this.bot.setControlState("sprint", dist > 0 || this.reachedBackup);
      this.bot.setControlState("sneak", dist < 0.2 && true);

      await this.lookAt(this.backUpTarget);
    } else {

      const state = this.bot.physicsUtil.engine.simulate(EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot), this.world);
      const dist = this.bot.entity.position.xzDistanceTo(this.backUpTarget);
      // if (state.pos.y < this.bot.entity.position.y) {
      //   console.log("HI", state.pos, this.bot.entity.position)
      //   this.bot.setControlState('sneak', true)
      //   // throw new CancelError('ParkourForward: Not making this jump.')
      // } else {
        this.bot.clearControlStates();
        console.log("here4", this.backUpTarget, this.bot.entity.position, bb, dist, xzvdir.dot(dir));
        
        this.bot.setControlState("forward", true);
        this.bot.setControlState("sprint", xzvdir.dot(dir) > 0.3);
        this.bot.setControlState('sneak', xzvdir.dot(dir) < 0.3 && true);

        await this.lookAt(target);
      // }

     


  
    }

    return false;
  }

  async performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    delete this.backUpTarget;
    await this.lookAt(thisMove.exitPos);
    this.bot.chat(`/particle flame ${thisMove.exitPos.x} ${thisMove.exitPos.y} ${thisMove.exitPos.z} 0 0.5 0 0 10 force`);

    // this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos);

    this.bot.setControlState("sprint", true);
    this.bot.setControlState("forward", true);
  }

  // TODO: Fix this. Good thing I've done this before. >:)
  performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if (!this.bot.entity.onGround) return false;
    
    const target = thisMove.exitPos.offset(0, -1, 0);
    const targetVec = this.shitterTwo.findGoalVertex(AABB.fromBlockPos(target));

    const bbs = this.shitterTwo.getUnderlyingBBs(this.bot.entity.position, 0.6);
    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos));
    }

    this.alignToPath(thisMove);

 
    // console.log('CALLED TEST IN PER TICK', this.bot.entity.position, this.shitterTwo.getUnderlyingBBs(this.bot.entity.position,0.6))
    const test = this.shitterTwo.simJumpImmediately(target);
    const test1 = this.shitterTwo.simJumpFromEdge(bbs, target);
    // console.log(test, test1, target);
    // if (this.cI && !this.cI.allowExternalInfluence(this.bot, 5)) {
    //   this.bot.clearControlStates();
    //   return false;
    // }

    console.log("per tick", test, test1);

    if (this.jumped) {
      this.bot.setControlState("jump", false);
    }

    if (this.isComplete(thisMove)) {
      return true;
    } else if (test && !this.jumped) {
      this.bot.setControlState("sprint", true);
      this.bot.setControlState("forward", true);
      this.bot.setControlState("jump", true);
      this.jumped = true;
    } else if (test1) {
      this.bot.setControlState("sprint", true);
      this.bot.setControlState("forward", true);
    }

    return false;
  }
}
