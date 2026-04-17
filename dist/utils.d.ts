import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { BlockFace } from '@nxg-org/mineflayer-util-plugin';
export declare function printBotControls(bot: Bot): void;
export declare function faceToVec(face: BlockFace): Vec3;
export declare function interpolateStepPoints(start: Vec3, end: Vec3, step?: number): Generator<Vec3>;
export declare const debug: (bot: Bot | undefined, ...args: any[]) => void;
export declare const getScaffoldCount: (bot: Bot) => number;
export declare function closestPointOnLineSegment(point: Vec3, segmentStart: Vec3, segmentEnd: Vec3): Vec3;
export declare function getNormalizedPos(bot: Bot, startPos?: Vec3): Vec3;
export declare function onceWithCleanup<T>(emitter: NodeJS.EventEmitter, event: string, options?: {
    timeout?: number;
    checkCondition?: (data?: T) => boolean;
}): Promise<T>;
export declare class Task<Res, Rej> {
    done: boolean;
    canceled: boolean;
    promise: Promise<Res>;
    cancel: (err: Rej) => void;
    finish: (result: Res) => void;
    constructor();
    static doneTask<Rej>(): Task<void, Rej>;
}
export declare function getViewDir(info: {
    yaw: number;
    pitch: number;
}): Vec3;
export declare function dirToYawPitch(dir: Vec3): {
    yaw: number;
    pitch: number;
};
export declare function posToYawPitchFromEye(botPos: Vec3, eyeHeight: number, targetPos: Vec3): {
    yaw: number;
    pitch: number;
};
