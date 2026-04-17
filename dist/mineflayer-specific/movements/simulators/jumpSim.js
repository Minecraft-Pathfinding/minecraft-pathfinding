"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JumpSim = void 0;
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const vec3_1 = require("vec3");
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const controls_1 = require("../controls");
const PI_OVER_TWELVE = (1 * Math.PI) / 12;
const FIVE_PI_OVER_TWELVE = (5 * Math.PI) / 12;
const SEVEN_PI_OVER_TWELVE = (7 * Math.PI) / 12;
const ELEVEN_PI_OVER_TWELVE = (11 * Math.PI) / 12;
const THIRTEEN_PI_OVER_TWELVE = (13 * Math.PI) / 12;
const SEVENTEEN_PI_OVER_TWELVE = (17 * Math.PI) / 12;
const NINETEEN_PI_OVER_TWELVE = (19 * Math.PI) / 12;
const TWENTY_THREE_PI_OVER_TWELVE = (23 * Math.PI) / 12;
class JumpSim extends mineflayer_physics_util_1.BaseSimulator {
    constructor(physics, world) {
        super(physics);
        this.physics = physics;
        this.world = world;
    }
    clone() {
        return new JumpSim(this.physics, this.world);
    }
    simulateUntilNextTick(ctx) {
        return this.simulateUntil(() => false, () => { }, () => { }, ctx, this.world, 1);
    }
    simulateUntilOnGround(ctx, ticks = 5, goal = () => false) {
        const state = this.simulateUntil(JumpSim.buildAnyGoal(goal, (state, ticks) => ticks > 0 && state.onGround), () => { }, () => { }, ctx, this.world, ticks);
        return state;
    }
    simulateSmartAim(goal, goalVec, ctx, sprint, jump, jumpAfter = 0, ticks = 20) {
        return this.simulateUntil(JumpSim.getReachedAABB(goal), JumpSim.getCleanupPosition(goalVec), JumpSim.buildFullController(JumpSim.getControllerStraightAim(goalVec), JumpSim.getControllerJumpSprint(jump, sprint, jumpAfter)), ctx, this.world, ticks);
    }
    simulateBackUpBeforeJump(ctx, goal, sprint, strafe = true, ticks = 20) {
        const aim = strafe ? JumpSim.getControllerStrafeAim(goal) : JumpSim.getControllerStraightAim(goal);
        return this.simulateUntil((state) => state.pos.xzDistanceTo(goal) < 0.1, JumpSim.getCleanupPosition(goal), JumpSim.buildFullController(aim, JumpSim.getControllerSmartMovement(goal, sprint), (state, ticks) => {
            state.control.sprint = false;
            state.control.sneak = true;
        }), ctx, this.world, ticks);
    }
    simulateJumpFromEdgeOfBlock(ctx, srcAABBs, goalCorner, goalBlock, sprint, ticks = 20) {
        let jump = false;
        let changed = false;
        return this.simulateUntil(JumpSim.getReachedAABB(goalBlock), JumpSim.getCleanupPosition(goalCorner), JumpSim.buildFullController(JumpSim.getControllerStraightAim(goalCorner), JumpSim.getControllerStrafeAim(goalCorner), JumpSim.getControllerSmartMovement(goalCorner, sprint), (state, ticks) => {
            state.control.sneak = false;
            const playerBB = state.getBB();
            playerBB.expand(0, 1e-6, 0);
            if (jump && state.pos.xzDistanceTo(goalCorner) < 0.5 && !changed) {
                changed = true;
            }
            if (ticks > 0 && srcAABBs.every((src) => !src.intersects(playerBB)) && !jump) {
                state.control.jump = true;
                jump = true;
            }
            else {
                state.control.jump = false;
            }
        }), ctx, this.world, ticks);
    }
    static getReachedAABB(bbs) {
        if (bbs.length === 0)
            throw new Error('JumpSim: No AABBs for goal provided');
        const maxY = bbs.reduce((max, a) => Math.max(max, a.maxY), -Infinity);
        const lastXZVel = new vec3_1.Vec3(0, 0, 0);
        return (state) => {
            const bb = mineflayer_util_plugin_1.AABBUtils.getPlayerAABB({ position: state.pos, width: 0.5999, height: 1.8 });
            const xzVel = state.vel.offset(0, -state.vel.y, 0);
            const ret = state.pos.y >= maxY && bbs.some((a) => a.collides(bb)) && lastXZVel.norm() - xzVel.norm() < 0.04;
            return ret;
        };
    }
    static getCleanupPosition(...path) {
        return (state) => {
            state.control.reset();
        };
    }
    static getControllerStraightAim(nextPoint) {
        return (state, ticks) => {
            const dx = nextPoint.x - state.pos.x;
            const dz = nextPoint.z - state.pos.z;
            state.yaw = Math.atan2(-dx, -dz);
        };
    }
    static getControllerStrafeAim(nextPoint) {
        return (state, ticks) => (0, controls_1.strafeMovement)(state, nextPoint);
        return (state, ticks) => {
            const offset = state.pos.plus(state.onGround ? state.vel : state.vel.scaled(1));
            const dx = nextPoint.x - offset.x;
            const dz = nextPoint.z - offset.z;
            const wantedYaw = (0, controls_1.wrapRadians)(Math.atan2(-dx, -dz));
            const diff = (0, controls_1.wrapRadians)(wantedYaw - state.yaw);
            if (PI_OVER_TWELVE < diff && diff < ELEVEN_PI_OVER_TWELVE) {
                state.control.left = true;
                state.control.right = false;
            }
            else if (THIRTEEN_PI_OVER_TWELVE < diff && diff < TWENTY_THREE_PI_OVER_TWELVE) {
                state.control.left = false;
                state.control.right = true;
            }
            else {
                state.control.left = false;
                state.control.right = false;
            }
        };
    }
    static getControllerJumpSprint(jump, sprint, jumpAfter = 0) {
        return (state, ticks) => {
            state.control.jump = state.onGround && jump && ticks >= jumpAfter;
            state.control.sprint = sprint;
        };
    }
    static getControllerSmartMovement(goal, sprint) {
        return (state, ticks) => (0, controls_1.smartMovement)(state, goal, sprint);
        return (state, ticks) => {
            const offset = state.pos.plus(state.onGround ? state.vel : state.vel.scaled(1));
            const dx = goal.x - offset.x;
            const dz = goal.z - offset.z;
            const wantedYaw = (0, controls_1.wrapRadians)(Math.atan2(-dx, -dz));
            const diff = (0, controls_1.wrapRadians)(wantedYaw - state.yaw);
            if (SEVEN_PI_OVER_TWELVE < diff && diff < SEVENTEEN_PI_OVER_TWELVE) {
                state.control.forward = false;
                state.control.sprint = false;
                state.control.back = true;
            }
            else if (NINETEEN_PI_OVER_TWELVE < diff || diff < FIVE_PI_OVER_TWELVE) {
                state.control.forward = true;
                state.control.sprint = sprint;
                state.control.back = false;
            }
            else {
                state.control.forward = false;
                state.control.back = false;
                state.control.sprint = false;
            }
        };
    }
}
exports.JumpSim = JumpSim;
//# sourceMappingURL=jumpSim.js.map