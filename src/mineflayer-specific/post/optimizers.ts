import { Move } from "../move";
import { RayType } from "../movements/interactionUtils";
import { BlockInfo } from "../world/cacheWorld";
import { MovementOptimizer } from "./optimizer";

import { AABBUtils } from "@nxg-org/mineflayer-util-plugin";

export class StraightAheadOpt extends MovementOptimizer {
  async identEndOpt(currentIndex: number, path: Move[]): Promise<number> {
    const thisMove = path[currentIndex]; // starting move

    let lastMove = path[currentIndex];
    let nextMove = path[++currentIndex];

    if (nextMove === undefined) return --currentIndex;

    const orgY = thisMove.entryPos.y;
    
    const orgPos = thisMove.entryPos.floored().translate(0.5, 0, 0.5); // ensure middle of block.
    const hW = 0.6; // ensure safety (larger than actual bot aabb)
    const uW = 0.4

    const bb = AABBUtils.getEntityAABBRaw({ position: orgPos, width: hW, height: 1.8 });
    const verts = bb.expand(0, -1, 0).toVertices();

    const verts1 = [
      orgPos.offset(-uW / 2, -0.6, -uW / 2),
      orgPos.offset(-uW / 2, -0.6, uW / 2),
      orgPos.offset(uW / 2, -0.6, -uW / 2),
      orgPos.offset(uW / 2, -0.6, uW / 2),
    ];

    while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
      if (nextMove === undefined) return --currentIndex;
      for (const vert of verts) {
        const offset = vert.minus(orgPos);
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
        const test = test1.plus(offset);
        const dist = nextMove.exitPos.distanceTo(orgPos);
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize(), dist, (block) =>
          !BlockInfo.replaceables.has(block.type) && !BlockInfo.liquids.has(block.type) && block.shapes.length > 0
        )) as unknown as RayType;
        const valid0 = !raycast0 || raycast0.position.distanceTo(orgPos) > dist;
        
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
          return --currentIndex;
        }
      }

      let counter = verts1.length;
      for (const vert of verts1) {
        const offset = vert.minus(orgPos);
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
        const test = test1.plus(offset);
        const dist = nextMove.exitPos.distanceTo(orgPos);
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize(), dist, (block) =>
          BlockInfo.replaceables.has(block.type) || BlockInfo.liquids.has(block.type) || block.shapes.length === 0
        )) as unknown as RayType;

        
        const valid0 = !raycast0 || raycast0.shapes.length > 0 || raycast0.position.distanceTo(orgPos) > dist;

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
       
          counter--;
        }
      }

      if (counter === 0) return --currentIndex;

      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }
    return --currentIndex;
  }
}

export class DropDownOpt extends MovementOptimizer {

  // TODO: Add fall damage checks and whatnot.

  identEndOpt(currentIndex: number, path: Move[]): number | Promise<number> {
    const thisMove = path[currentIndex]; // starting move
    let lastMove = path[currentIndex];
    let nextMove = path[++currentIndex];

    if (nextMove === undefined) return --currentIndex;

    const pos = thisMove.entryPos.floored().translate(0.5, 0, 0.5); // ensure middle of block.

    while (
      // lastMove.entryPos.xzDistanceTo(pos) > lastMove.entryPos.xzDistanceTo(lastMove.exitPos) &&
      lastMove.entryPos.y > nextMove.exitPos.y &&
      nextMove.moveType.toPlaceLen() === 0
    ) {
      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }

    const firstPos = lastMove.exitPos;

    while (
      lastMove.entryPos.y === nextMove.exitPos.y && 
      nextMove.exitPos.distanceTo(firstPos) <= 2
    ) {
      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }


    return --currentIndex;
  }
}


export class ForwardJumpUpOpt extends MovementOptimizer {

  // TODO: Add fall damage checks and whatnot.

  identEndOpt(currentIndex: number, path: Move[]): number | Promise<number> {
    let lastMove = path[currentIndex];
    let nextMove = path[++currentIndex];

    if (lastMove.toPlace.length > 1) return --currentIndex;

    if (nextMove === undefined) return --currentIndex;

    while (
      lastMove.exitPos.y === nextMove.exitPos.y && lastMove.entryPos.y !== lastMove.exitPos.y
    ) {
      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }

    return --currentIndex;
  }
}
