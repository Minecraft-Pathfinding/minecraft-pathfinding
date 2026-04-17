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
exports.GoalFollowEntity = exports.GoalPlaceBlock = exports.GoalMineBlock = exports.GoalLookAt = exports.GoalNearXZ = exports.GoalNear = exports.GoalBlock = exports.GoalCompositeAll = exports.GoalCompositeAny = exports.GoalComposite = exports.GoalInvert = exports.GoalDynamic = exports.Goal = void 0;
const vec3_1 = require("vec3");
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const interactionUtils_1 = require("./movements/interactionUtils");
class Goal {
    onFinish(node) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}
exports.Goal = Goal;
class GoalDynamic extends Goal {
    constructor(opts = {}) {
        var _a, _b;
        super();
        this.dynamic = true;
        this.neverfinish = false;
        this.neverfinish = (_a = opts.neverfinish) !== null && _a !== void 0 ? _a : false;
        this.dynamic = (_b = opts.dynamic) !== null && _b !== void 0 ? _b : true;
    }
    _hasChanged(event, ...args) {
        const ret = this.hasChanged(event, ...args);
        if (ret)
            this.update();
        return ret;
    }
    get _eventKeys() {
        if (this.eventKeys instanceof Array)
            return this.eventKeys;
        return [this.eventKeys];
    }
    get _validKeys() {
        if (this.validKeys instanceof Array)
            return this.validKeys;
        return [this.validKeys];
    }
}
exports.GoalDynamic = GoalDynamic;
class GoalInvert extends GoalDynamic {
    get eventKeys() {
        if (!this.dynamic)
            return [];
        return this.goal.eventKeys;
    }
    get validKeys() {
        if (!this.dynamic)
            return [];
        return this.goal.validKeys;
    }
    constructor(goal) {
        super();
        this.goal = goal;
        this.dynamic = goal instanceof GoalDynamic ? goal.dynamic : false;
        this.neverfinish = goal instanceof GoalDynamic ? goal.neverfinish : false;
    }
    static from(goal) {
        return new GoalInvert(goal);
    }
    hasChanged(event, ...args) {
        if (!this.dynamic)
            return false;
        return this.goal.hasChanged(event, ...args);
    }
    isValid(event, ...args) {
        if (!this.dynamic)
            return false;
        return this.goal.isValid(event, ...args);
    }
    update() {
        if (!this.dynamic)
            return;
        this.goal.update();
    }
    isEnd(node) {
        return !this.goal.isEnd(node);
    }
    heuristic(node) {
        return -this.goal.heuristic(node);
    }
    distHeuristic(node) {
        return -this.goal.distHeuristic(node);
    }
}
exports.GoalInvert = GoalInvert;
class GoalComposite extends GoalDynamic {
    get eventKeys() {
        return [...this.dGEventMap.keys()];
    }
    get validKeys() {
        return [...this.dGValidMap.keys()];
    }
    constructor(...goals) {
        if (goals.length === 0)
            throw new Error('GoalCompositeAny: Goals array cannot be empty.');
        super();
        this.dynGoals = [];
        this.dGEventMap = new Map();
        this.dGValidMap = new Map();
        this.dynamic = goals.some(g => g instanceof GoalDynamic && g.dynamic);
        this.neverfinish = goals.some(g => g instanceof GoalDynamic && g.neverfinish);
        this.goals = goals;
        for (const goal of goals) {
            if (goal instanceof GoalDynamic) {
                this.dynGoals.push(goal);
                for (const key of goal._eventKeys) {
                    const got = this.dGEventMap.get(key);
                    if (got != null)
                        got.push(goal);
                    else
                        this.dGEventMap.set(key, [goal]);
                }
                for (const key of goal._validKeys) {
                    const got = this.dGValidMap.get(key);
                    if (got != null)
                        got.push(goal);
                    else
                        this.dGValidMap.set(key, [goal]);
                }
            }
        }
    }
    hasChanged(event, ...args) {
        const goals = this.dGEventMap.get(event);
        if (goals == null)
            return false;
        for (const goal of goals) {
            if (goal.hasChanged(event, ...args))
                return true;
        }
        return false;
    }
    isValid(event, ...args) {
        const goals = this.dGValidMap.get(event);
        if (goals == null)
            return false;
        for (const goal of goals) {
            if (goal.isValid(event, ...args))
                return true;
        }
        return false;
    }
    update() {
        for (const goal of this.dynGoals) {
            goal.update();
        }
    }
}
exports.GoalComposite = GoalComposite;
class GoalCompositeAny extends GoalComposite {
    static from(...goals) {
        return new GoalCompositeAny(...goals);
    }
    isEnd(node) {
        for (const goal of this.goals) {
            if (goal.isEnd(node))
                return true;
        }
        return false;
    }
    heuristic(node) {
        let ret = Number.MAX_VALUE;
        for (const goal of this.goals) {
            const h = goal.heuristic(node);
            if (h < ret)
                ret = h;
        }
        return ret;
    }
    distHeuristic(node) {
        let ret = Number.MAX_VALUE;
        for (const goal of this.goals) {
            const h = goal.distHeuristic(node);
            if (h < ret)
                ret = h;
        }
        return ret;
    }
}
exports.GoalCompositeAny = GoalCompositeAny;
class GoalCompositeAll extends GoalComposite {
    static from(...goals) {
        return new GoalCompositeAll(...goals);
    }
    isEnd(node) {
        for (const goal of this.goals) {
            if (!goal.isEnd(node))
                return false;
        }
        return true;
    }
    heuristic(node) {
        let ret = 0;
        for (const goal of this.goals) {
            const h = goal.heuristic(node);
            if (h > ret)
                ret = h;
        }
        return ret;
    }
    distHeuristic(node) {
        let ret = 0;
        for (const goal of this.goals) {
            const h = goal.distHeuristic(node);
            if (h > ret)
                ret = h;
        }
        if (ret < 0)
            return ret;
        return ret;
    }
}
exports.GoalCompositeAll = GoalCompositeAll;
class GoalBlock extends Goal {
    constructor(x, y, z) {
        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        super();
        this.x = x;
        this.y = y;
        this.z = z;
    }
    static fromVec(vec) {
        return new GoalBlock(vec.x, vec.y, vec.z);
    }
    static fromBlock(block) {
        return new GoalBlock(block.position.x, block.position.y, block.position.z);
    }
    heuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        return Math.sqrt(dx * dx + dz * dz + dy * dy) * (20 / 4.317);
    }
    distHeuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        const distance = Math.sqrt(dx * dx + dz * dz + dy * dy) * (20 / 4.317);
        return distance;
    }
    isEnd(node) {
        return node.x === this.x && node.y === this.y && node.z === this.z;
    }
}
exports.GoalBlock = GoalBlock;
class GoalNear extends Goal {
    constructor(x, y, z, distance) {
        super();
        this.x = x;
        this.y = y;
        this.z = z;
        this.distance = distance;
    }
    static fromVec(vec, distance) {
        return new GoalNear(vec.x, vec.y, vec.z, distance);
    }
    static fromEntity(entity, distance) {
        return new GoalNear(entity.position.x, entity.position.y, entity.position.z, distance);
    }
    static fromBlock(block, distance) {
        return new GoalNear(Math.floor(block.position.x), Math.floor(block.position.y), Math.floor(block.position.z), distance);
    }
    isEnd(node) {
        return (Math.abs(node.x - this.x) <= this.distance && Math.abs(node.y - this.y) <= this.distance && Math.abs(node.z - this.z) <= this.distance);
    }
    heuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        return Math.sqrt(dx * dx + dz * dz + dy * dy) * (20 / 4.317);
    }
    distHeuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        const distance = Math.sqrt(dx * dx + dz * dz + dy * dy);
        return distance;
    }
}
exports.GoalNear = GoalNear;
class GoalNearXZ extends Goal {
    constructor(x, z, distance) {
        super();
        this.x = x;
        this.z = z;
        this.distance = distance;
    }
    static fromVec(vec, distance) {
        return new GoalNearXZ(vec.x, vec.z, distance);
    }
    isEnd(node) {
        return Math.abs(node.x - this.x) <= this.distance && Math.abs(node.z - this.z) <= this.distance;
    }
    heuristic(node) {
        const dx = this.x - node.x;
        const dz = this.z - node.z;
        return Math.sqrt(dx * dx + dz * dz) * (20 / 4.317);
    }
    distHeuristic(node) {
        const dx = this.x - node.x;
        const dz = this.z - node.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
}
exports.GoalNearXZ = GoalNearXZ;
class GoalLookAt extends Goal {
    constructor(world, x, y, z, width, height, distance, eyeHeight) {
        super();
        this.world = world;
        this.width = width;
        this.height = height;
        this.distance = distance;
        this.eyeHeight = eyeHeight;
        this.x = x + width / 2;
        this.y = y + height / 2;
        this.z = z + width / 2;
        this.bb = new mineflayer_util_plugin_1.AABB(x, y, z, this.x + width / 2, this.y + height / 2, this.z + width / 2).expand(0.001, 0.001, 0.001);
    }
    static fromEntity(world, entity, width, distance = 4, height = 1.62) {
        return new GoalLookAt(world, entity.position.x, entity.position.y, entity.position.z, width, height, distance, height);
    }
    static fromBlock(world, block, distance = 4, height = 1.62) {
        return new GoalLookAt(world, block.position.x, block.position.y, block.position.z, 1, 1, distance, height);
    }
    heuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - (node.y + this.eyeHeight);
        const dz = this.z - node.z;
        return Math.sqrt(dx * dx + dz * dz + dy * dy) * (20 / 4.317);
    }
    distHeuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - (node.y + this.eyeHeight);
        const dz = this.z - node.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return distance;
    }
    isEnd(node) {
        const dist = this.heuristic(node);
        if (dist > this.distance + 3)
            return false;
        const pos = new vec3_1.Vec3(node.x, node.y + this.eyeHeight, node.z);
        const dir = new vec3_1.Vec3(this.x - node.x, this.y - pos.y, this.z - node.z).normalize();
        const raycast = this.world.raycast(pos, dir, this.distance + 3);
        if (raycast === null)
            return false;
        const intsec = raycast.intersect;
        if (intsec === null)
            return false;
        if (intsec.distanceTo(pos) > this.distance)
            return false;
        return this.bb.containsVec(intsec);
    }
    onFinish(node) {
        return __awaiter(this, void 0, void 0, function* () {
            const bot = node.bot;
            yield bot.lookAt(new vec3_1.Vec3(this.x, this.y, this.z));
            yield bot.lookAt(new vec3_1.Vec3(this.x, this.y, this.z), true);
        });
    }
}
exports.GoalLookAt = GoalLookAt;
class GoalMineBlock extends GoalLookAt {
    constructor(world, block, distance, height) {
        if (block === null)
            throw new Error('GoalMineBlock: Block provided cannot be null.');
        super(world, block.position.x, block.position.y, block.position.z, 1, 1, distance, height);
        this.block = block;
    }
    static fromBlock(world, block, distance = 4, height = 1.62) {
        return new GoalMineBlock(world, block, distance, height);
    }
    onFinish(node) {
        return __awaiter(this, void 0, void 0, function* () {
            const bot = node.bot;
            yield bot.lookAt(new vec3_1.Vec3(this.x, this.y, this.z));
            yield bot.lookAt(new vec3_1.Vec3(this.x, this.y, this.z), true);
            const item = bot.pathingUtil.bestHarvestingTool(this.block);
            if (item != null)
                yield bot.equip(item, 'hand');
            else
                yield bot.unequip('hand');
            bot.updateHeldItem();
            yield bot.dig(this.block, 'ignore', 'raycast');
        });
    }
}
exports.GoalMineBlock = GoalMineBlock;
class GoalPlaceBlock extends GoalLookAt {
    constructor(world, bPos, item, distance, height) {
        if (bPos === null)
            throw new Error('GoalMineBlock: Block provided cannot be null.');
        super(world, bPos.x, bPos.y, bPos.z, 1, 1, distance, height);
        this.bPos = bPos;
        const type = interactionUtils_1.PlaceHandler.identTypeFromItem(item);
        this.handler = interactionUtils_1.PlaceHandler.fromVec(bPos, type);
    }
    static fromInfo(world, bPos, item, distance = 4, height = 1.62) {
        return new GoalPlaceBlock(world, bPos, item, distance, height);
    }
    isEnd(node) {
        if (!super.isEnd(node))
            return false;
        const bb = mineflayer_util_plugin_1.AABB.fromBlock(node).extend(0, 1, 0);
        return !bb.collides(this.bb);
    }
    onFinish(node) {
        return __awaiter(this, void 0, void 0, function* () {
            const bot = node.bot;
            this.handler.loadMove(node);
            yield bot.lookAt(new vec3_1.Vec3(this.x, this.y, this.z));
            yield bot.lookAt(new vec3_1.Vec3(this.x, this.y, this.z), true);
            if (this.handler.done)
                throw new Error('GoalPlaceBlock: Handler was already executed!');
            const item = this.handler.getItem(bot);
            if (item != null)
                yield bot.equip(item, 'hand');
            else
                yield bot.unequip('hand');
            bot.updateHeldItem();
            yield this.handler.perform(bot, item);
        });
    }
}
exports.GoalPlaceBlock = GoalPlaceBlock;
class GoalFollowEntity extends GoalDynamic {
    constructor(refVec, distance, opts = {}) {
        super(opts);
        this.refVec = refVec;
        this.eventKeys = 'entityMoved';
        this.validKeys = 'entityGone';
        this.x = refVec.x;
        this.y = refVec.y;
        this.z = refVec.z;
        this.sqDist = Math.pow(distance, 2);
    }
    static fromEntity(entity, distance, opts) {
        return new GoalFollowEntity(entity.position, distance, opts);
    }
    isEnd(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        return Math.abs(dx * dx) + Math.abs(dy * dy) + Math.abs(dz * dz) <= this.sqDist;
    }
    heuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) * (20 / 4.317);
    }
    distHeuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return distance;
    }
    hasChanged(event, e) {
        if (e.position !== this.refVec)
            return false;
        const dx = this.x - this.refVec.x;
        const dy = this.y - this.refVec.y;
        const dz = this.z - this.refVec.z;
        return Math.abs(dx * dx) + Math.abs(dy * dy) + Math.abs(dz * dz) > 1;
    }
    isValid(event, entity) {
        return entity.position === this.refVec;
    }
    update() {
        this.x = this.refVec.x;
        this.y = this.refVec.y;
        this.z = this.refVec.z;
    }
}
exports.GoalFollowEntity = GoalFollowEntity;
//# sourceMappingURL=goals.js.map