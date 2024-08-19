import { Vec3 } from 'vec3'
import * as goals from '../goals'
import { Move } from '../move'
import { CancelError } from '../exceptions'
import { BlockInfo } from '../world/cacheWorld'
import { PlaceHandler, RayType } from './interactionUtils'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { CompleteOpts, MovementExecutor } from './movementExecutor'
import { JumpCalculator, ParkourJumpHelper, getUnderlyingBBs, leavingBlockLevel, stateLookAt } from './movementUtils'
import { EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { debug, printBotControls } from '../../utils'

export class IdleMovementExecutor extends MovementExecutor {
  provideMovements (start: Move, storage: Move[]): void {}
  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {}
  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    return true
  }
}

export class NewForwardExecutor extends MovementExecutor {
  private async faceForward (): Promise<boolean> {
    // console.log('called faceForward!')
    if (this.doWaterLogic()) return true
    const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0)
    const placementVecs = this.toPlace().map((p) => AABB.fromBlock(p.vec))
    const near = placementVecs.some((p) => p.distanceToVec(eyePos) < PlaceHandler.reach + 2)

    // console.log('this.currentMove?.toPlace.length === 0 || !near', this.currentMove?.toPlace.length === 0 || !near)
    // console.log(this.currentMove.toPlace.length, this.toPlace().length, placementVecs.map((p) => p.distanceToVec(eyePos)), near, this.currentMove?.toPlace.length === 0 && !near)
    return this.currentMove?.toPlace.length === 0 || !near
  }

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if (this.doWaterLogic()) {
      await super.align(thisMove, tickCount, goal)
      // this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y)
    }

    const faceForward = await this.faceForward()
    let target
    if (faceForward) {
      target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      target = offset
    }

    await this.landAlign(thisMove, tickCount, goal)
    // await this.postInitAlignToPath(thisMove, { lookAtYaw: target })
    return this.isInitAligned(thisMove, target)
  }

  async landAlign (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    const faceForward = await this.faceForward()

    const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
    if (faceForward) {
      // await this.postInitAlignToPath(thisMove)
      // void this.lookAt(target);
      this.bot.setControlState('forward', true)
      if (this.bot.food <= 6) this.bot.setControlState('sprint', false)
      else this.bot.setControlState('sprint', true)
    } else {
      const offset = this.bot.entity.position.minus(target).plus(this.bot.entity.position)
      // await this.postInitAlignToPath(thisMove, { lookAt: offset })
      void this.lookAt(offset)
      this.bot.setControlState('forward', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('back', true)
    }

    // return this.isComplete(thisMove, thisMove, {entry: true})
    // console.log("align", this.bot.entity.position, thisMove.exitPos, this.bot.entity.position.xzDistanceTo(thisMove.exitPos), this.bot.entity.onGround)
    // return this.bot.entity.position.distanceTo(thisMove.entryPos) < 0.2 && this.bot.entity.onGround;

    return this.isInitAligned(thisMove, target)
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // console.log('ForwardMove', thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length)

    this.bot.clearControlStates()

    const faceForward = await this.faceForward()

    if (faceForward) {
      await this.postInitAlignToPath(thisMove)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      // console.log('here!', thisMove.exitPos, this.bot.entity.position, offset)
      await this.postInitAlignToPath(thisMove, { lookAt: offset })
    }
  }

  private doWaterLogic (): boolean {
    if ((this.bot.entity as any).isInWater as boolean) return true

    if (this.bot.entity.onGround) return false

    const bl = this.getBlockInfo(this.bot.entity.position, 0, -0.6, 0)
    return bl.liquid
  }

  // TODO: clean this up.
  private canJump (thisMove: Move, currentIndex: number, path: Move[]): boolean {
    if (this.doWaterLogic()) {
      if (this.bot.entity.position.y < thisMove.exitPos.y) {
        return true
      } else {
        return false
      }
    }

    if (!this.settings.allowJumpSprint) return false
    if (!this.bot.entity.onGround) return false
    if (this.toBreakLen() > 0 || this.toPlaceLen() > 0) return false

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.14) return false

    // console.log("hey");
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    this.sim.simulateUntil(
      (state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally,
      () => {},
      (state) => {
        state.control.set('jump', true)
      },
      ctx,
      this.world,
      20
    )

    if (ctx.state.pos.y > thisMove.entryPos.y) return false

    const nextPos = path[++currentIndex]
    let offset = 0.4
    if (currentIndex < path.length) {
      if (nextPos.toPlace.length > 0 || nextPos.toBreak.length > 0) offset = 0.8

      // handle potential collisions here.
      if (nextPos.exitPos.y > thisMove.entryPos.y) {
        offset = 0.8
      }

      if (nextPos.exitPos.y - thisMove.entryPos.y > 2) {
        offset = 0.8
      }
    }

    if (thisMove.entryPos.xzDistanceTo(ctx.state.pos) > thisMove.entryPos.xzDistanceTo(thisMove.exitPos) - offset) {
      return false
    }

    if (ctx.state.isCollidedHorizontally) return false
    return ctx.state.onGround
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      return false
    } else if (this.cI == null) {
      const test = await this.interactNeeded(5)
      if (test != null) {
        // console.log('performing interaction')
        void this.performInteraction(test)
        return false
      }
    }

    // if (tickCount > 160) throw new CancelError("ForwardMove: tickCount > 160");

    if (
      (!this.bot.entity.onGround &&
        !this.bot.getControlState('jump') &&
        !this.doWaterLogic() &&
        this.canJump(thisMove, currentIndex, path)) ||
      this.bot.entity.position.y < Math.round(thisMove.entryPos.y) - 1
    ) {
      // console.log(this.bot.entity.position, thisMove.entryPos)
      throw new CancelError('ForwardMove: not on ground')
    }

    const faceForward = await this.faceForward()

    if (faceForward) {
      const jump = this.canJump(thisMove, currentIndex, path)
      this.bot.setControlState('jump', jump)
      void this.postInitAlignToPath(thisMove)
      return this.isComplete(thisMove)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      void this.postInitAlignToPath(thisMove, { lookAt: offset })
      return this.isComplete(thisMove)
    }
  }
}

export class ForwardExecutor extends MovementExecutor {
  private currentIndex!: number

  // protected isComplete(startMove: Move, endMove: Move): boolean {
  //     return this.bot.entity.position.xzDistanceTo(endMove.exitPos) < 0.2 && this.bot.entity.position.y === endMove.exitPos.y;
  // }

  /**
   * TOOD: not yet working.
   */
  private async faceForward (): Promise<boolean> {
    const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0)
    const placementVecs = this.toPlace().map((p) => AABB.fromBlock(p.vec))
    const near = placementVecs.some((p) => p.distanceToVec(eyePos) < PlaceHandler.reach + 2)

    // console.log(
    //   placementVecs.map((p) => p.distanceToVec(eyePos)),
    //   near,
    //   this.currentMove?.toPlace.length === 0 && !near
    // )
    return this.currentMove?.toPlace.length === 0 && !near
    // const wanted = await this.interactPossible(15);

    // if (wanted != null) {
    //   const test = await wanted!.performInfo(this.bot, 15);

    //   // cannot do interact while facing initial direction
    //   if (test.raycasts.length > 0) {
    //     // sort by dot product
    //     const works = test.raycasts;
    //     const stateEyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0);
    //     const lookDir = this.bot.util.getViewDir();
    //     works.sort((a, b) => b.intersect.minus(stateEyePos).dot(lookDir) - a.intersect.minus(stateEyePos).dot(lookDir));

    //     const wanted = works[0].intersect;
    //     const xzLookDir = lookDir.offset(0, -lookDir.y, 0).normalize();

    //     // check if wanted is currently seeable given current vector

    //     const wantDir = wanted.minus(this.bot.entity.position).normalize();
    //     const xzWantDir = wantDir.offset(0, -wantDir.y, 0).normalize();

    //   // console.log(
    //       xzWantDir,
    //       xzLookDir,
    //       xzWantDir.dot(xzLookDir),
    //       wanted,
    //       this.bot.entity.position,
    //       this.bot.entity.position.distanceTo(wanted) < 5
    //     );
    //     return xzWantDir.dot(xzLookDir) > 0.9;
    //   } else {
    //     return false;
    //   }
    // }

    // return this.toBreakLen() === 0 && this.toPlaceLen() === 0;
  }

  async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    const faceForward = await this.faceForward()

    const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
    if (faceForward) {
      void this.postInitAlignToPath(thisMove, { lookAtYaw: target })
      // void this.lookAt(target);
      // this.bot.setControlState("forward", true);
      // if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
      // else this.bot.setControlState("sprint", true);
    } else {
      const offset = this.bot.entity.position.minus(target).plus(this.bot.entity.position)
      void this.postInitAlignToPath(thisMove, { lookAt: offset })
      // void this.lookAt(offset);
      // this.bot.setControlState("forward", false);
      // this.bot.setControlState("sprint", false);
      // this.bot.setControlState("back", true);
    }

    // return this.isComplete(thisMove, thisMove, {entry: true})
    // console.log("align", this.bot.entity.position, thisMove.exitPos, this.bot.entity.position.xzDistanceTo(thisMove.exitPos), this.bot.entity.onGround)
    // return this.bot.entity.position.distanceTo(thisMove.entryPos) < 0.2 && this.bot.entity.onGround;

    const off0 = thisMove.exitPos.minus(this.bot.entity.position)
    const off1 = thisMove.exitPos.minus(target)
    // const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);

    // console.log(off0.dot(off1), off0, off1)

    off0.translate(0, -off0.y, 0)
    off1.translate(0, -off1.y, 0)

    const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95
    // console.log(similarDirection, thisMove.moveType.constructor.name);
    // if (!similarDirection) {
    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })

    const bb1bl = this.getBlockInfo(target, 0, -1, 0)
    const bb1 = bb1bl.getBBs()
    if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position))
    const bb1physical = bb1bl.physical || bb1bl.liquid

    const bb2bl = thisMove.moveType.getBlockInfo(thisMove.exitPos.floored(), 0, -1, 0)
    const bb2 = bb2bl.getBBs()
    if (bb2.length === 0) bb2.push(AABB.fromBlock(bb1bl.position))
    const bb2physical = bb2bl.physical || bb2bl.liquid

    // console.log(this.toPlaceLen(), bb1bl, bb1, bb0, (bb1.some(b=>b.collides(bb0)) && bb1physical) || (bb2.some(b=>b.collides(bb0))&& bb2physical));
    // console.log(bb0.collides(bb1), bb0, bb1, this.bot.entity.position.distanceTo(thisMove.entryPos))
    if ((bb1.some((b) => b.collides(bb0)) && bb1physical) || (bb2.some((b) => b.collides(bb0)) && bb2physical)) {
      if (similarDirection) return true
      else if (this.bot.entity.position.xzDistanceTo(target) < 0.2) return this.isLookingAtYaw(target)
    }

    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // console.log("ForwardMove", thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length);

    this.bot.clearControlStates()
    this.currentIndex = 0

    const faceForward = await this.faceForward()

    if (faceForward) {
      await this.postInitAlignToPath(thisMove)
      // void this.lookAt(thisMove.entryPos);
      // this.bot.setControlState("forward", true);
      // if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
      // else this.bot.setControlState("sprint", true);
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      // console.log('here!', thisMove.exitPos, this.bot.entity.position, offset)
      // void this.lookAt(offset);
      await this.postInitAlignToPath(thisMove, { lookAt: offset, sprint: true })
      // this.bot.setControlState('forward', false)
      // this.bot.setControlState('sprint', false)
      // this.bot.setControlState('back', true)
    }

    // console.log("done move prehandle!");
  }

  private async identMove (thisMove: Move, currentIndex: number, path: Move[]): Promise<number> {
    let lastMove = thisMove
    let nextMove = path[++currentIndex]

    if (nextMove === undefined) return --currentIndex

    const orgY = thisMove.entryPos.y
    const width = 0.61
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width, height: 1.8 })
    const verts = bb.expand(0, -1, 0).toVertices()

    const verts1 = [
      this.bot.entity.position.offset(-width / 2, -0.6, -width / 2),
      this.bot.entity.position.offset(width / 2, -0.6, -width / 2),
      this.bot.entity.position.offset(width / 2, -0.6, width / 2),
      this.bot.entity.position.offset(-width / 2, -0.6, width / 2)
    ]

    const pos0 = this.bot.entity.position

    while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
      if (nextMove === undefined) return --currentIndex
      for (const vert of verts) {
        const offset = vert.minus(this.bot.entity.position)
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0)
        const test = test1.plus(offset)
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 1
        const raycast0 = (await this.bot.world.raycast(
          vert,
          test.minus(vert).normalize().scale(0.5),
          dist * 2
        )) as unknown as RayType | null
        const valid0 = raycast0 == null || raycast0.position.distanceTo(pos0) > dist
        if (!valid0) {
          return --currentIndex
        }
      }

      let counter = verts1.length
      for (const vert of verts1) {
        const offset = vert.minus(this.bot.entity.position)
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0)
        const test = test1.plus(offset)
        const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 1
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize().scale(0.5), dist * 2, (block) =>
          BlockInfo.replaceables.has(block.type)
        )) as unknown as RayType | null

        const valid0 = raycast0 == null || raycast0.position.distanceTo(pos0) > dist
        if (!valid0) counter--
      }

      if (counter === 0) return --currentIndex
      if (++currentIndex >= path.length) return --currentIndex

      lastMove = nextMove
      nextMove = path[currentIndex]
    }
    return --currentIndex
  }

  // TODO: clean this up.
  private canJump (thisMove: Move, currentIndex: number, path: Move[]): boolean {
    if (!this.settings.allowJumpSprint) return false
    if (!this.bot.entity.onGround) return false
    if (this.toBreakLen() > 0 || this.toPlaceLen() > 0) return false

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.14) return false

    // console.log("hey");
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    this.sim.simulateUntil(
      (state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally,
      () => {},
      (state) => {
        state.control.set('jump', true)
      },
      ctx,
      this.world,
      20
    )

    if (ctx.state.pos.y > thisMove.entryPos.y) return false

    const nextPos = path[++currentIndex]
    let offset = 0.3
    if (currentIndex < path.length) {
      if (nextPos.toPlace.length > 0 || nextPos.toBreak.length > 0) offset = 0.8

      // handle potential collisions here.
      if (nextPos.exitPos.y > thisMove.entryPos.y) {
        offset = 0.8
      }
    }

    if (thisMove.entryPos.xzDistanceTo(ctx.state.pos) > thisMove.entryPos.xzDistanceTo(thisMove.exitPos) - offset) {
      return false
    }

    if (ctx.state.isCollidedHorizontally) return false
    return ctx.state.onGround
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      // this.bot.clearControlStates()
      // this.bot.setControlState('sneak', true)
      return false
    } else if (this.cI == null) {
      // const start = performance.now()
      const test = await this.interactNeeded(15)
      if (test != null) {
        void this.performInteraction(test)
        return false
      }
    }

    // if (tickCount > 160) throw new CancelError("ForwardMove: tickCount > 160");

    if (
      !this.bot.entity.onGround &&
      this.bot.entity.position.y < thisMove.entryPos.y && //
      !this.bot.getControlState('jump')
    ) {
      // console.log(this.bot.entity.position, this.bot.entity.velocity);
      throw new CancelError('ForwardMove: not on ground')
    }
    if ((this.bot.entity as any).isCollidedHorizontally as boolean) {
      // if (this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm() < 0.02) { throw new CancelError('ForwardMove: collided horizontally') }
    }

    const faceForward = await this.faceForward()

    if (faceForward) {
      // eslint-disable-next-line no-constant-condition
      if (false) {
        this.bot.setControlState('back', false)
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
        const idx = await this.identMove(thisMove, currentIndex, path)
        this.currentIndex = Math.max(idx, this.currentIndex)
        const nextMove = path[this.currentIndex]
        if (currentIndex !== this.currentIndex && nextMove !== undefined) {
          // this.lookAt(nextMove.exitPos, true);
          void this.postInitAlignToPath(thisMove, nextMove)
          if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex
          // if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2) return this.currentIndex - currentIndex;
        } else {
          // this.lookAt(thisMove.exitPos, true);
          void this.postInitAlignToPath(thisMove)
          return this.isComplete(thisMove)
          // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
        }
      } else {
        const jump = this.canJump(thisMove, currentIndex, path)
        // console.log("should jump", jump);
        this.bot.setControlState('jump', jump)
        void this.postInitAlignToPath(thisMove)
        return this.isComplete(thisMove)
        // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
      }
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      void this.postInitAlignToPath(thisMove, { lookAt: offset })
      return this.isComplete(thisMove)
    }

    return false
    // return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2;
  }
}

export class ForwardJumpExecutor extends MovementExecutor {
  jumpInfo!: ReturnType<JumpCalculator['findJumpPoint']>

  private readonly shitter: JumpCalculator = new JumpCalculator(this.sim, this.bot, this.world, this.simCtx)

  private flag = false

  protected isComplete (startMove: Move, endMove?: Move): boolean {
    return super.isComplete(startMove, endMove, { ticks: 0 })
  }

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y)
      return await super.align(thisMove, tickCount, goal)
    }

    return await super.align(thisMove, tickCount, goal)
  }

  align1 (thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    // const offset = thisMove.exi();
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })
    // console.log(bb.containsVec(offset), bb, offset)
    // return this.bot.entity.onGround;
    if (this.flag) {
      void this.lookAt(thisMove.entryPos.floored().offset(0.5, 0, 0.5))
      this.bot.setControlState('forward', true)
      this.bot.setControlState('back', false)
      this.bot.setControlState('sprint', true)

      const bl = this.getBlockInfo(thisMove.entryPos.floored(), 0, -1, 0)
      const bigBBs = bl.getBBs().map((b) => b.extend(0, 10, 0))
      // console.log(
      //   bigBBs,
      //   this.bot.entity.onGround,
      //   bb,
      //   bigBBs.some((b) => b.contains(bb))
      // )
      return bigBBs.some((b) => b.contains(bb)) && this.bot.entity.onGround
      // if (this.bot.entity.position.xzDistanceTo(thisMove.entryPos) < 0.2) return true;
    } else if (this.bot.entity.onGround) {
      if (thisMove.toPlace.length === 0) {
        this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos)
        if (this.jumpInfo === null) {
          this.flag = true
          return false
        }
      }

      return true
    }
    // this.lookAt(offset, true);
    // this.bot.setControlState("forward", false);
    // this.bot.setControlState("back", true);
    return false

    // if (this.bot.entity.position.xzDistanceTo(thisMove.entryPos.offset(0.5, 0, 0.5)) < 0.2) return true;
    // this.lookAt(thisMove., true);
    // this.bot.setControlState('forward', true);
    // return this.bot.entity.onGround;
  }

  // TODO: re-optimize.
  private async performTwoPlace (thisMove: Move): Promise<void> {
    // this.bot.setControlState("sprint", false);
    let info = await thisMove.toPlace[0].performInfo(this.bot, 0)
    if (info.raycasts.length === 0) {
      // console.log('info')
      void this.postInitAlignToPath(thisMove, { lookAt: thisMove.entryPos })
      await this.performInteraction(thisMove.toPlace[0])
    } else {
      // console.log('no info')
      // this.bot.setControlState("forward", false);
      await this.performInteraction(thisMove.toPlace[0], { info })
    }

    // console.log('did first place!')

    this.bot.setControlState('jump', true)
    await this.postInitAlignToPath(thisMove, { lookAt: thisMove.entryPos })
    // this.bot.setControlState('back', false)
    // this.bot.setControlState('sprint', false)
    // this.bot.setControlState('forward', true)
    // this.bot.setControlState('jump', true)

    while (this.bot.entity.position.y - thisMove.exitPos.y < 0) {
      await this.postInitAlignToPath(thisMove, { lookAt: thisMove.entryPos })
      await this.bot.waitForTicks(1)
      // console.log('loop 0')
    }
    info = await thisMove.toPlace[1].performInfo(this.bot)
    while (info.raycasts.length === 0) {
      await this.postInitAlignToPath(thisMove, { lookAt: thisMove.entryPos })
      await this.bot.waitForTicks(1)

      info = await thisMove.toPlace[1].performInfo(this.bot)
      // console.log('loop 1', this.bot.entity.position)
    }

    // console.log("YAY", thisMove.entryPos, this.bot.entity.position, info.raycasts[0].intersect)

    await this.performInteraction(thisMove.toPlace[1], { info })

    await this.lookAt(thisMove.exitPos)
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // console.log('performing jump movement!')
    this.flag = false
    this.bot.clearControlStates()

    // console.log("ForwardJumpMove", thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length);
    // this.alignToPath(thisMove, thisMove);
    // this.bot.setControlState("forward", true);
    // this.bot.setControlState("sprint", true);

    if (thisMove.toBreak.length > 0) {
      await this.bot.clearControlStates()
      for (const breakH of thisMove.toBreak) {
        await this.performInteraction(breakH)
      }
    }

    // do some fancy handling here, will think of something later.
    if (thisMove.toPlace.length === 2) {
      await this.performTwoPlace(thisMove)
      return
    }

    this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos)

    // console.log('jump info', this.jumpInfo)
    if (this.jumpInfo === null) {
      debug(this.bot, 'no jump info')
      this.bot.setControlState('forward', true)
      this.bot.setControlState('jump', true)
      this.bot.setControlState('sprint', true)
    }

    // console.log("info", this.jumpInfo);
    for (const place of thisMove.toPlace) {
      const info = await place.performInfo(this.bot)
      if (info !== null) await this.performInteraction(place, { info })
    }
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    // console.log(
    //   'per tick!',
    //   this.bot.getControlState('forward'),
    //   this.bot.getControlState('back'),
    //   this.bot.getControlState('jump'),
    //   this.bot.entity.position,
    //   thisMove.exitPos
    // )
    // console.log(tickCount, this.jumpInfo, this.bot.entity.position, this.bot.entity.velocity, this.bot.blockAt(this.bot.entity.position))
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      this.bot.clearControlStates()
      return false
    } else if (this.cI == null) {
      const test = await this.interactNeeded()
      if (test != null) {
        void this.performInteraction(test)
        return false
      }
    }

    void this.postInitAlignToPath(thisMove)

    // void this.lookAtPathPos(thisMove.exitPos);
    // this.bot.setControlState("forward", true);
    // this.bot.setControlState("sprint", true);

    // await this.alignToPath(thisMove, { sprint: false });
    if (this.jumpInfo != null) {
      if (tickCount >= this.jumpInfo.backTick) {
        this.bot.setControlState('forward', false)
        this.bot.setControlState('back', true)
      }

      if (tickCount >= this.jumpInfo.sprintTick) {
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
      } else {
        this.bot.setControlState('sprint', false)
        this.bot.setControlState('forward', false)
      }
      if (tickCount >= this.jumpInfo.jumpTick) {
        this.bot.setControlState('jump', this.bot.entity.position.y - thisMove.entryPos.y < 0.8)
      } else {
        this.bot.setControlState('jump', false)
      }
    } else {
      // this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos);
    }

    // if (tickCount > 160) throw new CancelError("ForwardJumpMove: tickCount > 160");

    // very lazy way of doing this.
    if (this.bot.entity.position.y - thisMove.exitPos.y < -1.25) throw new CancelError('ForwardJumpMove: too low (1)')

    if (tickCount > (this.jumpInfo?.jumpTick ?? 0) && this.bot.entity.onGround) {
      this.bot.setControlState('jump', false)
      this.bot.setControlState('sprint', true)

      // very lazy way of doing this.
      if (this.bot.entity.position.y - thisMove.exitPos.y < -0.25) {
        throw new CancelError(`ForwardJumpMove: too low (2) ${this.bot.entity.position.y} ${thisMove.exitPos.y}`)
      }
    }

    return this.isComplete(thisMove)
  }
}

export class NewForwardJumpExecutor extends ForwardJumpExecutor {
  override async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y)
      void this.postInitAlignToPath(thisMove)
      return this.isComplete(thisMove)
    } else {
      return await super.performPerTick(thisMove, tickCount, currentIndex, path)
    }
  }
}

export class ForwardDropDownExecutor extends MovementExecutor {
  private currentIndex!: number

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      // this.bot.setControlState("jump", this.bot.entity.position.y < thisMove.entryPos.y - 1);
      return await super.align(thisMove, tickCount, goal)
    }

    return await super.align(thisMove, tickCount, goal)
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.currentIndex = currentIndex
    await this.postInitAlignToPath(thisMove)

    // console.log(thisMove.exitPos, thisMove.x, thisMove.y, thisMove.z);
    // this.bot.setControlState("forward", true);
    // this.bot.setControlState("sprint", true);
  }

  private identMove (thisMove: Move, currentIndex: number, path: Move[]): number {
    let lastMove = thisMove
    let nextMove = path[++currentIndex]

    if (nextMove === undefined) return --currentIndex

    const pos = this.bot.entity.position

    while (
      lastMove.entryPos.xzDistanceTo(pos) > lastMove.entryPos.xzDistanceTo(lastMove.exitPos) &&
      lastMove.entryPos.y > nextMove.exitPos.y &&
      nextMove.moveType.toPlaceLen() === 0
    ) {
      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }

    if (lastMove.entryPos.y === nextMove.exitPos.y) currentIndex++

    return --currentIndex
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot, 0))) {
      this.bot.clearControlStates()
      return false
    } else if (this.cI == null) {
      const test = await this.interactNeeded()
      if (test != null) {
        void this.performInteraction(test)
        return false
      }
    }

    // if (tickCount > 160) throw new CancelError("ForwardDropDown: tickCount > 160");

    // this.bot.setControlState("forward", true);
    // if (this.bot.food <= 6) this.bot.setControlState("sprint", false);
    // else this.bot.setControlState("sprint", true);

    // eslint-disable-next-line no-constant-condition
    if (false) {
      const idx = this.identMove(thisMove, currentIndex, path)
      this.currentIndex = Math.max(idx, this.currentIndex)
      const nextMove = path[this.currentIndex]
      // console.log(currentIndex, this.currentIndex, idx, path.length, thisMove !== nextMove);

      // make sure movements are in approximate conjunction.
      // off0.dot(off1) > 0.85 &&
      if (currentIndex !== this.currentIndex && nextMove !== undefined) {
        // TODO: perform fall damage check to ensure this is allowed.
        void this.postInitAlignToPath(thisMove, nextMove)
        // console.log("hi", this.bot.entity.position, nextMove.exitPos, this.bot.entity.position.xzDistanceTo(nextMove.exitPos), this.bot.entity.position.y, nextMove.exitPos.y)
        // if (this.bot.entity.position.xzDistanceTo(nextMove.exitPos) < 0.2 && this.bot.entity.position.y === nextMove.exitPos.y)
        if (this.isComplete(thisMove, nextMove)) return this.currentIndex - currentIndex

        // }
      } else {
        void this.postInitAlignToPath(thisMove, thisMove)
        // console.log(this.bot.entity.position, thisMove.exitPos, thisMove.entryPos, thisMove.exitPos.xzDistanceTo(this.bot.entity.position), thisMove.entryPos.xzDistanceTo(this.bot.entity.position))
        // if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && this.bot.entity.position.y === thisMove.exitPos.y) return true;
        if (this.isComplete(thisMove, thisMove)) return true
      }
    } else {
      // const nextMove = path[++currentIndex]
      if (currentIndex < path.length) void this.postInitAlignToPath(thisMove)
      else void this.postInitAlignToPath(thisMove)

      if (this.isComplete(thisMove)) return true
      // if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && this.bot.entity.position.y === thisMove.exitPos.y) return true;
    }

    return false
  }

  getLandingBlock (node: Move, dir: Vec3): BlockInfo | null {
    let blockLand = this.getBlockInfo(node, dir.x, -2, dir.z)
    while (blockLand.position.y > (this.bot.game as any).minY) {
      if (blockLand.liquid && blockLand.walkthrough) return blockLand
      if (blockLand.physical) {
        if (node.y - blockLand.position.y <= this.settings.maxDropDown) return this.getBlockInfo(blockLand.position, 0, 1, 0)
        return null
      }
      if (!blockLand.walkthrough) return null
      blockLand = this.getBlockInfo(blockLand.position, 0, -1, 0)
    }
    return null
  }
}

export class NewForwardDropDownExecutor extends ForwardDropDownExecutor {
  override async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if ((this.bot.entity as any).isInWater as boolean) {
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y)
      return this.isComplete(thisMove)
    } else {
      return await super.performPerTick(thisMove, tickCount, currentIndex, path)
    }
  }
}

export class StraightDownExecutor extends MovementExecutor {
  align (thisMove: Move): boolean {
    this.bot.clearControlStates()
    // console.log('align down', this.bot.entity.position, thisMove.entryPos, this.bot.entity.position.xzDistanceTo(thisMove.entryPos))
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && xzVel.norm() < 0.1) {
      return true
    }

    void this.lookAt(thisMove.exitPos)

    // provided that velocity is not pointing towards goal OR distance to goal is greater than 0.5 (not near center of block)
    // adjust as quickly as possible to goal.
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0 || this.bot.entity.position.distanceTo(thisMove.exitPos) > 0.5) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('sneak', false)

      // if velocity is already heading towards the goal, slow down.
    } else {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true)
    }
    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    for (const breakH of thisMove.toBreak) {
      await this.performInteraction(breakH)
    }
  }

  performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if ((this.bot.entity as any).isInWater as boolean) {
      return tickCount > 0 && this.bot.entity.position.y <= thisMove.exitPos.y
    }

    if (this.bot.entity.position.y < thisMove.exitPos.y) throw new CancelError('StraightDown: too low')

    return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y === thisMove.exitPos.y
  }
}

export class StraightUpExecutor extends MovementExecutor {
  isAlreadyCompleted (thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    return this.bot.entity.position.y >= thisMove.exitPos.y
  }

  override async align (thisMove: Move): Promise<boolean> {
    if (!this.bot.entity.onGround || ((this.bot.entity as any).isInWater as boolean)) {
      this.bot.setControlState('jump', true)

      const target = thisMove.exitPos.floored().translate(0.5, 0, 0.5)
      void this.postInitAlignToPath(thisMove, { lookAt: target })

      const off0 = thisMove.exitPos.minus(this.bot.entity.position)
      const off1 = thisMove.exitPos.minus(target)

      off0.translate(0, -off0.y, 0)
      off1.translate(0, -off1.y, 0)

      const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95

      const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })

      let bb1: AABB[]
      let bb2: AABB[]
      let bb1Good
      let bb2Good
      if ((this.bot.entity as any).isInWater as boolean) {
        // console.log('in water')
        const bb1bl = this.getBlockInfo(thisMove.entryPos, 0, 0, 0)
        bb1 = [AABB.fromBlockPos(thisMove.entryPos)]
        bb1Good = bb1bl.liquid

        const bb2bl = this.getBlockInfo(target, 0, 0, 0)
        bb2 = [AABB.fromBlock(bb2bl.position)]
        bb2Good = bb2bl.walkthrough || bb2bl.liquid
      } else {
        const bb1bl = this.getBlockInfo(target, 0, -1, 0)
        bb1 = bb1bl.getBBs()
        if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position))
        bb1Good = bb1bl.physical

        const bb2bl = thisMove.moveType.getBlockInfo(thisMove.exitPos.floored(), 0, -1, 0)
        bb2 = bb2bl.getBBs()
        if (bb2.length === 0) bb2.push(AABB.fromBlock(bb1bl.position))
        bb2Good = bb2bl.physical
      }

      // console.log(
      //     bb1Good,
      //     bb2Good,
      //     Math.max(...bb1.map((b) => b.maxY)),
      //     Math.max(...bb2.map((b) => b.maxY)),
      //     bb0,
      //     bb1,
      //     bb2,
      //     bb1.some((b) => b.collides(bb0)),
      //     bb2.some((b) => b.collides(bb0)),
      //     thisMove.exitPos
      //   )

      if ((bb1.some((b) => b.collides(bb0)) && bb1Good) || (bb2.some((b) => b.collides(bb0)) && bb2Good)) {
        // console.log('yay, counted!', similarDirection, this.bot.entity.position.xzDistanceTo(target))
        if (similarDirection) return true
        else if (this.bot.entity.position.xzDistanceTo(target) < 0.2) return true // this.isLookingAtYaw(target)
        // console.log('we are here!')
      }

      return false
    } else {
      return await this.align1(thisMove)
    }
  }

  async align1 (thisMove: Move): Promise<boolean> {
    const target = thisMove.entryPos.floored().offset(0.5, 0, 0.5)
    this.bot.clearControlStates()

    void this.lookAt(target)

    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })
    const bb1bl = this.getBlockInfo(target, 0, -1, 0)

    const bb1 = bb1bl.getBBs()
    if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position))
    bb1.forEach((b) => b.extend(0, 10, 0))

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    // console.log(bb1.some((b) => b.contains(bb0)), this.isLookingAt(target))
    if (bb1.some((b) => b.contains(bb0))) {
      return this.isLookingAt(target)
    }

    // provided that velocity is not pointing towards goal OR distance to goal is greater than 0.5 (not near center of block)
    // adjust as quickly as possible to goal.
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= -0.2 || this.bot.entity.position.distanceTo(target) > 0.5) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('sneak', false)

      // if velocity is already heading towards the goal, slow down.
    } else {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true)
    }

    // console.log(this.bot.getControlState('sneak'), this.bot.getControlState('sprint'), this.bot.getControlState('forward'))
    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    for (const breakH of thisMove.toBreak) {
      await this.lookAt(breakH.vec.offset(0.5, 0, 0.5))
      await this.performInteraction(breakH)
    }

    if (thisMove.toPlace.length > 1) throw new CancelError('StraightUp: toPlace.length > 1')
    // console.log(thisMove.toPlace.length)
    for (const place of thisMove.toPlace) {
      await this.lookAt(place.vec.offset(0.5, 0, 0.5))
      this.bot.setControlState('jump', true)
      // console.log('sup')
      void this.performInteraction(place)
    }
  }

  performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if (this.bot.entity.position.y < thisMove.entryPos.y) throw new CancelError('StraightUp: too low')
    // this.bot.setControlState('sneak', false)
    void this.align(thisMove)

    this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y)

    if ((this.bot.entity as any).isInWater as boolean) {
      return tickCount > 0 && this.bot.entity.position.y >= thisMove.exitPos.y
    }

    // console.log(this.bot.entity.position.y, thisMove.exitPos.y, this.bot.entity.position.y < thisMove.exitPos.y)

    return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y >= thisMove.exitPos.y
  }
}

export class ParkourForwardExecutor extends MovementExecutor {
  private readonly shitterTwo: ParkourJumpHelper = new ParkourJumpHelper(this.bot, this.world)

  private backUpTarget?: Vec3

  private reachedBackup = false
  private executing = false

  private stepAmt = 1

  protected isComplete (startMove: Move, endMove?: Move, opts: CompleteOpts = {}): boolean {
    return super.isComplete(startMove, endMove, opts)
  }

  private async cheatCode (ticks = this.stepAmt): Promise<number> {
    let counter = 0
    const early = await new Promise<boolean>((resolve, reject) => {
      let leave = false
      const listener = (): void => {
        if (counter++ > ticks) {
          this.bot.off('physicsTick', listener)
          counter--
          resolve(false)
        }

        if (leave) {
          this.bot.off('physicsTick', listener)
          counter--
          resolve(true)
        }

        if (leavingBlockLevel(this.bot, this.world, 1)) {
          leave = true
        }
      }
      this.bot.entity.onGround = true
      this.bot.on('physicsTick', listener)
    })

    // console.log('cheat', early, counter)
    return counter
  }

  async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    this.executing = false
    const target = thisMove.exitPos.offset(0, -1, 0)

    const targetEyeVec = this.shitterTwo.findGoalVertex(AABB.fromBlockPos(target))
    const test2 = this.shitterTwo.simFallOffEdge(target)

    if (test2) {
      this.executing = true
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('forward', true)
      this.bot.setControlState('jump', false)
      // this.reachedBackup = true;
      // this.bot.setControlState("sneak", false);
      void this.lookAtPathPos(target)
      return true
    }

    // return true;

    const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6)

    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos.offset(0, -1, 0)))
    }

    // console.log('CALLED TEST IN ALIGN')
    const test0 = this.shitterTwo.simForwardMove(target)
    const test1 = this.shitterTwo.simJumpFromEdge(bbs, target)

    // console.log('align', test0, test1, test2, this.bot.entity.onGround)

    // if (!this.bot.entity.onGround) return false;
    if (this.bot.entity.onGround) {
      if (test0) {
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
        this.bot.setControlState('jump', true)
        this.bot.setControlState('sneak', false)
        this.bot.setControlState('jump', false)
        void this.lookAt(targetEyeVec)
        this.executing = true
        return true
      }
      if (test1) {
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
        // this.reachedBackup = true;
        // this.bot.setControlState("sneak", false);
        void this.lookAt(targetEyeVec)
        return false
      }
    }

    // return true;

    const bb = AABBUtils.getPlayerAABB({ position: this.bot.entity.position, width: 0.3, height: 1.8 }).extend(0, -0.252, 0)
    // const xzvdir = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).normalize()
    // const dir = target.minus(this.bot.entity.position).normalize()

    // const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
    const ctx = EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot)
    //
    // assume moving forward.
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.03) {
      stateLookAt(ctx.state, targetEyeVec)
      ctx.state.control.set('forward', true)
      ctx.state.control.set('sprint', true)
    }

    const goingToFall = leavingBlockLevel(this.bot, this.world, this.stepAmt, ctx)

    // console.log(goingToFall, this.bot.entity.position)

    if (!goingToFall && this.backUpTarget != null && bb.containsVec(this.backUpTarget)) {
      this.reachedBackup = true
      const dist = this.bot.entity.position.xzDistanceTo(this.backUpTarget)
      // console.log('here1', this.bot.entity.position, this.backUpTarget, dist)
      await this.lookAtPathPos(targetEyeVec)

      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
      // this.bot.setControlState('sneak', xzvdir.dot(dir) < 0.2 && true)
    } else if (this.bot.entity.onGround && goingToFall && this.backUpTarget == null) {
      this.stepAmt = 1
      this.reachedBackup = false
      this.backUpTarget = this.shitterTwo.findBackupVertex(bbs, target)
      // // const dist = this.bot.entity.position.xzDistanceTo(this.backUpTarget)

      // console.log('here2', this.backUpTarget, this.bot.entity.position)

      // behold, our first cheat.

      const oldY = this.bot.entity.position.y

      const early = await this.cheatCode(2)

      const currentY = this.bot.entity.position.y
      // console.log('new pos', this.bot.entity.position, early)

      this.bot.entity.onGround = true
      this.bot.entity.position.y = oldY
      const res = this.shitterTwo.simForwardMove(target)

      // console.log('res', res, early)
      if (res) {
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('jump', true)
        this.executing = true
        return true
      } else {
        this.bot.entity.position.y = currentY
        await this.lookAt(this.backUpTarget)
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
        //  this.bot.setControlState('sneak', dist < 0)
      }
    } else if (goingToFall && this.backUpTarget != null && this.reachedBackup) {
      const oldY = this.bot.entity.position.y

      // console.log('here5', this.bot.entity.position)
      const early = await this.cheatCode()

      const currentY = this.bot.entity.position.y
      // console.log('new pos', this.bot.entity.position, early)
      printBotControls(this.bot)
      this.bot.entity.onGround = true
      this.bot.entity.position.y = oldY
      const res = this.shitterTwo.simForwardMove(target)

      // console.log('res', res, early)
      if (res) {
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('jump', true)
        this.executing = true
        return true
      } else {
        this.bot.entity.position.y = currentY
        await this.lookAtPathPos(this.backUpTarget)
        this.bot.clearControlStates()
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sneak', true)
        await this.bot.waitForTicks(1)
        this.stepAmt = 1
        delete this.backUpTarget
        this.reachedBackup = false
        throw new CancelError('ParkourExecutor: will not make this jump!')
      }
    } else if (!this.reachedBackup && this.backUpTarget != null) {
      const dist = this.bot.entity.position.xzDistanceTo(this.backUpTarget)
      // console.log('here3', this.bot.entity.position, this.backUpTarget)

      void this.lookAtPathPos(this.backUpTarget)
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', dist > 0)
      // this.bot.setControlState('sneak', dist < 0 && false)
    } else {
      // const state = this.bot.physicsUtil.engine.simulate(EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot), this.world)
      // if (state.pos.y < this.bot.entity.position.y) {
      // console.trace("HI", state.pos, this.bot.entity.position)
      //   this.bot.setControlState('sneak', true)
      //   // throw new CancelError('ParkourForward: Not making this jump.')
      // } else {
      this.bot.clearControlStates()
      // console.log('here4', this.bot.entity.position, this.backUpTarget)

      void this.lookAtPathPos(targetEyeVec)
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
      // this.bot.setControlState('sneak', xzvdir.dot(dir) < 0.3 && false)

      // }
    }

    // console.log('done')

    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    delete this.backUpTarget
    this.reachedBackup = false
    // await this.postInitAlignToPath(thisMove)
    // await this.lookAtPathPos(thisMove.exitPos);
    // this.bot.chat(`/particle flame ${thisMove.exitPos.x} ${thisMove.exitPos.y} ${thisMove.exitPos.z} 0 0.5 0 0 10 force`)

    // this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos);

    // this.bot.setControlState("sprint", true);
    // this.bot.setControlState("forward", true);
  }

  // TODO: Fix this. Good thing I've done this before. >:)
  performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    // console.log('in per tick', tickCount)
    // printBotControls(this.bot)

    const targetEyeVec = this.shitterTwo.findGoalVertex(AABB.fromBlockPos(thisMove.exitPos))
    // if (!this.bot.entity.onGround && !this.executing) return false;
    // this.bot.clearControlStates()
    if (this.executing) {
      this.bot.setControlState('jump', false)
      // console.log(this.bot.entity.position)
      void this.postInitAlignToPath(thisMove, { lookAtYaw: targetEyeVec })
      return this.isComplete(thisMove)
    }

    const target = thisMove.exitPos.offset(0, -1, 0)
    // const targetVec = this.shitterTwo.findGoalVertex(AABB.fromBlockPos(target))

    const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6)
    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos))
    }

    void this.postInitAlignToPath(thisMove, { lookAtYaw: targetEyeVec })
    // this.lookAtPathPos(thisMove.exitPos)

    // console.log('CALLED TEST IN PER TICK', this.bot.entity.position, this.shitterTwo.getUnderlyingBBs(this.bot.entity.position,0.6))
    const test = this.shitterTwo.simForwardMove(target)
    const test1 = this.shitterTwo.simJumpFromEdge(bbs, target)
    // console.log(test, test1, target);
    // if (this.cI && !this.cI.allowExternalInfluence(this.bot, 5)) {
    //   this.bot.clearControlStates();
    //   return false;
    // }

    // console.log('per tick', test, test1)

    if (test) {
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('forward', true)
      this.bot.setControlState('jump', true)
      this.executing = true
    } else if (test1) {
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('forward', true)
    } else {
      // this.alignToPath(thisMove);
    }

    return false
  }
}
