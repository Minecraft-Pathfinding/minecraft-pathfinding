"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconstructPath = reconstructPath;
function reconstructPath(node) {
    const path = [];
    while (node.parent != null) {
        if (node.data == null)
            throw new Error('Node data is null!');
        path.push(node.data);
        node = node.parent;
    }
    return path.reverse();
}
//# sourceMappingURL=index.js.map