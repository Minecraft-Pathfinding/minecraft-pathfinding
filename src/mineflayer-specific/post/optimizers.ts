import { Path, Algorithm } from "../../abstract";
import { Move } from "../move";
import { RayType } from "../movements/utils";
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
    const width = 0.95; // ensure safety (larger than actual bot aabb)
  

    const bb = AABBUtils.getEntityAABBRaw({ position: orgPos, width, height: 1.8 });
    const verts = bb.expand(0, -0.1, 0).toVertices();

    const verts1 = [
      orgPos.offset(-width / 2, -0.6, -width / 2),
      orgPos.offset(width / 2, -0.6, -width / 2),
      orgPos.offset(width / 2, -0.6, width / 2),
      orgPos.offset(-width / 2, -0.6, width / 2),
    ];

    while (lastMove.exitPos.y === orgY) {
      if (nextMove === undefined) return --currentIndex;
      for (const vert of verts) {
        const offset = vert.minus(orgPos);
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
        const test = test1.plus(offset);
        const dist = lastMove.exitPos.distanceTo(orgPos) + 2;
        const raycast0 = (await this.bot.world.raycast(vert, test.minus(vert).normalize(), dist)) as unknown as RayType;
        const valid0 = !raycast0 || raycast0.boundingBox === "empty" || raycast0.position.distanceTo(orgPos) > dist;
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

        const valid0 = !raycast0 || raycast0.boundingBox === "empty" || raycast0.position.distanceTo(orgPos) > dist;
        if (!valid0) counter--;
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
      lastMove.entryPos.y >= nextMove.exitPos.y
    ) {
      lastMove = nextMove;
      nextMove = path[++currentIndex];
      if (!nextMove) return --currentIndex;
    }

    return --currentIndex;
  }
}
