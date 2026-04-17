"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AStarNeighbor = exports.AStar = void 0;
const astar_1 = require("../abstract/algorithms/astar");
const node_1 = require("../abstract/node");
class AStar extends astar_1.AStarBackOff {
    constructor(start, movements, goal, timeout, tickTimeout = 40, searchRadius = -1, differential = 0) {
        super(start, movements, goal, timeout, tickTimeout, searchRadius, differential);
        this.mostRecentNode = this.bestNode;
        this.visitedChunks = new Set();
    }
    addToClosedDataSet(node) {
        this.closedDataSet.add(node.data.hash);
        this.visitedChunks.add(`${node.data.x >> 4},${node.data.z >> 4}`);
        this.mostRecentNode = node;
    }
    compute() {
        return Object.assign(Object.assign({}, super.compute()), { context: this });
    }
}
exports.AStar = AStar;
class AStarNeighbor extends AStar {
    makeResult(status, node) {
        return Object.assign(Object.assign({}, super.makeResult(status, node)), { context: this });
    }
    compute() {
        const computeStartTime = performance.now();
        if (!this.movementProvider.sanitize()) {
            throw new Error('Movement Provider was not properly configured!');
        }
        while (!this.openHeap.isEmpty()) {
            if ((++this.nodeConsiderCount & this.checkInterval) === 0) {
                const time = performance.now();
                if (time - computeStartTime > this.tickTimeout) {
                    return this.makeResult('partial', this.getActualBestNode());
                }
                if (this.timeout >= 0 && time - this.startTime > this.timeout) {
                    return this.makeResult('timeout', this.getActualBestNode());
                }
            }
            const node = this.openHeap.pop();
            if (this.goal.isEnd(node.data)) {
                return this.makeResult('success', node);
            }
            this.openDataMap.delete(node.data.hash);
            this.test(node, 1);
        }
        return this.makeResult('noPath', this.getActualBestNode());
    }
    test(node, maxDepth, depth = 0, seen = new Set()) {
        if (depth > maxDepth)
            return;
        if (this.closedDataSet.has(node.data.hash)) {
            return;
        }
        if (seen.has(node.data.hash)) {
            return;
        }
        const test = node;
        let bestLocal = test;
        this.addToClosedDataSet(node);
        const neighbors = this.movementProvider.getNeighbors(node.data, this.closedDataSet);
        for (const neighborData of neighbors) {
            if (this.closedDataSet.has(neighborData.hash)) {
                continue;
            }
            const gFromThisNode = node.g + neighborData.cost;
            const pastNeighbor = this.openDataMap.get(neighborData.hash);
            const heuristic = this.heuristic(neighborData);
            if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost)
                continue;
            if (pastNeighbor === undefined) {
                const neighbor = new node_1.CPathNode(gFromThisNode, heuristic, neighborData, node);
                this.assignBestNodes(neighbor);
                if (neighbor.h < test.h) {
                    bestLocal = neighbor;
                }
                this.openDataMap.set(neighborData.hash, neighbor);
                this.openHeap.push(neighbor);
            }
            else if (gFromThisNode - pastNeighbor.g < this.differential) {
                pastNeighbor.update(gFromThisNode, heuristic, neighborData, node);
                this.assignBestNodes(pastNeighbor);
                this.openHeap.update(pastNeighbor);
                if (pastNeighbor.h < test.h) {
                    bestLocal = pastNeighbor;
                }
            }
        }
        if (bestLocal !== test) {
            this.test(bestLocal, maxDepth, depth + 1, seen);
        }
    }
}
exports.AStarNeighbor = AStarNeighbor;
//# sourceMappingURL=algs.js.map