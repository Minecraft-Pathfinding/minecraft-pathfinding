"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canWalkOn = canWalkOn;
exports.canWalkThrough = canWalkThrough;
exports.findPlaceOpts = findPlaceOpts;
exports.canPlaceAgainst = canPlaceAgainst;
exports.isBottomSlab = isBottomSlab;
exports.getMiningDurationTicks = getMiningDurationTicks;
exports.getMiningDurationTicksCoords = getMiningDurationTicksCoords;
exports.canUseFrostWalker = canUseFrostWalker;
const vec3_1 = require("vec3");
function canWalkOn(info) {
    if (info.block == null)
        return false;
    return info.block.boundingBox === 'block' || info.safe;
}
function canWalkThrough(info) {
    if (info.block == null)
        return false;
    return info.block.boundingBox === 'empty' || info.safe;
}
const ALL_DIRS_BUT_UP = [
    new vec3_1.Vec3(1, 0, 0),
    new vec3_1.Vec3(-1, 0, 0),
    new vec3_1.Vec3(0, 0, 1),
    new vec3_1.Vec3(0, 0, -1),
    new vec3_1.Vec3(0, -1, 0)
];
function findPlaceOpts(move, orgPos, pos) {
    for (const dir of ALL_DIRS_BUT_UP) {
        const nX = pos.x + dir.x;
        const nZ = pos.z + dir.z;
        if (nX === orgPos.x && nZ === orgPos.z)
            continue;
        const info = move.getBlockInfo(pos, dir.x, dir.y, dir.z);
        if (canPlaceAgainst(info))
            return info;
    }
    return null;
}
function canPlaceAgainst(info) {
    return info.physical;
}
function isBottomSlab(info) {
    return info.dY === 0.5;
}
function getMiningDurationTicks(move, info, includeFalling = false) {
    if (!includeFalling)
        return move.breakCost(info);
    const above = move.getBlockInfo(info.position, 0, 1, 0);
    return move.breakCost(info) + getMiningDurationTicks(move, above, true);
}
function getMiningDurationTicksCoords(move, pos, includeFalling = false) {
    return getMiningDurationTicks(move, move.getBlockInfoRaw(pos), includeFalling);
}
function canUseFrostWalker(move, info) {
    return info.liquid && false;
}
//# sourceMappingURL=movementHelper.js.map