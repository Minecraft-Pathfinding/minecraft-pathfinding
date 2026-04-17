"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplacementHandler = void 0;
class ReplacementHandler {
    constructor(orgMove, replacement) {
        this.orgMove = orgMove;
        this.replacement = replacement;
    }
    static createFromSingle(move, replacement) {
        return new ReplacementHandler(move, replacement);
    }
    sanitize() {
        return true;
    }
    getNeighbors(org) {
        throw new Error('Method not implemented.');
    }
}
exports.ReplacementHandler = ReplacementHandler;
//# sourceMappingURL=replacements.js.map