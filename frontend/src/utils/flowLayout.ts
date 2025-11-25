import { Node, Edge } from '@xyflow/react';

interface FlowLayoutConfig {
    horizontalSpacing: number;
    verticalSpacing: number;
}

/**
 * Build a semantic Flow Layout for Bitcoin transactions.
 * - Inputs -> Left
 * - Transaction -> Center
 * - Outputs -> Right
 * - Change Addresses (Input & Output) -> Underneath Transaction
 * - Minimizes edge crossings using barycenter heuristic
 */
export function buildFlowLayout(
    nodes: Node[],
    edges: Edge[],
    rootNodeId: string,
    config: FlowLayoutConfig = {
        horizontalSpacing: 450,
        verticalSpacing: 60,
    }
): Node[] {
    console.log(`🌊 Building Flow Layout from root: ${rootNodeId} `);

    const positions = new Map<string, { x: number; y: number }>();
    const processed = new Set<string>();
    const queue: { id: string; rank: number }[] = [{ id: rootNodeId, rank: 0 }];

    // 1. BFS to assign ranks (X positions)
    const nodeRanks = new Map<string, number>();
    nodeRanks.set(rootNodeId, 0);

    while (queue.length > 0) {
        const { id, rank } = queue.shift()!;

        if (processed.has(id)) continue;
        processed.add(id);

        // Process outgoing edges (Outputs -> Right)
        edges
            .filter(e => e.source === id)
            .forEach(e => {
                if (!nodeRanks.has(e.target)) {
                    nodeRanks.set(e.target, rank + 1);
                    queue.push({ id: e.target, rank: rank + 1 });
                }
            });

        // Process incoming edges (Inputs -> Left)
        edges
            .filter(e => e.target === id)
            .forEach(e => {
                if (!nodeRanks.has(e.source)) {
                    nodeRanks.set(e.source, rank - 1);
                    queue.push({ id: e.source, rank: rank - 1 });
                }
            });
    }

    // 2. Handle "Underneath" positioning for Change Addresses
    const specialNodes = new Set<string>();
    nodes.forEach(node => {
        if (node.type === 'address') {
            const incoming = edges.filter(e => e.target === node.id).map(e => e.source);
            const outgoing = edges.filter(e => e.source === node.id).map(e => e.target);
            const selfLoopTxs = incoming.filter(txId => outgoing.includes(txId));

            if (selfLoopTxs.length > 0) {
                specialNodes.add(node.id);
            }
        }
    });

    // 3. Group nodes by rank
    const nodesByRank = new Map<number, string[]>();
    nodeRanks.forEach((rank, nodeId) => {
        if (specialNodes.has(nodeId)) return;
        if (!nodesByRank.has(rank)) nodesByRank.set(rank, []);
        nodesByRank.get(rank)!.push(nodeId);
    });

    // 4. Sort ranks to minimize crossings (Barycenter Method)
    const sortedRanks = Array.from(nodesByRank.keys()).sort((a, b) => a - b);

    // 4. Sort Ranks to Minimize Crossings (Center-Out Barycenter Method)
    // We start from Rank 0 (Center) and propagate outwards.

    // Sort Negative Ranks (Right to Left: 0 -> -1 -> -2 ...)
    // We sort Rank i based on Rank i+1 (its "right" neighbor, closer to center)
    const negativeRanks = sortedRanks.filter(r => r < 0).sort((a, b) => b - a); // -1, -2, -3...

    negativeRanks.forEach(rank => {
        const centerRank = rank + 1; // The rank closer to center
        const currentNodes = nodesByRank.get(rank)!;
        const centerNodes = nodesByRank.get(centerRank);

        if (!centerNodes) return;

        const nodeBarycenters = currentNodes.map(nodeId => {
            // Find neighbors in the center-ward rank
            const neighbors = edges
                .filter(e => (e.target === nodeId && nodeRanks.get(e.source) === centerRank) ||
                    (e.source === nodeId && nodeRanks.get(e.target) === centerRank))
                .map(e => e.target === nodeId ? e.source : e.target);

            if (neighbors.length === 0) return 0;

            const sum = neighbors.reduce((acc, neighborId) => {
                const index = centerNodes.indexOf(neighborId);
                return acc + (index >= 0 ? index : 0);
            }, 0);

            return sum / neighbors.length;
        });

        const combined = currentNodes.map((id, idx) => ({ id, val: nodeBarycenters[idx] }));
        combined.sort((a, b) => a.val - b.val);
        nodesByRank.set(rank, combined.map(c => c.id));
    });

    // Sort Positive Ranks (Left to Right: 0 -> 1 -> 2 ...)
    // We sort Rank i based on Rank i-1 (its "left" neighbor, closer to center)
    const positiveRanks = sortedRanks.filter(r => r > 0).sort((a, b) => a - b); // 1, 2, 3...

    positiveRanks.forEach(rank => {
        const centerRank = rank - 1; // The rank closer to center
        const currentNodes = nodesByRank.get(rank)!;
        const centerNodes = nodesByRank.get(centerRank);

        if (!centerNodes) return;

        const nodeBarycenters = currentNodes.map(nodeId => {
            // Find neighbors in the center-ward rank
            const neighbors = edges
                .filter(e => (e.target === nodeId && nodeRanks.get(e.source) === centerRank) ||
                    (e.source === nodeId && nodeRanks.get(e.target) === centerRank))
                .map(e => e.target === nodeId ? e.source : e.target);

            if (neighbors.length === 0) return 0;

            const sum = neighbors.reduce((acc, neighborId) => {
                const index = centerNodes.indexOf(neighborId);
                return acc + (index >= 0 ? index : 0);
            }, 0);

            return sum / neighbors.length;
        });

        const combined = currentNodes.map((id, idx) => ({ id, val: nodeBarycenters[idx] }));
        combined.sort((a, b) => a.val - b.val);
        nodesByRank.set(rank, combined.map(c => c.id));
    });

    // 5. Assign Final Positions

    // Center the layout vertically for each rank

    sortedRanks.forEach(rank => {
        const rankNodes = nodesByRank.get(rank)!;

        // Determine which rank to look at for grouping
        // Only apply grouping to outer ranks (not -1, 0, or +1)
        // If Rank <= -2 (Far left side), group based on Next Rank (towards center)
        // If Rank >= +2 (Far right side), group based on Previous Rank (towards center)
        let targetRank: number | undefined;

        if (rank <= -2) {
            targetRank = sortedRanks[sortedRanks.indexOf(rank) + 1];
        } else if (rank >= 2) {
            targetRank = sortedRanks[sortedRanks.indexOf(rank) - 1];
        }

        // Group nodes by their parent (source of incoming edge)
        const nodeGroups: { parent: string | null; nodes: string[] }[] = [];

        rankNodes.forEach(nodeId => {
            let groupKey: string | null = null;

            if (targetRank !== undefined) {
                const edge = edges.find(e =>
                    (e.target === nodeId && nodeRanks.get(e.source) === targetRank) ||
                    (e.source === nodeId && nodeRanks.get(e.target) === targetRank)
                );

                if (edge) {
                    groupKey = edge.target === nodeId ? edge.source : edge.target;
                }
            }

            // Find existing group or create new one
            const existingGroup = nodeGroups.find(g => g.parent === groupKey);
            if (existingGroup) {
                existingGroup.nodes.push(nodeId);
            } else {
                nodeGroups.push({ parent: groupKey, nodes: [nodeId] });
            }
        });

        console.log(`[Rank ${rank}] Created ${nodeGroups.length} groups.`);
        if (rank === -2) {
            console.log(`[Rank -2 DETAILS] Groups:`, nodeGroups.map(g => ({ key: g.parent, count: g.nodes.length })));
        }

        // Sort groups based on parent's position in the target rank
        if (targetRank !== undefined) {
            const targetNodes = nodesByRank.get(targetRank) || [];
            nodeGroups.sort((a, b) => {
                const indexA = a.parent ? targetNodes.indexOf(a.parent) : -1;
                const indexB = b.parent ? targetNodes.indexOf(b.parent) : -1;

                // If both have parents, sort by parent index
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;

                // If one has parent and other doesn't, put parented first? 
                // Or keep original order? Let's put orphans at the end.
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;

                return 0;
            });
        }

        // Calculate total height including group spacing
        const withinGroupSpacing = 50; // Tighter spacing within groups (60 - 10)
        const groupSpacing = 20; // Extra gap between groups
        const totalNodesHeight = (rankNodes.length - 1) * withinGroupSpacing;
        const totalGroupSpacing = (nodeGroups.length - 1) * groupSpacing;
        const totalHeight = totalNodesHeight + totalGroupSpacing;
        const startY = -totalHeight / 2;

        // Assign positions with group spacing
        let currentY = startY;
        nodeGroups.forEach((group, groupIdx) => {
            group.nodes.forEach((nodeId) => {
                positions.set(nodeId, {
                    x: rank * config.horizontalSpacing,
                    y: currentY
                });
                currentY += withinGroupSpacing;
            });

            // Add extra spacing between groups (except after last group)
            if (groupIdx < nodeGroups.length - 1) {
                currentY += groupSpacing;
            }
        });
    });

    // Assign special "underneath" positions
    specialNodes.forEach(nodeId => {
        const incoming = edges.filter(e => e.target === nodeId).map(e => e.source);
        const outgoing = edges.filter(e => e.source === nodeId).map(e => e.target);
        const selfLoopTxs = incoming.filter(txId => outgoing.includes(txId));

        if (selfLoopTxs.length > 0) {
            const anchorTxId = selfLoopTxs[0];
            const anchorPos = positions.get(anchorTxId);

            if (anchorPos) {
                positions.set(nodeId, {
                    x: anchorPos.x,
                    y: anchorPos.y + config.verticalSpacing // Directly below
                });
            }
        }
    });

    // 6. Center the layout
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach(pos => {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return nodes.map(node => {
        const pos = positions.get(node.id);
        if (!pos) return node;

        return {
            ...node,
            position: {
                x: pos.x - centerX,
                y: pos.y - centerY
            }
        };
    });
}
