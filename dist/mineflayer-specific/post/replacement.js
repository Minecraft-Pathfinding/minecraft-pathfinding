"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Replacer = void 0;
const debug = require('debug');
const log = debug('minecraft-pathfinding:replacement');
class Replacer {
    constructor(bot, world, optMap) {
        this.currentIndex = 0;
        this.repMap = optMap;
    }
    loadPath(path) {
        this.pathCopy = path;
        this.currentIndex = 0;
    }
    sanitize() {
        return !!this.pathCopy;
    }
    makeResult(repRetMap) {
        return {
            referencePath: this.pathCopy,
            replacements: repRetMap,
            context: this
        };
    }
    compute() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.sanitize()) {
                throw new Error('Optimizer not sanitized');
            }
            const ret = new Map();
            while (this.currentIndex < this.pathCopy.length) {
                const move = this.pathCopy[this.currentIndex];
                const opt = this.repMap.get(move.moveType.constructor);
                if (opt == null) {
                    this.currentIndex++;
                    continue;
                }
                if (!opt.canReplace(move)) {
                    this.currentIndex++;
                    continue;
                }
                opt.initialize(move);
                const path = opt.compute();
                if (path === null) {
                    this.currentIndex++;
                    continue;
                }
                ret.set(this.currentIndex, path);
                log(`Found replacement for ${opt.constructor.name} at index ${this.currentIndex}. Using ${path.path.length} moves.`);
                this.currentIndex++;
            }
            log(`Optimized path length: ${this.pathCopy.length}`);
            return this.makeResult(ret);
        });
    }
}
exports.Replacer = Replacer;
//# sourceMappingURL=replacement.js.map