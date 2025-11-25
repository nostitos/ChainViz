import { useState, useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';

interface GraphState {
    nodes: Node[];
    edges: Edge[];
    expandedNodes: Set<string>;
}

export function useGraphHistory(limit: number = 50) {
    const [history, setHistory] = useState<GraphState[]>([]);
    const [future, setFuture] = useState<GraphState[]>([]);

    const takeSnapshot = useCallback((nodes: Node[], edges: Edge[], expandedNodes: Set<string>) => {
        setHistory(prev => {
            const newHistory = [...prev, {
                nodes: [...nodes],
                edges: [...edges],
                expandedNodes: new Set(expandedNodes)
            }];
            if (newHistory.length > limit) {
                return newHistory.slice(newHistory.length - limit);
            }
            return newHistory;
        });
        setFuture([]);
    }, [limit]);

    const undo = useCallback((
        currentNodes: Node[],
        currentEdges: Edge[],
        currentExpandedNodes: Set<string>,
        setNodes: (nodes: Node[]) => void,
        setEdges: (edges: Edge[]) => void,
        setExpandedNodes: (expandedNodes: Set<string>) => void
    ) => {
        setHistory(prev => {
            if (prev.length === 0) return prev;

            const previous = prev[prev.length - 1];
            const newHistory = prev.slice(0, prev.length - 1);

            // Push current state to future
            setFuture(f => [{
                nodes: currentNodes,
                edges: currentEdges,
                expandedNodes: new Set(currentExpandedNodes)
            }, ...f]);

            // Restore previous state
            setNodes(previous.nodes);
            setEdges(previous.edges);
            setExpandedNodes(previous.expandedNodes);

            return newHistory;
        });
    }, []);

    const redo = useCallback((
        currentNodes: Node[],
        currentEdges: Edge[],
        currentExpandedNodes: Set<string>,
        setNodes: (nodes: Node[]) => void,
        setEdges: (edges: Edge[]) => void,
        setExpandedNodes: (expandedNodes: Set<string>) => void
    ) => {
        setFuture(prev => {
            if (prev.length === 0) return prev;

            const next = prev[0];
            const newFuture = prev.slice(1);

            // Push current state to history
            setHistory(h => [...h, {
                nodes: currentNodes,
                edges: currentEdges,
                expandedNodes: new Set(currentExpandedNodes)
            }]);

            // Restore next state
            setNodes(next.nodes);
            setEdges(next.edges);
            setExpandedNodes(next.expandedNodes);

            return newFuture;
        });
    }, []);

    return {
        takeSnapshot,
        undo,
        redo,
        canUndo: history.length > 0,
        canRedo: future.length > 0,
        historyDepth: history.length
    };
}
