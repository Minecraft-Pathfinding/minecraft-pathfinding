"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Int64Map_1 = require("./Int64Map");
const hashMap = new Int64Map_1.Int64Map();
function randInt32() {
    return Math.floor(Math.random() * 0xffffffff);
}
const size = 1024 * 1024 * 16;
const ints = new Array(size);
for (let i = 0; i < ints.length; i++) {
    ints[i] = [randInt32(), randInt32()];
}
const ts1 = performance.now();
for (let i = 0; i < size; i++) {
    const int = ints[i % ints.length];
    hashMap.set(int[0], int[1], i);
}
const ts2 = performance.now();
console.log(ts2 - ts1);
for (let i = 0; i < size; i++) {
    const int = ints[i % ints.length];
    const v1 = hashMap.get(int[0], int[1]);
    if (v1 !== i) {
        console.log('Hashmap failed', v1, i);
    }
}
const collsions = 0;
console.log(performance.now() - ts2);
console.log(`Total collisions: ${collsions}`);
console.log(hashMap.__size, hashMap.__length);
