"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fasterGetBlock = fasterGetBlock;
const vec3_1 = require("vec3");
function fasterGetBlock(pos) {
    const cX = pos.x >> 4;
    const cZ = pos.z >> 4;
    const colKey = `${cX},${cZ}`;
    const col = this.async.columns[colKey];
    if (col == null) {
        return null;
    }
    const colPos = new vec3_1.Vec3(pos.x & 0xf, pos.y, pos.z & 0xf).floor();
    const ret1 = col.getBlock(colPos);
    ret1.position = pos;
    return ret1;
}
//# sourceMappingURL=utils.js.map