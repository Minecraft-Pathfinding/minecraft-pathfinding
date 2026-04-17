"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CPathNode = exports.PathNode = void 0;
class PathNode {
    constructor() {
        this.data = null;
        this.parent = null;
        this.g = 0;
        this.h = 0;
    }
    get f() {
        return this.g + this.h;
    }
    update(g, h, data = null, parent = null) {
        this.g = g;
        this.h = h;
        this.data = data;
        this.parent = parent;
        return this;
    }
}
exports.PathNode = PathNode;
class CPathNode {
    constructor(g, h, data = null, parent = null) {
        this.g = g;
        this.h = h;
        this.f = g + h;
        this.data = data;
        this.parent = parent;
    }
    update(g, h, data, parent) {
        this.g = g;
        this.h = h;
        this.f = g + h;
        this.data = data;
        this.parent = parent;
        return this;
    }
}
exports.CPathNode = CPathNode;
//# sourceMappingURL=node.js.map