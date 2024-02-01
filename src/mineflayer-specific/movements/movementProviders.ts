import { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { goals } from "../goals";
import { Move } from "../move";
import { World } from "../world/worldInterface";
import { Movement, MovementOptions } from "./movement";
import { BreakHandler, PlaceHandler } from "./interactionUtils";
import { emptyVec } from "@nxg-org/mineflayer-physics-util/dist/physics/settings";
import { MovementProvider } from "./movementProvider";
export class IdleMovement extends Movement {
  provideMovements(start: Move, storage: Move[]): void {}
  performInit = async (thisMove: Move, currentIndex: number, path: Move[]) => {};
  performPerTick = async (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]) => {
    return true;
  };
}

export class Forward extends MovementProvider {
  constructor(bot: Bot, world: World, settings: Partial<MovementOptions>) {
    super(bot, world, settings);
  }

  provideMovements(start: Move, storage: Move[], goal: goals.Goal): void {
    for (const dir of Movement.cardinalDirs) {
      this.getMoveForward(start, dir, storage);
    }
  }

  getMoveForward(start: Move, dir: Vec3, neighbors: Move[]) {
    const pos = start.toVec();

    let cost = 1; // move cost

    if (this.getBlockInfo(pos, 0, 0, 0).liquid) cost += this.settings.liquidCost

    const blockB = this.getBlockInfo(pos, dir.x, 1, dir.z);
    const blockC = this.getBlockInfo(pos, dir.x, 0, dir.z);
    const blockD = this.getBlockInfo(pos, dir.x, -1, dir.z);

    

    const toBreak: BreakHandler[] = [];
    const toPlace: PlaceHandler[] = [];

    if (!blockD.physical && !blockC.liquid) {
      if (start.remainingBlocks <= 0) return; // not enough blocks to place

      // if (this.getNumEntitiesAt(blockD.position, 0, 0, 0) > 0) return // D intersects an entity hitbox
      if (!blockD.replaceable) {
        if ((cost += this.safeOrBreak(blockD, toBreak)) > 100) return;
      }

      if ((cost += this.safeOrPlace(blockD, toPlace, "solid")) > 100) return;
    }

    // console.log('yay!')
    // console.log('hello?', cost, blockC.block, blockB.block, this.breakCost(blockC), this.breakCost(blockB))
    if ((cost += this.safeOrBreak(blockB, toBreak)) > 100) return;
    if ((cost += this.safeOrBreak(blockC, toBreak)) > 100) return;
    


    // set exitPos to center of wanted block
    neighbors.push(Move.fromPrevious(cost, pos.add(dir).translate(0.5, 0, 0.5), start, this, toPlace, toBreak));
  }
}

export class ForwardJump extends MovementProvider {
  provideMovements(start: Move, storage: Move[], goal: goals.Goal): void {
    for (const dir of Movement.cardinalDirs) {
      this.getMoveJumpUp(start, dir, storage);
    }
  }

  /**
   * TODO: provide both non-sprint and sprint-jump moves here.
   * Saves time.
   * @param node
   * @param dir
   * @param neighbors
   * @returns
   */
  getMoveJumpUp(node: Move, dir: Vec3, neighbors: Move[]) {
    // const pos = node.exitRounded(1)
    const pos = node.toVec();
    const blockA = this.getBlockInfo(pos, 0, 2, 0);
    const blockH = this.getBlockInfo(pos, dir.x, 2, dir.z);
    const blockB = this.getBlockInfo(pos, dir.x, 1, dir.z);
    const blockC = this.getBlockInfo(pos, dir.x, 0, dir.z);

    let cost = 1 + this.settings.jumpCost; // move cost (move+jump)

    if (this.getBlockInfo(pos, 0, 0, 0).liquid) cost += this.settings.liquidCost

    const toBreak: BreakHandler[] = [];
    const toPlace: PlaceHandler[] = [];

    let cHeight = blockC.height;

    // if (blockA.physical && (this.getNumEntitiesAt(blockA.position, 0, 1, 0) > 0)) return // Blocks A, B and H are above C, D and the player's space, we need to make sure there are no entities that will fall down onto our building space if we break them
    // if (blockH.physical && (this.getNumEntitiesAt(blockH.position, 0, 1, 0) > 0)) return
    // if (blockB.physical && !blockH.physical && !blockC.physical && (this.getNumEntitiesAt(blockB.position, 0, 1, 0) > 0)) return // It is fine if an ent falls on B so long as we don't need to replace block C

    if (!blockC.physical) {
      if (node.remainingBlocks <= 0) return; // not enough blocks to place

      // if (this.getNumEntitiesAt(blockC.position, 0, 0, 0) > 0) return // Check for any entities in the way of a block placement

      const blockD = this.getBlockInfo(pos, dir.x, -1, dir.z);
      if (!blockD.physical) {
        if (node.remainingBlocks <= 1) return; // not enough blocks to place

        // if (this.getNumEntitiesAt(blockD.position, 0, 0, 0) > 0) return // Check for any entities in the way of a block placement

        if (!blockD.replaceable) {
          if ((cost += this.breakCost(blockD)) > 100) return;
          toBreak.push(BreakHandler.fromVec(blockD.position, "solid"));
        }
        // cost += this.exclusionPlace(blockD)

        if ((cost += this.safeOrPlace(blockD, toPlace, "solid")) > 100) return;
      }

      if (!blockC.replaceable) {
        if ((cost += this.breakCost(blockC)) > 100) return;
          toBreak.push(BreakHandler.fromVec(blockC.position, "solid"));
      }

      if ((cost += this.safeOrPlace(blockC, toPlace, "solid")) > 100) return;
   
      cHeight += 1;
    }

    const block0 = this.getBlockInfo(pos, 0, -1, 0);
    if (cHeight - block0.height > 1.2) return; // Too high to jump
 
    if ((cost += this.safeOrBreak(blockA, toBreak)) > 100) return;
    if ((cost += this.safeOrBreak(blockB, toBreak)) > 100) return;
    if ((cost += this.safeOrBreak(blockH, toBreak)) > 100) return;
    // if (toPlace.length === 2) return;
    // set exitPos to center of block we want.
    neighbors.push(Move.fromPrevious(cost, blockB.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak));
  }
}

export class ForwardDropDown extends MovementProvider {
  provideMovements(start: Move, storage: Move[], goal: goals.Goal): void {
    for (const dir of Movement.cardinalDirs) {
      this.getMoveDropDown(start, dir, storage);
    }
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

  getMoveDropDown(node: Move, dir: Vec3, neighbors: Move[]) {
    const blockC = this.getBlockInfo(node, dir.x, 0, dir.z);
    if (blockC.liquid) return; // dont go underwater

    const blockA = this.getBlockInfo(node, dir.x, 2, dir.z);
    const blockB = this.getBlockInfo(node, dir.x, 1, dir.z);
    const blockD = this.getBlockInfo(node, dir.x, -1, dir.z);

    let cost = 1 + this.settings.jumpCost; // move cost
    const toBreak: BreakHandler[] = [];
    const toPlace: PlaceHandler[] = [];

    const blockLand = this.getLandingBlock(node, dir);
    if (!blockLand) return;

    if (!this.settings.infiniteLiquidDropdownDistance && node.y - blockLand.position.y > this.settings.maxDropDown) return; // Don't drop down into water

    const blockCheck0 = this.getBlockInfo(blockLand.position, dir.x, 1, dir.z);
    const blockCheck1 = this.getBlockInfo(blockLand.position, dir.x, 2, dir.z);

    if ((cost += this.safeOrBreak(blockCheck0, toBreak)) > 100) return;
    if ((cost += this.safeOrBreak(blockCheck1, toBreak)) > 100) return;
    if ((cost += this.safeOrBreak(blockA, toBreak)) > 100) return;
    if ((cost += this.safeOrBreak(blockB, toBreak)) > 100) return;
    if ((cost += this.safeOrBreak(blockC, toBreak)) > 100) return;
    if ((cost += this.safeOrBreak(blockD, toBreak)) > 100) return;

    // cost += this.getNumEntitiesAt(blockLand.position, 0, 0, 0) * this.entityCost // add cost for entities
    neighbors.push(Move.fromPrevious(cost, blockLand.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak));
  }
}

export class Diagonal extends MovementProvider {
  static diagonalCost = Math.SQRT2; // sqrt(2)

  provideMovements(start: Move, storage: Move[], goal: goals.Goal): void {
    for (const dir of Movement.diagonalDirs) {
      this.getMoveDiagonal(start, dir, storage, goal);
    }
  }

  getMoveDiagonal(node: Move, dir: Vec3, neighbors: Move[], goal: goals.Goal) {
    let cost = Diagonal.diagonalCost;

    if (this.getBlockInfo(node.entryPos.floored(), 0, 0, 0).liquid) cost += this.settings.liquidCost


    const toBreak: BreakHandler[] = [];
    const toPlace: PlaceHandler[] = [];
    const block00 = this.getBlockInfo(node, 0, 0, 0);

    const block0 = this.getBlockInfo(node, dir.x, 0, dir.z);
    if (block00.height - block0.height > 0.6) return; // Too high to walk up
    const needSideClearance = block00.height - block0.height < 0;
    const block1 = this.getBlockInfo(node, dir.x, 1, dir.z);
    const blockN1 = this.getBlockInfo(node, dir.x, -1, dir.z);
    if (!blockN1.physical) {
      const blockCheck0 = this.getBlockInfo(node, 0, -1, dir.z);
      const blockCheck1 = this.getBlockInfo(node, dir.x, -1, 0);

      // first sol.
      if (!blockCheck0.physical && !blockCheck1.physical) {
        if (node.remainingBlocks <= 0) return; // not enough blocks to place

        const wanted = blockCheck0;
        if (!wanted.replaceable) {
          if ((cost += this.safeOrBreak(wanted, toBreak)) > 100) return;
        }
        if ((cost += this.safeOrPlace(wanted, toPlace, "solid")) > 100) return;
      }

      if ((cost += this.safeOrPlace(blockN1, toPlace, "solid")) > 100) return;
    }

    // expect these to all be relatively easy.
    cost += this.safeOrBreak(block0, toBreak);
    cost += this.safeOrBreak(block1, toBreak);
    cost += this.safeOrBreak(this.getBlockInfo(node, dir.x, 0, 0), toBreak);
    cost += this.safeOrBreak(this.getBlockInfo(node, 0, 0, dir.z), toBreak);
    cost += this.safeOrBreak(this.getBlockInfo(node, dir.x, 1, 0), toBreak);
    cost += this.safeOrBreak(this.getBlockInfo(node, 0, 1, dir.z), toBreak);
    if (cost > 100) return;

    neighbors.push(Move.fromPrevious(cost, node.toVec().add(dir).translate(0.5, 0, 0.5), node, this, toPlace, toBreak));
  }
}

export class StraightDown extends MovementProvider {
  provideMovements(start: Move, storage: Move[], goal: goals.Goal): void {
    return this.getMoveDown(start, storage);
  }

  getMoveDown(node: Move, neighbors: Move[]) {
    if (this.getBlockInfo(node, 0, 0, 0).liquid) return; // dont go underwater


    const block0 = this.getBlockInfo(node, 0, -1, 0);

    let cost = 1; // move cost
    const toBreak: BreakHandler[] = [];
    const toPlace: PlaceHandler[] = [];

    const blockLand = this.getLandingBlock(node);
    if (!blockLand) return;

    if ((cost += this.safeOrBreak(block0, toBreak)) > 100) return;
    
    // cost += this.getNumEntitiesAt(blockLand.position, 0, 0, 0) * this.entityCost // add cost for entities

    neighbors.push(Move.fromPrevious(cost, blockLand.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak));
  }

  getLandingBlock(node: Move, dir: Vec3 = emptyVec) {
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

export class StraightUp extends MovementProvider {
  provideMovements(start: Move, storage: Move[], goal: goals.Goal): void {
    return this.getMoveUp(start, storage);
  }

  getMoveUp(node: Move, neighbors: Move[]) {

    let cost = this.settings.jumpCost; // move cost
    
    const block1 = this.getBlockInfo(node, 0, 0, 0);
    if (block1.liquid) cost += this.settings.liquidCost;
    // if (this.getNumEntitiesAt(node, 0, 0, 0) > 0) return // an entity (besides the player) is blocking the building area

    const block2 = this.getBlockInfo(node, 0, 2, 0);

   
    const toBreak: BreakHandler[] = [];
    const toPlace: PlaceHandler[] = [];

    if ((cost += this.safeOrBreak(block2, toBreak)) > 100) return;

    const nodePos = node.toVec();

    if (!block1.climbable) {
      if (!this.settings.allow1by1towers || node.remainingBlocks <= 0) return; // not enough blocks to place

      if (!block1.replaceable) {
        if ((cost += this.breakCost(block1)) > 100) return;
        toBreak.push(BreakHandler.fromVec(block1.position, "solid"));
      }

      const block0 = this.getBlockInfo(node, 0, -1, 0);

      if (block0.liquid) return; // cant build in water
      if (block0.physical && block0.height - node.y < -0.2) return; // cannot jump-place from a half block

      if ((cost += this.safeOrPlace(block1, toPlace, "solid")) > 100) return;
    }

    neighbors.push(Move.fromPrevious(cost, nodePos.offset(0.5, 1, 0.5), node, this, toPlace, toBreak));
  }
}

export class ParkourForward extends MovementProvider {
  provideMovements(start: Move, storage: Move[], goal: goals.Goal): void {
    for (const dir of Movement.cardinalDirs) {
      this.getMoveParkourForward(start, dir, storage);
    }
  }

  // Jump up, down or forward over a 1 block gap
  getMoveParkourForward(node: Move, dir: Vec3, neighbors: Move[]) {
    const block0 = this.getBlockInfo(node, 0, -1, 0);
    const block1 = this.getBlockInfo(node, dir.x, -1, dir.z);
    if (
      (block1.physical && block1.height >= block0.height) ||
      !this.getBlockInfo(node, dir.x, 0, dir.z).safe ||
      !this.getBlockInfo(node, dir.x, 1, dir.z).safe
    )
      return;
    if (this.getBlockInfo(node, 0, 0, 0).liquid) return; // cant jump from water

    let cost = 1;

    // Leaving entities at the ceiling level (along path) out for now because there are few cases where that will be important
    // cost += this.getNumEntitiesAt(node, dir.x, 0, dir.z) * this.entityCost

    // If we have a block on the ceiling, we cannot jump but we can still fall
    let ceilingClear = this.getBlockInfo(node, 0, 2, 0).safe && this.getBlockInfo(node, dir.x, 2, dir.z).safe;

    // Similarly for the down path
    let floorCleared = !this.getBlockInfo(node, dir.x, -2, dir.z).physical;

    const maxD = this.settings.allowSprinting ? 4 : 2;

    for (let d = 2; d <= maxD; d++) {
      const dx = dir.x * d;
      const dz = dir.z * d;
      const blockA = this.getBlockInfo(node, dx, 2, dz);
      const blockB = this.getBlockInfo(node, dx, 1, dz);
      const blockC = this.getBlockInfo(node, dx, 0, dz);
      const blockD = this.getBlockInfo(node, dx, -1, dz);

      // if (blockC.safe) cost += this.getNumEntitiesAt(blockC.position, 0, 0, 0) * this.entityCost

      if (ceilingClear && blockB.safe && blockC.safe && blockD.physical) {
        // cost += this.exclusionStep(blockB)
        // Forward
        neighbors.push(Move.fromPrevious(cost, blockC.position.offset(0.5, 0, 0.5), node, this, [], []));
        // neighbors.push(new Move(blockC.position.x, blockC.position.y, blockC.position.z, node.remainingBlocks, cost, [], [], true))
        break;
      } else if (ceilingClear && blockB.safe && blockC.physical) {
        // Up
        if (blockA.safe && d !== 4) {
          // 4 Blocks forward 1 block up is very difficult and fails often
          // cost += this.exclusionStep(blockA)
          if (blockC.height - block0.height > 1.2) break; // Too high to jump
          // cost += this.getNumEntitiesAt(blockB.position, 0, 0, 0) * this.entityCost
          neighbors.push(Move.fromPrevious(cost, blockB.position.offset(0.5, 0, 0.5), node, this, [], []));
          // neighbors.push(new Move(blockB.position.x, blockB.position.y, blockB.position.z, node.remainingBlocks, cost, [], [], true))
          break;
        }
      } else if ((ceilingClear || d === 2) && blockB.safe && blockC.safe && blockD.safe && floorCleared) {
        // Down
        const blockE = this.getBlockInfo(node, dx, -2, dz);
        if (blockE.physical) {
          // cost += this.exclusionStep(blockD)
          // cost += this.getNumEntitiesAt(blockD.position, 0, 0, 0) * this.entityCost
          neighbors.push(Move.fromPrevious(cost, blockD.position.offset(0.5, 0, 0.5), node, this, [], []));
          // neighbors.push(new Move(blockD.position.x, blockD.position.y, blockD.position.z, node.remainingBlocks, cost, [], [], true))
        }
        floorCleared = floorCleared && !blockE.physical;
      } else if (!blockB.safe || !blockC.safe) {
        break;
      }

      ceilingClear = ceilingClear && blockA.safe;
    }
  }
}
