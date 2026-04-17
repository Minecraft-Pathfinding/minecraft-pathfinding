"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeProvider = void 0;
const movementProvider_1 = require("./movementProvider");
class BridgeProvider extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = [];
    }
    provideMovements(_start, _storage, _goal, _closed) { }
}
exports.BridgeProvider = BridgeProvider;
//# sourceMappingURL=bridgeProvider.js.map