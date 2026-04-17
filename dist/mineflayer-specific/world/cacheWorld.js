"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheSyncWorld = exports.BlockInfo = void 0;
const vec3_1 = require("vec3");
const lru_cache_1 = require("lru-cache");
const interactable_1 = __importDefault(require("./interactable"));
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const prismarine_block_1 = __importDefault(require("prismarine-block"));
class BlockInfo {
    get waterAround() {
        return this._waterAround;
    }
    get fallBlockOver() {
        return this._fallBlockOver;
    }
    get dY() {
        return this.height - this.position.y;
    }
    constructor(replaceable, canFall, walkthrough, safe, physical, liquid, climbable, height, openable, position, type, block = null) {
        this.replaceable = replaceable;
        this.canFall = canFall;
        this.walkthrough = walkthrough;
        this.safe = safe;
        this.physical = physical;
        this.liquid = liquid;
        this.climbable = climbable;
        this.height = height;
        this.openable = openable;
        this.position = position;
        this.type = type;
        this.block = block;
        this.additionalLoaded = false;
        this._waterAround = false;
        this._fallBlockOver = false;
        this.solidFull = this.height - this.position.y >= 1 && this.physical;
        this.isInvalid = this.type === -1;
    }
    static init(registry) {
        var _a;
        if (BlockInfo.initialized)
            return;
        BlockInfo.initialized = true;
        if (((_a = registry.blocksByName.soul_sand) === null || _a === void 0 ? void 0 : _a.id) != null) {
            BlockInfo.soulsandId = registry.blocksByName.soul_sand.id;
        }
        else {
            throw new Error('soul sand not found in registry');
        }
        BlockInfo.PBlock = (0, prismarine_block_1.default)(registry);
        BlockInfo.substituteBlockStateId = registry.blocksByName.dirt.minStateId;
        BlockInfo._waterBlock = BlockInfo.PBlock.fromStateId(registry.blocksByName.water.minStateId, 0);
        BlockInfo._waterBlock.position = new vec3_1.Vec3(0, 0, 0);
        BlockInfo._solidBlock = BlockInfo.PBlock.fromStateId(registry.blocksByName.dirt.minStateId, 0);
        BlockInfo._solidBlock.position = new vec3_1.Vec3(0, 0, 0);
        BlockInfo._airBlock = BlockInfo.PBlock.fromStateId(registry.blocksByName.air.minStateId, 0);
        BlockInfo._airBlock.position = new vec3_1.Vec3(0, 0, 0);
        BlockInfo._replaceableBlock = BlockInfo.PBlock.fromStateId(registry.blocksByName.air.minStateId, 0);
        BlockInfo._replaceableBlock.position = new vec3_1.Vec3(0, 0, 0);
        interactable_1.default.forEach((b) => BlockInfo.interactableBlocks.add(b));
        if (registry.blocksByName.chest != null)
            BlockInfo.interactableBlocks.add(registry.blocksByName.chest.id);
        if (registry.blocksByName.ender_chest != null)
            BlockInfo.interactableBlocks.add(registry.blocksByName.ender_chest.id);
        registry.blocksArray.forEach((block) => {
            if (block.diggable == null || block.diggable)
                return;
            if (block.id == null)
                return;
            BlockInfo.blocksCantBreak.add(block.id);
        });
        BlockInfo.blocksToAvoid.add(registry.blocksByName.fire.id);
        if (registry.blocksByName.cobweb)
            BlockInfo.blocksToAvoid.add(registry.blocksByName.cobweb.id);
        if (registry.blocksByName.web)
            BlockInfo.blocksToAvoid.add(registry.blocksByName.web.id);
        BlockInfo.blocksToAvoid.add(registry.blocksByName.lava.id);
        BlockInfo.liquids.add(registry.blocksByName.water.id);
        BlockInfo.waters.add(registry.blocksByName.water.id);
        BlockInfo.replaceables.add(registry.blocksByName.water.id);
        BlockInfo.liquids.add(registry.blocksByName.lava.id);
        BlockInfo.replaceables.add(registry.blocksByName.lava.id);
        if (registry.blocksByName.seagrass) {
            BlockInfo.liquids.add(registry.blocksByName.seagrass.id);
            BlockInfo.waters.add(registry.blocksByName.seagrass.id);
            BlockInfo.replaceables.add(registry.blocksByName.seagrass.id);
        }
        if (registry.blocksByName.tall_seagrass) {
            BlockInfo.liquids.add(registry.blocksByName.tall_seagrass.id);
            BlockInfo.waters.add(registry.blocksByName.tall_seagrass.id);
            BlockInfo.replaceables.add(registry.blocksByName.tall_seagrass.id);
        }
        if (registry.blocksByName.kelp_plant) {
            BlockInfo.liquids.add(registry.blocksByName.kelp_plant.id);
            BlockInfo.waters.add(registry.blocksByName.kelp_plant.id);
            BlockInfo.replaceables.add(registry.blocksByName.kelp_plant.id);
        }
        if (registry.blocksByName.kelp) {
            BlockInfo.liquids.add(registry.blocksByName.kelp.id);
            BlockInfo.waters.add(registry.blocksByName.kelp.id);
            BlockInfo.replaceables.add(registry.blocksByName.kelp.id);
        }
        BlockInfo.gravityBlocks.add(registry.blocksByName.sand.id);
        BlockInfo.gravityBlocks.add(registry.blocksByName.gravel.id);
        BlockInfo.climbables.add(registry.blocksByName.ladder.id);
        BlockInfo.replaceables.add(registry.blocksByName.air.id);
        if (registry.blocksByName.cave_air)
            BlockInfo.replaceables.add(registry.blocksByName.cave_air.id);
        if (registry.blocksByName.void_air)
            BlockInfo.replaceables.add(registry.blocksByName.void_air.id);
        if (registry.blocksByName.tall_grass)
            BlockInfo.replaceables.add(registry.blocksByName.tall_grass.id);
        if (registry.blocksByName.grass)
            BlockInfo.replaceables.add(registry.blocksByName.grass.id);
        BlockInfo.scaffoldingBlockItems.add(registry.itemsByName.dirt.id);
        BlockInfo.scaffoldingBlockItems.add(registry.itemsByName.cobblestone.id);
        registry.blocksArray
            .filter((x) => x.minStateId !== undefined)
            .map((x) => BlockInfo.PBlock.fromStateId(x.minStateId, 0))
            .forEach((block) => {
            if (block.shapes.length > 0) {
                if (block.shapes[0][4] > 1)
                    BlockInfo.fences.add(block.type);
                if (block.shapes[0][4] < 0.1)
                    BlockInfo.carpets.add(block.type);
            }
            else if (block.shapes.length === 0) {
                BlockInfo.emptyBlocks.add(block.type);
            }
        });
        registry.blocksArray.forEach((block) => {
            if (BlockInfo.interactableBlocks.has(block.name) &&
                block.name != null &&
                block.name.toLowerCase().includes('gate') &&
                !block.name.toLowerCase().includes('iron')) {
                BlockInfo.openable.add(block.id);
            }
        });
    }
    static fromBlock(b) {
        var _a;
        if (b === null)
            return BlockInfo.INVALID;
        if (b.boundingBox === 'block') {
            let height = b.position.y;
            if (b.shapes.length === 1)
                height = b.position.y + b.shapes[0][4];
            else {
                for (const shape of b.shapes) {
                    if (shape[4] !== 0 && height < b.position.y + shape[4])
                        height = b.position.y + shape[4];
                }
            }
            const climbable = BlockInfo.climbables.has(b.type);
            const safe = !BlockInfo.blocksToAvoid.has(b.type);
            return new BlockInfo(BlockInfo.replaceables.has(b.type), BlockInfo.gravityBlocks.has(b.type), (climbable || BlockInfo.carpets.has(b.type)) && safe, safe, true, false, climbable, height, BlockInfo.openable.has(b.type), b.position, b.type, b);
        }
        else {
            return new BlockInfo(BlockInfo.replaceables.has(b.type), false, true, true, false, BlockInfo.liquids.has(b.type) || Boolean((_a = b._properties) === null || _a === void 0 ? void 0 : _a.waterlogged), false, b.position.y, false, b.position, b.type, b);
        }
    }
    static SOLID(pos) {
        return new BlockInfo(false, false, false, true, true, false, false, pos.y + 1, false, pos, BlockInfo._solidBlock.type, BlockInfo._solidBlock);
    }
    static AIR(pos) {
        return new BlockInfo(true, false, true, true, false, false, false, 0, false, pos, BlockInfo._airBlock.type, BlockInfo._airBlock);
    }
    static REPLACEABLE(pos) {
        return new BlockInfo(true, false, true, true, false, false, false, 0, false, pos, BlockInfo._replaceableBlock.type, BlockInfo._replaceableBlock);
    }
    static WATER(pos) {
        return new BlockInfo(false, false, false, false, true, true, false, pos.y + 1, false, pos, BlockInfo._waterBlock.type, BlockInfo._waterBlock);
    }
    getBBs() {
        if (this.block != null) {
            return this.block.shapes.map((shape) => mineflayer_util_plugin_1.AABB.fromShape(shape, this.position));
        }
        else {
            const hW = 0.5;
            return [
                new mineflayer_util_plugin_1.AABB(this.position.x - hW, this.position.y, this.position.z - hW, this.position.x + hW, this.height, this.position.z + hW)
            ];
        }
    }
    loadAdditionalInfo(movement) {
        if (this.additionalLoaded)
            return;
        this.additionalLoaded = true;
        if (movement.settings.dontCreateFlow || movement.settings.dontMineUnderFallingBlock) {
            const top = movement.getBlockInfo(this.position, 0, 1, 0);
            if (movement.settings.dontCreateFlow) {
                if (top.liquid)
                    this._waterAround = true;
                else if (movement.getBlockInfo(this.position, -1, 0, 0).liquid)
                    this._waterAround = true;
                else if (movement.getBlockInfo(this.position, 1, 0, 0).liquid)
                    this._waterAround = true;
                else if (movement.getBlockInfo(this.position, 0, 0, -1).liquid)
                    this._waterAround = true;
                else if (movement.getBlockInfo(this.position, 0, 0, 1).liquid)
                    this._waterAround = true;
            }
            if (movement.settings.dontMineUnderFallingBlock) {
                if (top.canFall) {
                    this._fallBlockOver = true;
                }
            }
        }
    }
}
exports.BlockInfo = BlockInfo;
BlockInfo.initialized = false;
BlockInfo.interactableBlocks = new Set();
BlockInfo.blocksCantBreak = new Set();
BlockInfo.blocksToAvoid = new Set();
BlockInfo.climbables = new Set();
BlockInfo.carpets = new Set();
BlockInfo.fences = new Set();
BlockInfo.replaceables = new Set();
BlockInfo.liquids = new Set();
BlockInfo.waters = new Set();
BlockInfo.gravityBlocks = new Set();
BlockInfo.openable = new Set();
BlockInfo.emptyBlocks = new Set();
BlockInfo.scaffoldingBlockItems = new Set();
BlockInfo.mlgItems = new Set();
BlockInfo.INVALID = new BlockInfo(false, false, false, false, false, false, false, 0, false, new vec3_1.Vec3(0, 0, 0), -1);
class CacheSyncWorld {
    constructor(bot, referenceWorld) {
        this.cacheCalls = 0;
        this.enabled = true;
        this.minY = bot.game.minY;
        this.blockInfos = this.makeLRUCache(100000);
        this.world = referenceWorld;
        referenceWorld.on('blockUpdate', (oldBlock, newBlock) => {
            const pos = newBlock.position;
            if (this.blockInfos.has(`${pos.x}:${pos.y}:${pos.z}`)) {
                this.blockInfos.set(`${pos.x}:${pos.y}:${pos.z}`, BlockInfo.fromBlock(newBlock));
            }
        });
    }
    makeLRUCache(size) {
        return new lru_cache_1.LRUCache({
            max: size,
            ttl: 10000,
            updateAgeOnHas: false,
            updateAgeOnGet: true,
            dispose: (key, value, reason) => {
                if (reason === 'set') {
                    this.blockInfos.clear();
                }
                else if (reason === 'evict') {
                    this.blockInfos.clear();
                    this.blockInfos = this.makeLRUCache(size);
                }
            }
        });
    }
    raycast(from, direction, range, matcher) {
        return this.world.raycast(from, direction, range, matcher);
    }
    getBlock(pos) {
        if (!this.enabled) {
            return this.world.getBlock(pos);
        }
        this.cacheCalls++;
        pos = pos.floored();
        const key = `${pos.x}:${pos.y}:${pos.z}`;
        if (this.blockInfos.has(key))
            return this.blockInfos.get(key).block;
        const block = this.world.getBlock(pos);
        if (block !== null)
            this.blockInfos.set(key, BlockInfo.fromBlock(block));
        return block;
    }
    getBlockInfo(pos) {
        if (!this.enabled) {
            return BlockInfo.fromBlock(this.world.getBlock(pos));
        }
        this.cacheCalls++;
        pos = pos.floored();
        const key = `${pos.x}:${pos.y}:${pos.z}`;
        if (!this.blockInfos.has(key)) {
            const block = this.world.getBlock(pos);
            if (block === null)
                return BlockInfo.INVALID;
            const blockInfo = BlockInfo.fromBlock(block);
            this.blockInfos.set(key, blockInfo);
            return blockInfo;
        }
        return this.blockInfos.get(key);
    }
    getBlockStateId(pos) {
        var _a;
        if (!this.enabled) {
            return this.world.getBlockStateId(pos);
        }
        this.cacheCalls++;
        pos = pos.floored();
        const key = `${pos.x}:${pos.y}:${pos.z}`;
        if (this.blockInfos.has(key))
            return (_a = this.blockInfos.get(key).block) === null || _a === void 0 ? void 0 : _a.stateId;
        const state = this.world.getBlock(pos);
        if (state !== undefined)
            this.blockInfos.set(key, BlockInfo.fromBlock(state));
        return state.stateId;
    }
    getCacheSize() {
        const calls = this.cacheCalls;
        this.cacheCalls = 0;
        const used = this.blockInfos;
        return `size = ${used.size}; calls = ${calls}`;
    }
    clearCache() {
        this.blockInfos.clear();
        this.cacheCalls = 0;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    cleanup() {
        this.clearCache();
    }
}
exports.CacheSyncWorld = CacheSyncWorld;
//# sourceMappingURL=cacheWorld.js.map