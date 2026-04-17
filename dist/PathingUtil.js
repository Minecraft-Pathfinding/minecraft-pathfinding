"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathingUtil = void 0;
const nbt = __importStar(require("prismarine-nbt"));
class PathingUtil {
    constructor(bot) {
        this.bot = bot;
        this.items = [];
        this.tools = [];
        this.memoedDigSpeed = {};
        this.memoedBestTool = {};
        this.refresh();
    }
    refresh() {
        this.items = this.bot.inventory.items();
        this.tools = this.items.filter((item) => item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('shovel') || item.name.includes('hoe') || item.name.includes('shears'));
        this.memoedDigSpeed = {};
        this.memoedBestTool = {};
    }
    bestHarvestingTool(block) {
        if (block === null)
            return null;
        if (this.memoedBestTool[block.type] != null)
            return this.memoedBestTool[block.type];
        const availableTools = this.tools;
        const effects = this.bot.entity.effects;
        const creative = this.bot.game.gameMode === 'creative';
        let fastest = Number.MAX_VALUE;
        let bestTool = null;
        for (const tool of availableTools) {
            const enchants = tool.nbt != null ? nbt.simplify(tool.nbt).Enchantments : [];
            const digTime = block.digTime(tool.type, creative, false, false, enchants, effects);
            if (digTime < fastest) {
                fastest = digTime;
                bestTool = tool;
            }
        }
        if (fastest === Number.MAX_VALUE) {
            fastest = block.digTime(null, creative, false, false, [], effects);
        }
        this.memoedBestTool[block.type] = bestTool;
        this.memoedDigSpeed[block.type] = fastest;
        return bestTool;
    }
    digCost(block) {
        if (this.memoedDigSpeed[block.type] != null)
            return this.memoedDigSpeed[block.type];
        this.bestHarvestingTool(block);
        return this.memoedDigSpeed[block.type];
    }
}
exports.PathingUtil = PathingUtil;
//# sourceMappingURL=PathingUtil.js.map