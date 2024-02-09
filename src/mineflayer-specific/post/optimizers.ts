import { ControlStateHandler, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { Move } from '../move'
import { RayType } from '../movements/interactionUtils'
import { BlockInfo } from '../world/cacheWorld'
import { MovementOptimizer } from './optimizer'

import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { stateLookAt } from '../movements/movementUtils'

export class StraightAheadOpt extends MovementOptimizer {
  async identEndOpt (currentIndex: number, path: Move[]): Promise<number> {
    const thisMove = path[currentIndex] // starting move

    let lastMove = path[currentIndex]
    let nextMove = path[++currentIndex]

    if (nextMove === undefined) return --currentIndex

    const orgY = thisMove.entryPos.y

    const orgPos = thisMove.entryPos.floored().translate(0.5, 0, 0.5) // ensure middle of block.
    const hW = 0.6 // ensure safety (larger than actual bot aabb)
    const uW = 0.4

    const bb = AABBUtils.getEntityAABBRaw({ position: orgPos, width: hW, height: 1.8 })
    const verts = bb.expand(0, -0.1, 0).toVertices()

    const verts1 = [
      orgPos.offset(-uW / 2, -0.6, -uW / 2),
      orgPos.offset(-uW / 2, -0.6, uW / 2),
      orgPos.offset(uW / 2, -0.6, -uW / 2),
      orgPos.offset(uW / 2, -0.6, uW / 2)
    ]

    while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
      if (nextMove === undefined) return --currentIndex
      for (const vert of verts) {
        const offset = vert.minus(orgPos)
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0)
        const test = test1.plus(offset)
        const dist = nextMove.exitPos.distanceTo(orgPos)
        const raycast0 = (await this.bot.world.raycast(
          vert,
          test.minus(vert).normalize(),
          dist,
          (block) => !BlockInfo.replaceables.has(block.type) && !BlockInfo.liquids.has(block.type) && block.shapes.length > 0
        )) as unknown as RayType | null
        const valid0 = (raycast0 == null) || raycast0.position.distanceTo(orgPos) > dist

        // console.log('\n\nBLOCK CHECK')
        // console.log('offset', offset)
        // console.log('vert', vert)
        // console.log('orgPos', orgPos)
        // console.log('test1', test1)
        // console.log('test', test)
        // console.log('raycast0', raycast0)
        // console.log('valid0', valid0)
        // console.log('test.minus(vert).normalize()', test.minus(vert).normalize())
        // console.log('raycast0.position.distanceTo(orgPos)', raycast0?.position.distanceTo(orgPos))
        // console.log('dist', dist)

        if (!valid0) {
          return --currentIndex
        }
      }

      let counter = verts1.length
      for (const vert of verts1) {
        const offset = vert.minus(orgPos)
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0)
        const test = test1.plus(offset)
        const dist = nextMove.exitPos.distanceTo(orgPos)
        const raycast0 = (await this.bot.world.raycast(
          vert,
          test.minus(vert).normalize(),
          dist,
          (block) => BlockInfo.replaceables.has(block.type) || BlockInfo.liquids.has(block.type) || block.shapes.length === 0
        )) as unknown as RayType | null

        const valid0 = (raycast0 == null) || raycast0.shapes.length > 0 || raycast0.position.distanceTo(orgPos) > dist

        // console.log('\n\nAIR CHECK')
        // console.log('offset', offset)
        // console.log('vert', vert)
        // console.log('orgPos', orgPos)
        // console.log('test1', test1)
        // console.log('test', test)
        // console.log('raycast0', raycast0)
        // console.log('valid0', valid0)
        // console.log('test.minus(vert).normalize()', test.minus(vert).normalize())
        // console.log('raycast0.position.distanceTo(orgPos)', raycast0?.position.distanceTo(orgPos))
        // console.log('dist', dist)

        if (!valid0) {
          counter--
        }
      }

      if (counter === 0) return --currentIndex

      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }
    return --currentIndex
  }
}

export class DropDownOpt extends MovementOptimizer {
  // TODO: Add fall damage checks and whatnot.

  // TODO: Fix bugs. (e.g. if bot is on a block that is not a full block, it will not be able to drop down)
  readonly mergeInteracts = false

  identEndOpt (currentIndex: number, path: Move[]): number | Promise<number> {
    // const thisMove = path[currentIndex] // starting move
    let lastMove = path[currentIndex]
    let nextMove = path[++currentIndex]

    if (nextMove === undefined) return --currentIndex

    const firstPos = lastMove.exitPos

    let flag0 = false
    let flag1 = false
    while (currentIndex < path.length) {
      if (nextMove.exitPos.y > lastMove.exitPos.y) return --currentIndex

      if (!AABB.fromBlockPos(nextMove.entryPos).collides(AABB.fromBlockPos(nextMove.exitPos))) return --currentIndex

      // rough fix.
      if (nextMove.exitPos.xzDistanceTo(firstPos) < lastMove.exitPos.xzDistanceTo(firstPos)) return --currentIndex

      const ctx = EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot)
      // ctx.position.set(firstPos.x, firstPos.y, firstPos.z);
      ctx.velocity.set(0, 0, 0)
      // ctx.position.set(lastMove.exitPos.x, lastMove.exitPos.y, lastMove.exitPos.z);
      ctx.position.set(lastMove.entryPos.x, lastMove.entryPos.y, lastMove.entryPos.z)
      // ctx.velocity.set(lastMove.entryVel.x, lastMove.entryVel.y, lastMove.entryVel.z); // 0,0,0
      stateLookAt(ctx.state, nextMove.entryPos)
      ctx.state.control = ControlStateHandler.DEFAULT()
      ctx.state.control.forward = true
      ctx.state.control.sprint = true

      const bl0 = lastMove.moveType.getBlockInfo(nextMove.entryPos, 0, -1, 0)
      const bl1 = lastMove.moveType.getBlockInfo(nextMove.exitPos, 0, -1, 0)
      const bb0solid = bl0.physical || bl0.liquid
      const bb1solid = bl1.physical || bl1.liquid
      const blockBB0 = AABB.fromBlockPos(nextMove.entryPos.offset(0, -1, 0))
      const blockBB1 = AABB.fromBlockPos(nextMove.exitPos.offset(0, -1, 0))
      let flag = false
      let good = false
      this.sim.simulateUntil(
        (state, ticks) => {
          const pBB = AABBUtils.getPlayerAABB({ position: ctx.state.pos, width: 0.6, height: 1.8 })
          const collided =
            (pBB.collides(blockBB0) && bb0solid) || (pBB.collides(blockBB1) && bb1solid && (state.onGround || state.isInWater))
          // console.log(pBB, blockBB0, bb0solid, blockBB1, bb1solid);
          // console.log(state.onGround, state.isCollidedHorizontally, collided, flag);
          if (collided) {
            good = true
            return true
          }

          if (state.pos.y < nextMove.entryPos.y && state.pos.y < nextMove.exitPos.y) flag = true

          // if (state.pos.y < lastMove.entryPos.y || state.pos.y < lastMove.exitPos.y) flag = true;
          if (flag) return (ticks > 0 && state.onGround) || state.isCollidedHorizontally
          else return false
        },
        () => {},
        (state) => stateLookAt(state, nextMove.exitPos),
        ctx,
        this.world,
        1000
      )

      if (!good) return --currentIndex

      if (ctx.state.isInWater) flag1 = true
      else if (flag1) return --currentIndex

      if (nextMove.exitPos.y === nextMove.entryPos.y) {
        if (!bb1solid) return --currentIndex
        if (flag0) return currentIndex
        else flag0 = true
      }

      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }

    return --currentIndex
  }
}

export class ForwardJumpUpOpt extends MovementOptimizer {
  // TODO: Add fall damage checks and whatnot.

  identEndOpt (currentIndex: number, path: Move[]): number | Promise<number> {
    let lastMove = path[currentIndex]
    let nextMove = path[++currentIndex]

    if (lastMove.toPlace.length > 0) return --currentIndex

    if (nextMove === undefined) return --currentIndex

    while (
      lastMove.exitPos.y === nextMove.exitPos.y &&
      lastMove.entryPos.y !== lastMove.exitPos.y &&
      nextMove.toPlace.length === 0 &&
      nextMove.toBreak.length === 0
    ) {
      if (!AABB.fromBlockPos(nextMove.entryPos).collides(AABB.fromBlockPos(nextMove.exitPos))) return --currentIndex
      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }

    const firstPos = lastMove.exitPos

    while (
      lastMove.exitPos.y === nextMove.exitPos.y &&
      nextMove.exitPos.distanceTo(firstPos) <= 2 && // remove for more aggressive opt.
      nextMove.toPlace.length === 0 &&
      nextMove.toBreak.length === 0
    ) {
      if (nextMove.exitPos.y > firstPos.y) return --currentIndex
      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }

    return --currentIndex
  }
}
