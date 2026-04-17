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
exports.ForwardJumpMovement = void 0;
const vec3_1 = require("vec3");
const movements_1 = require("../movements");
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const move_1 = require("../move");
const settings_1 = require("@nxg-org/mineflayer-physics-util/dist/physics/settings");
function setState(simCtx, pos, vel) {
    simCtx.state.age = 0;
    simCtx.state.pos.set(pos.x, pos.y, pos.z);
    simCtx.state.vel.set(vel.x, vel.y, vel.z);
}
class ForwardJumpMovement extends movements_1.SimMovement {
    constructor() {
        super(...arguments);
        this.performPerTick = (move, tickCount, currentIndex, path) => {
            return true;
        };
        this.performInit = (move, currentIndex, path) => __awaiter(this, void 0, void 0, function* () {
            yield this.bot.lookAt(new vec3_1.Vec3(move.exitPos.x, move.exitPos.y, move.exitPos.z), true);
            const dx = move.exitPos.x - this.bot.entity.position.x;
            const dz = move.exitPos.z - this.bot.entity.position.z;
            const wantedYaw = Math.atan2(-dx, -dz);
            this.bot.entity.yaw = wantedYaw;
        });
    }
    controlAim(nextPoint) {
        let aimed = false;
        return (state, ticks) => {
            if (!aimed) {
                const dx = nextPoint.x - state.pos.x;
                const dz = nextPoint.z - state.pos.z;
                state.yaw = Math.atan2(-dx, -dz);
                aimed = true;
            }
            if (state.isCollidedHorizontally) {
                state.control.set('jump', true);
                state.control.set('forward', false);
                state.control.set('sprint', false);
            }
            else {
                if (state.vel.offset(0, -state.vel.y, 0).norm() > 0.15)
                    state.control.set('jump', true);
                state.control.set('forward', true);
                state.control.set('sprint', true);
            }
        };
    }
    botAim(bot, nextMove, goal) {
        let aimed = false;
        return () => {
            if (!aimed) {
                const dx = nextMove.x - bot.entity.position.x;
                const dz = nextMove.z - bot.entity.position.z;
                bot.entity.yaw = Math.atan2(-dx, -dz);
                aimed = true;
            }
            if (bot.entity.isCollidedHorizontally) {
                bot.setControlState('jump', true);
                bot.setControlState('forward', false);
                bot.setControlState('back', true);
                bot.setControlState('sprint', false);
            }
            else {
                if (bot.entity.velocity.offset(0, -bot.entity.velocity.y, 0).norm() > 0.15)
                    bot.setControlState('jump', true);
                bot.setControlState('back', false);
                bot.setControlState('forward', true);
                bot.setControlState('sprint', true);
            }
        };
    }
    getReached(goal, nextPos, start) {
        const vecGoal = goal.toVec();
        return (state, age) => {
            if (!state.isCollidedVertically)
                return false;
            return vecGoal.minus(state.pos).norm() <= vecGoal.minus(nextPos).norm();
        };
    }
    botReach(bot, move, goal) {
        const vecGoal = goal.toVec();
        return () => {
            if (!bot.entity.onGround)
                return false;
            return vecGoal.minus(bot.entity.position).norm() <= vecGoal.minus(move.exitPos).norm();
        };
    }
    provideMovements(start, storage, goal) {
        for (const dir of movements_1.SimMovement.jumpDirs) {
            setState(this.stateCtx, start.exitPos, settings_1.emptyVec);
            this.stateCtx.state.clearControlStates();
            const nextGoal = new vec3_1.Vec3(start.x + dir.x, start.y + dir.y, start.z + dir.z);
            const stopOnVertCollision = (state, ticks) => {
                return state.control.get('jump') && state.isCollidedVertically;
            };
            const reach = this.getReached(goal, start.exitPos, start);
            const state = this.simulateUntil(mineflayer_physics_util_1.BaseSimulator.buildAnyGoal(stopOnVertCollision), () => { }, this.controlAim(nextGoal), this.stateCtx, this.bot.world, 30);
            const diff = state.pos.minus(start.exitPos).norm();
            if (diff === 0)
                return;
            const cost = Math.round(state.age * 1);
            const good = reach(state, state.age);
            if (good) {
                storage.push(move_1.Move.fromPreviousState(cost, state, start, this));
            }
        }
    }
    align(thisMove, tickCount, goal) {
        return this.bot.entity.onGround;
    }
}
exports.ForwardJumpMovement = ForwardJumpMovement;
//# sourceMappingURL=pp.js.map