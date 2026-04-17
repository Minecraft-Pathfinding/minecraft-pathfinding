type primitive = boolean | number | string | bigint | symbol | object | null;
declare class Int64Map {
    constructor(initialSize?: number);
    private readonly values;
    private readonly INTIAL_SIZE;
    private size;
    get __size(): number;
    private length;
    get __length(): number;
    get(intLow: number, intHigh: number): primitive | undefined;
    set(intLow: number, intHigh: number, value: primitive): boolean;
    delete(intLow: number, intHigh: number): boolean;
    private grow;
    private shrink;
}
export { Int64Map };
