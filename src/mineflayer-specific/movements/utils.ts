type PlaceType = "liquid" | "solid" | "replaceable"


export class PlaceHandler {


    constructor(
        public readonly x: number,
        public readonly y: number,
        public readonly z: number,
        public readonly type: PlaceType,
        
    ) {
        
    }

}