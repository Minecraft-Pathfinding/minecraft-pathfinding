export class CostBalancer {

    public breakCost: number;
    public placeCost: number;
    public jumpCost: number;

    constructor(breakCost: number, placeCost: number, jumpCost: number) {
        this.breakCost = breakCost;
        this.placeCost = placeCost;
        this.jumpCost = jumpCost;
    }
}