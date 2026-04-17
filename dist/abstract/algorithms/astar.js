"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AStarBackOff = exports.AStar = void 0;
const _1 = require(".");
const heap_1 = require("../heap");
const node_1 = require("../node");
class AStar {
    constructor(start, movements, goal, timeout, tickTimeout = 40, searchRadius = -1, differential = 0) {
        this.checkInterval = 0;
        this.nodeConsiderCount = 0;
        this.lastAmt = 0;
        this.startTime = performance.now();
        this.movementProvider = movements;
        this.goal = goal;
        this.timeout = timeout;
        this.tickTimeout = tickTimeout;
        this.differential = differential;
        this.closedDataSet = new Set();
        this.openHeap = new heap_1.BinaryHeapOpenSet();
        this.openDataMap = new Map();
        const startNode = new node_1.PathNode().update(0, goal.heuristic(start), start);
        if (startNode.data == null)
            throw new Error('Start node data is null!');
        this.openHeap.push(startNode);
        this.openDataMap.set(startNode.data.hash, startNode);
        this.bestNode = startNode;
        this.maxCost = searchRadius < 0 ? -1 : startNode.h + searchRadius;
    }
    addToClosedDataSet(node) {
        this.closedDataSet.add(node.data.hash);
    }
    heuristic(node) {
        return this.goal.heuristic(node);
    }
    makeResult(status, node) {
        this.lastAmt = this.closedDataSet.size;
        return {
            status,
            cost: node.g,
            calcTime: performance.now() - this.startTime,
            visitedNodes: this.closedDataSet.size,
            generatedNodes: this.closedDataSet.size + this.openHeap.size(),
            movementProvider: this.movementProvider,
            path: (0, _1.reconstructPath)(node),
            context: this
        };
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
                    return this.makeResult('partial', this.bestNode);
                }
                if (this.timeout >= 0 && time - this.startTime > this.timeout) {
                    return this.makeResult('timeout', this.bestNode);
                }
            }
            const node = this.openHeap.pop();
            if (this.goal.isEnd(node.data)) {
                return this.makeResult('success', node);
            }
            this.openDataMap.delete(node.data.hash);
            const neighbors = this.movementProvider.getNeighbors(node.data, this.closedDataSet);
            for (const neighborData of neighbors) {
                if (this.closedDataSet.has(neighborData.hash)) {
                    continue;
                }
                const gFromThisNode = node.g + neighborData.cost;
                const pastNeighborNode = this.openDataMap.get(neighborData.hash);
                const heuristic = this.heuristic(neighborData);
                if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost)
                    continue;
                if (pastNeighborNode === undefined) {
                    const neighbor = new node_1.CPathNode(gFromThisNode, heuristic, neighborData, node);
                    if (neighbor.h < this.bestNode.h)
                        this.bestNode = neighbor;
                    this.openDataMap.set(neighborData.hash, neighbor);
                    this.openHeap.push(neighbor);
                }
                else if (gFromThisNode - pastNeighborNode.g < this.differential) {
                    pastNeighborNode.update(gFromThisNode, heuristic, neighborData, node);
                    this.openHeap.update(pastNeighborNode);
                    if (pastNeighborNode.h < this.bestNode.h)
                        this.bestNode = pastNeighborNode;
                }
                this.addToClosedDataSet(node);
            }
        }
        return this.makeResult('noPath', this.bestNode);
    }
}
exports.AStar = AStar;
class AStarBackOff extends AStar {
    constructor() {
        super(...arguments);
        this.bestNode0 = this.bestNode;
        this.bestNode1 = this.bestNode;
        this.bestNode2 = this.bestNode;
        this.bestNode3 = this.bestNode;
        this.bestNode4 = this.bestNode;
        this.bestNode5 = this.bestNode;
        this.bestNode6 = this.bestNode;
        this.bn0 = this.bestNode.h;
        this.bn1 = this.bestNode.h;
        this.bn2 = this.bestNode.h;
        this.bn3 = this.bestNode.h;
        this.bn4 = this.bestNode.h;
        this.bn5 = this.bestNode.h;
        this.bn6 = this.bestNode.h;
        this.x0 = 1 / 1.5;
        this.x1 = 1 / 2;
        this.x2 = 1 / 2.5;
        this.x3 = 1 / 3;
        this.x4 = 1 / 4;
        this.x5 = 1 / 5;
        this.x6 = 1 / 10;
        this.checkInterval = 0;
        this.nodeConsiderCount = 0;
        this.moveConsiderCount = 0;
    }
    assignBestNodes(check) {
        if (check.h < this.bestNode.h) {
            this.bestNode = check;
        }
        if (check.h + check.g * this.x0 < this.bn0) {
            this.bestNode0 = check;
            this.bn0 = check.h + check.g * this.x0 - this.differential;
        }
        if (check.h + check.g * this.x1 < this.bn1) {
            this.bestNode1 = check;
            this.bn1 = check.h + check.g * this.x1 - this.differential;
        }
        if (check.h + check.g * this.x2 < this.bn2) {
            this.bestNode2 = check;
            this.bn2 = check.h + check.g * this.x2 - this.differential;
        }
        if (check.h + check.g * this.x3 < this.bn3) {
            this.bestNode3 = check;
            this.bn3 = check.h + check.g * this.x3 - this.differential;
        }
        if (check.h + check.g * this.x4 < this.bn4) {
            this.bestNode4 = check;
            this.bn4 = check.h + check.g * this.x4 - this.differential;
        }
        if (check.h + check.g * this.x5 < this.bn5) {
            this.bestNode5 = check;
            this.bn5 = check.h + check.g * this.x5 - this.differential;
        }
        if (check.h + check.g * this.x6 < this.bn6) {
            this.bestNode6 = check;
            this.bn6 = check.h + check.g * this.x6 - this.differential;
        }
    }
    getActualBestNode() {
        if (this.bestNode6.h > 5)
            return this.bestNode6;
        if (this.bestNode5.h > 5)
            return this.bestNode5;
        if (this.bestNode4.h > 5)
            return this.bestNode4;
        if (this.bestNode3.h > 5)
            return this.bestNode3;
        if (this.bestNode2.h > 5)
            return this.bestNode2;
        if (this.bestNode1.h > 5)
            return this.bestNode1;
        if (this.bestNode0.h > 5)
            return this.bestNode0;
        return this.bestNode;
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
            const neighbors = this.movementProvider.getNeighbors(node.data, this.closedDataSet);
            for (const neighborData of neighbors) {
                this.moveConsiderCount++;
                if (this.closedDataSet.has(neighborData.hash)) {
                    continue;
                }
                const gFromThisNode = node.g + neighborData.cost;
                const pastNeighborNode = this.openDataMap.get(neighborData.hash);
                const heuristic = this.heuristic(neighborData);
                if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost)
                    continue;
                if (pastNeighborNode === undefined) {
                    const neighbor = new node_1.CPathNode(gFromThisNode, heuristic, neighborData, node);
                    this.openDataMap.set(neighborData.hash, neighbor);
                    this.openHeap.push(neighbor);
                    this.assignBestNodes(neighbor);
                }
                else if (gFromThisNode - pastNeighborNode.g < this.differential) {
                    pastNeighborNode.update(gFromThisNode, heuristic, neighborData, node);
                    this.openHeap.update(pastNeighborNode);
                    this.assignBestNodes(pastNeighborNode);
                }
                this.addToClosedDataSet(node);
            }
        }
        return this.makeResult('noPath', this.getActualBestNode());
    }
}
exports.AStarBackOff = AStarBackOff;
//# sourceMappingURL=astar.js.map