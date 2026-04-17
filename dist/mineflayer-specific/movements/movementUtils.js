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
exports.ParkourJumpHelper = exports.JumpCalculator = void 0;
exports.stateLookAt = stateLookAt;
exports.isBlockTypeInChunks = isBlockTypeInChunks;
exports.getUnderlyingBBs = getUnderlyingBBs;
exports.leavingBlockLevel = leavingBlockLevel;
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const vec3_1 = __importStar(require("vec3"));
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const jumpSim_1 = require("./simulators/jumpSim");
function stateLookAt(state, point) {
    const delta = point.minus(state.pos.offset(0, state.height - 0.18, 0));
    const yaw = Math.atan2(-delta.x, -delta.z);
    const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
    const pitch = Math.atan2(delta.y, groundDistance);
    state.yaw = yaw;
    state.pitch = pitch;
}
function isBlockTypeInChunks(info, ...chunks) {
    var _a;
    info = info instanceof Number ? info : (_a = info.stateId) !== null && _a !== void 0 ? _a : -1;
    for (const chunk of chunks) {
        for (const section of chunk.sections) {
            if (section.palette)
                for (const id of section.palette)
                    if (info === id)
                        return true;
        }
    }
    return false;
}
function getUnderlyingBBs(world, pos, width, colliding = true) {
    const verts = [
        pos.offset(-width / 2, -0.6, -width / 2),
        pos.offset(-width / 2, -0.6, width / 2),
        pos.offset(width / 2, -0.6, -width / 2),
        pos.offset(width / 2, -0.6, width / 2)
    ];
    const bb = mineflayer_util_plugin_1.AABBUtils.getPlayerAABB({ position: pos, width, height: 0.1 });
    const blocks = new Set(verts.map((v) => world.getBlockInfo(v)));
    const ret = [];
    for (const block of blocks) {
        for (const bb0 of block.getBBs()) {
            if (bb0.collides(bb) || !colliding) {
                ret.push(bb0);
            }
        }
    }
    return ret;
}
function leavingBlockLevel(bot, world, ticks = 1, ectx) {
    const bbs = getUnderlyingBBs(world, bot.entity.position, 0.6);
    const minY = bbs.reduce((acc, bb) => Math.min(acc, bb.minY), Infinity);
    let ctx;
    if (ectx != null)
        ctx = ectx;
    else
        ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot);
    for (let i = 0; i < ticks; i++) {
        bot.physicsUtil.engine.simulate(ctx, world);
    }
    const bbs1 = getUnderlyingBBs(world, ctx.state.pos, 0.6);
    const minY1 = bbs1.reduce((acc, bb) => Math.min(acc, bb.minY), Infinity);
    const bad = ctx.state.pos.y < bot.entity.position.y;
    if ((minY === Infinity || minY1 === Infinity) || bad) {
        return true;
    }
    return minY1 < minY;
}
class JumpCalculator {
    constructor(sim, bot, world, ctx) {
        this.engine = sim;
        this.bot = bot;
        this.ctx = ctx;
        this.world = world;
    }
    findJumpPoint(goal, maxTicks = 20) {
        if (this.checkImmediateSprintJump(goal)) {
            return { jumpTick: 0, sprintTick: 0, backTick: Infinity };
        }
        let firstTick = 0;
        let secondTick = 1;
        const sprintAfterJump = this.ctx.state.vel.y > 0;
        while (firstTick < 12) {
            while (secondTick < 12 - firstTick) {
                const res = this.checkSprintJump(goal, firstTick, secondTick, sprintAfterJump);
                if (res) {
                    return sprintAfterJump
                        ? { jumpTick: firstTick, sprintTick: firstTick + secondTick, backTick: Infinity }
                        : { jumpTick: firstTick + secondTick, sprintTick: firstTick, backTick: Infinity };
                }
                secondTick++;
            }
            secondTick = 0;
            firstTick++;
        }
        let backTick = 1;
        let sprintTick = 0;
        while (backTick < 4) {
            while (sprintTick < 4 - backTick) {
                const res = this.checkSprintJump(goal, 0, sprintTick + backTick, true, backTick);
                if (res) {
                    return { jumpTick: 0, sprintTick: sprintTick + backTick, backTick };
                }
                sprintTick++;
            }
            sprintTick = 0;
            backTick++;
        }
        return null;
    }
    resetState() {
        this.ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.engine.ctx, this.bot);
        this.ctx.state.age = 0;
        this.ctx.state.control = mineflayer_physics_util_1.ControlStateHandler.DEFAULT();
        this.ctx.state.pos.set(this.bot.entity.position.x, this.bot.entity.position.y, this.bot.entity.position.z);
        this.ctx.state.vel.set(this.bot.entity.velocity.x, this.bot.entity.velocity.y, this.bot.entity.velocity.z);
        return this.ctx.state;
    }
    checkImmediateSprintJump(goal) {
        const state = this.resetState();
        stateLookAt(state, goal);
        this.simJump(state);
        if (state.isCollidedHorizontally)
            return false;
        if (state.onGround && state.pos.y === goal.y)
            return true;
        return false;
    }
    checkSprintJump(goal, firstTicks = 0, secondTicks = 0, sprintAfterJump = false, backTicks = Infinity) {
        const state = this.resetState();
        stateLookAt(state, goal);
        this.simJumpAdvanced(state, goal, {
            firstTicks,
            secondTicks,
            backTicks,
            sprintAfterJump,
            maxTicks: 20
        });
        if (state.isCollidedHorizontally)
            return false;
        if (state.onGround && state.pos.y === goal.y)
            return true;
        return false;
    }
    simJump(state, maxTicks = 20) {
        state.control.set('forward', true);
        state.control.set('jump', true);
        state.control.set('sprint', true);
        this.engine.simulateUntil((state, ticks) => ticks > 0 && (state.onGround || state.isCollidedHorizontally), () => { }, () => { }, this.ctx, this.world, maxTicks);
        return state;
    }
    simJumpAdvanced(state, goal, opts = {}) {
        const { firstTicks, secondTicks, backTicks, sprintAfterJump, maxTicks } = opts;
        const ft = firstTicks !== null && firstTicks !== void 0 ? firstTicks : 0;
        const st = secondTicks !== null && secondTicks !== void 0 ? secondTicks : 0;
        const bt = backTicks !== null && backTicks !== void 0 ? backTicks : Infinity;
        const sj = sprintAfterJump !== null && sprintAfterJump !== void 0 ? sprintAfterJump : false;
        const mt = maxTicks !== null && maxTicks !== void 0 ? maxTicks : 20;
        this.engine.simulateUntil((state, ticks) => {
            const boundary = sj ? ft + st : ft;
            return (state.control.get('jump') && state.onGround && ticks > boundary) || (ticks > 0 && state.isCollidedHorizontally);
        }, () => { }, (state, ticks) => {
            stateLookAt(state, goal);
            state.control.set('back', false);
            state.control.set('forward', false);
            state.control.set('jump', false);
            state.control.set('sprint', false);
            if (bt !== Infinity && ticks < bt) {
                state.control.set('back', true);
                state.control.set('jump', true);
            }
            if (ticks >= ft) {
                if (sj)
                    state.control.set('jump', true);
                else {
                    state.control.set('sprint', true);
                    state.control.set('forward', true);
                }
                if (ticks >= ft + st) {
                    if (sj) {
                        state.control.set('sprint', true);
                        state.control.set('forward', true);
                    }
                    else {
                        state.control.set('jump', true);
                    }
                }
            }
        }, this.ctx, this.world, mt);
        return state;
    }
}
exports.JumpCalculator = JumpCalculator;
class ParkourJumpHelper {
    constructor(bot, world) {
        this.bot = bot;
        this.sim = new jumpSim_1.JumpSim(new mineflayer_physics_util_1.BotcraftPhysics(bot.registry), world);
        this.world = world;
    }
    findGoalVertex(goal) {
        const pos = this.bot.entity.position;
        const closerX = goal.minX - pos.x < pos.x - goal.maxX ? goal.minX : goal.maxX;
        const closerZ = goal.minZ - pos.z < pos.z - goal.maxZ ? goal.minZ : goal.maxZ;
        const verts = [
            (0, vec3_1.default)(closerX, goal.maxY, closerZ),
            (0, vec3_1.default)(closerX, goal.maxY, goal.minZ),
            (0, vec3_1.default)(closerX, goal.maxY, goal.maxZ),
            (0, vec3_1.default)(goal.minX, goal.maxY, closerZ),
            (0, vec3_1.default)(goal.maxX, goal.maxY, closerZ)
        ];
        if (goal.minX - pos.x < 1 && pos.x - goal.maxX < 1) {
            verts.push((0, vec3_1.default)(goal.maxX - pos.x + goal.minX, goal.maxY, goal.minZ));
            verts.push((0, vec3_1.default)(goal.maxX - pos.x + goal.minX, goal.maxY, goal.maxZ));
        }
        if (goal.minZ - pos.z < 1 && pos.z - goal.maxZ < 1) {
            verts.push((0, vec3_1.default)(goal.minX, goal.maxY, goal.maxZ - pos.z + goal.minZ));
            verts.push((0, vec3_1.default)(goal.maxX, goal.maxY, goal.maxZ - pos.z + goal.minZ));
        }
        let minDist = Infinity;
        let minVert = verts[0];
        for (const vert of verts) {
            const dist = vert.distanceTo(pos);
            if (dist < minDist) {
                minDist = dist;
                minVert = vert;
            }
        }
        return minVert;
    }
    findBackupVertex(bbs, goalVert, orgPos = this.bot.entity.position) {
        const dir = goalVert.minus(this.bot.entity.position);
        dir.translate(0, -dir.y, 0);
        dir.normalize();
        const start = this.bot.entity.position.clone();
        start.y = Math.round(start.y);
        const intersects = [];
        start.translate(0, -0.251, 0);
        for (const bb of bbs) {
            const intersect = bb.intersectsRay(start, dir);
            if (intersect != null)
                intersects.push(intersect);
        }
        intersects.sort((a, b) => b.distanceTo(start) - a.distanceTo(start));
        const intersect = intersects[0];
        if (intersect == null) {
            let intersect = this.bot.entity.position;
            let verts = bbs.flatMap((bb) => bb.toVertices());
            verts = verts.filter((v) => goalVert.xzDistanceTo(v) > goalVert.xzDistanceTo(start));
            let closest = 0;
            const minY = this.bot.entity.position;
            for (const vert of verts) {
                if (vert.y < minY.y)
                    continue;
                const dir1 = goalVert.minus(vert);
                const cmp = dir.dot(dir1);
                if (cmp > closest) {
                    closest = cmp;
                    intersect = vert;
                }
            }
            return intersect;
        }
        const dir2 = intersect.minus(start);
        let scale = 1.25;
        outer: while (scale >= 0.6) {
            const wanted = dir2.scaled(scale).plus(start);
            const width = 0.6;
            const height = 1.8;
            const testBB = mineflayer_util_plugin_1.AABBUtils.getPlayerAABB({ position: wanted.offset(0, 0.252, 0), width, height });
            const cursor = new vec3_1.Vec3(0, 0, 0);
            for (let x = testBB.minX; x <= testBB.maxX; x += width / 2) {
                for (let y = testBB.minY; y <= testBB.maxY; y += height / 2) {
                    for (let z = testBB.minZ; z <= testBB.maxZ; z += width / 2) {
                        cursor.set(x, y, z);
                        const bl = this.world.getBlockInfo(cursor);
                        if (bl.physical && bl.getBBs().some((b) => b.collides(testBB))) {
                            scale -= 0.03;
                            continue outer;
                        }
                    }
                }
            }
            return wanted;
        }
        return intersect;
    }
    simJumpFromEdge(srcBBs, goal) {
        const goalVert = this.findGoalVertex(mineflayer_util_plugin_1.AABB.fromBlockPos(goal));
        const goalBBs = this.world.getBlockInfo(goal).getBBs();
        const ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot);
        const state = this.sim.simulateJumpFromEdgeOfBlock(ctx, srcBBs, goalVert, goalBBs, true, 40);
        const reached = jumpSim_1.JumpSim.getReachedAABB(goalBBs);
        return reached(state, 0);
    }
    simFallOffEdge(goal, target) {
        const goalVert = this.findGoalVertex(mineflayer_util_plugin_1.AABB.fromBlockPos(goal));
        const ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot);
        const goalBBs = this.world.getBlockInfo(goal).getBBs();
        ctx.state.control = mineflayer_physics_util_1.ControlStateHandler.DEFAULT();
        if (target)
            stateLookAt(ctx.state, target);
        ctx.state.control.set('forward', true);
        ctx.state.control.set('jump', false);
        ctx.state.control.set('sprint', true);
        const orgPos = this.bot.entity.position.clone();
        const reached0 = jumpSim_1.JumpSim.getReachedAABB(goalBBs);
        const reached = (state, ticks) => state.onGround && reached0(state, ticks);
        const state = this.sim.simulateUntil(reached, () => { }, (state) => {
            if (state.pos.y === orgPos.y) {
            }
            stateLookAt(state, goalVert);
        }, ctx, this.world, 45);
        return reached0(state, 0);
    }
    simForwardMove(goal, eyeTarget, jump = true, ...constraints) {
        const ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot);
        const goalBBs = this.world.getBlockInfo(goal).getBBs();
        ctx.state.control = mineflayer_physics_util_1.ControlStateHandler.DEFAULT();
        if (eyeTarget)
            stateLookAt(ctx.state, eyeTarget);
        ctx.state.control.set('forward', true);
        ctx.state.control.set('jump', jump);
        ctx.state.control.set('sprint', true);
        const g = jumpSim_1.JumpSim.getReachedAABB(goalBBs);
        let reached = (state, ticks) => {
            return g(state, ticks);
        };
        if (constraints.length > 0) {
            const old = reached;
            reached = (state, ticks) => {
                for (const constraint of constraints) {
                    if (!constraint(state, ticks))
                        return false;
                }
                return old(state, ticks);
            };
        }
        const state = this.sim.simulateUntilOnGround(ctx, 45, reached);
        const testwtf = reached(state, 0);
        return testwtf;
    }
    simBackupJump(goal) {
        const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6);
        const goalBBs = this.world.getBlockInfo(goal).getBBs();
        let goalVert;
        if (goalBBs.length === 1) {
            goalVert = this.findGoalVertex(goalBBs[0]);
        }
        else {
            goalVert = this.findGoalVertex(mineflayer_util_plugin_1.AABB.fromBlockPos(goal));
        }
        const ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot);
        ctx.state.control = mineflayer_physics_util_1.ControlStateHandler.DEFAULT();
        const reached = jumpSim_1.JumpSim.getReachedAABB(goalBBs);
        const lazyFix = this.findBackupVertex(bbs, goal);
        this.sim.simulateBackUpBeforeJump(ctx, lazyFix, true, true, 40);
        const state = this.sim.simulateJumpFromEdgeOfBlock(ctx, bbs, goalVert, goalBBs, true, 40);
        return reached(state, 0);
    }
}
exports.ParkourJumpHelper = ParkourJumpHelper;
//# sourceMappingURL=movementUtils.js.map