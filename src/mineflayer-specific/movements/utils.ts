import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

type PlaceType = "liquid" | "solid" | "replaceable"

interface PlaceHandlerOpts {
    returnToStart?: boolean,
    returnToPos?: Vec3,

} 
export class PlaceHandler {


    constructor(
        public readonly x: number,
        public readonly y: number,
        public readonly z: number,
        public readonly type: PlaceType,
        
    ) {

    }



    perform(bot: Bot, opts: PlaceHandlerOpts= {}) {
        switch (this.type) {
            case "liquid": {


                break; // not necessary.
            }

            case "solid": 
            case "replaceable": 
            default: {


                break; // not necessary.
            }


        }


    }
}