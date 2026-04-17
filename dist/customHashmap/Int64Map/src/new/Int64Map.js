"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Int64Map = void 0;
const DEFAULT_SIZE = 1024;
const LOAD_FACTOR = 0.5;
class Int64Map {
    constructor(initialSize = DEFAULT_SIZE) {
        this.INTIAL_SIZE = DEFAULT_SIZE;
        this.size = 0;
        this.length = 0;
        this.values = new Array(initialSize);
        this.INTIAL_SIZE = initialSize;
        this.size = initialSize;
    }
    get __size() {
        return this.size;
    }
    get __length() {
        return this.length;
    }
    get(intLow, intHigh) {
        const index = intLow & (this.size - 1);
        let node = this.values[index];
        while (node != null) {
            if (node.intHigh === intHigh) {
                return node.value;
            }
            node = node.next;
        }
        return undefined;
    }
    set(intLow, intHigh, value) {
        if (this.length > this.size * LOAD_FACTOR) {
            this.grow();
        }
        const index = intLow & (this.size - 1);
        let node = this.values[index];
        while (node != null) {
            if (node.intHigh === intHigh) {
                node.value = value;
                return false;
            }
            node = node.next;
        }
        node = {
            intLow,
            intHigh,
            value,
            next: this.values[index]
        };
        this.values[index] = node;
        this.length++;
        return true;
    }
    delete(intLow, intHigh) {
        if (this.size > this.INTIAL_SIZE && this.size >= this.length * 4) {
            this.shrink();
        }
        const index = intLow & (this.size - 1);
        let node = this.values[index];
        if (node != null) {
            if (node.intHigh === intHigh) {
                this.values[index] = node.next;
                this.length--;
                return true;
            }
            let prev = node;
            node = node.next;
            while (node != null) {
                if (node.intHigh === intHigh) {
                    prev.next = node.next;
                    this.length--;
                    return true;
                }
                prev = node;
                node = node.next;
            }
        }
        return false;
    }
    grow() {
        const oldSize = this.size;
        const newSize = oldSize * 2;
        this.size = newSize;
        this.values.length = newSize;
        for (let i = 0; i < oldSize; i++) {
            let node = this.values[i];
            this.values[i] = undefined;
            while (node != null) {
                const { next } = node;
                const newIndex = node.intLow & (newSize - 1);
                if (newIndex === i) {
                    node.next = this.values[i];
                    this.values[i] = node;
                }
                else {
                    node.next = this.values[newIndex];
                    this.values[newIndex] = node;
                }
                node = next;
            }
        }
    }
    shrink() {
        const oldSize = this.size;
        const newSize = oldSize / 2;
        for (let i = oldSize; i >= newSize; i--) {
            let node = this.values[i];
            while (node != null) {
                const next = node.next;
                const newIndex = node.intLow % newSize;
                node.next = this.values[newIndex];
                this.values[newIndex] = node;
                node = next;
            }
            delete this.values[i];
        }
        this.values.length = newSize;
        this.size = newSize;
    }
}
exports.Int64Map = Int64Map;
//# sourceMappingURL=Int64Map.js.map