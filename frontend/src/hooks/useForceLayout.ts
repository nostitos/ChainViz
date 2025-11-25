import { useEffect, useRef, useCallback } from 'react';
import { Node, Edge, useReactFlow } from '@xyflow/react';
import * as d3 from 'd3-force';

interface ForceLayoutOptions {
  enabled: boolean;
  strength?: number;
  collisionRadius?: number;
  maxTicks?: number;
}

/**
 * Optimized hook that applies D3 force simulation to React Flow nodes
 * - Prevents infinite render loops
 * - Fast convergence (stops after 100 ticks or low energy)
 * - Proper cleanup to prevent memory leaks
 * - Only updates on manual drag, not on every position change
 */
export function useForceLayout(
  nodes: Node[],
  edges: Edge[],
  options: ForceLayoutOptions = { enabled: true }
) {
  const { setNodes } = useReactFlow();
  const { enabled = true, collisionRadius = 60, maxTicks = 100 } = options;
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
  const tickCountRef = useRef(0);
  const isUpdatingRef = useRef(false);
  const nodeCountRef = useRef(0);

  // Main simulation effect - only depends on node COUNT, not node positions
  useEffect(() => {
    if (!enabled || nodes.length === 0) {
      // Clean up simulation when disabled
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
      return;
    }

    // Only restart simulation if node count changed significantly
    const nodeCountChanged = Math.abs(nodes.length - nodeCountRef.current) > 0;
    nodeCountRef.current = nodes.length;

    if (!nodeCountChanged && simulationRef.current) {
      // Node count unchanged - don't restart simulation
      return;
    }

    tickCountRef.current = 0;

    // Clean up old simulation
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // Create simulation nodes
    const simNodes = nodes.map(n => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      vx: 0,
      vy: 0,
    }));

    // Create optimized simulation
    const simulation = d3
      .forceSimulation(simNodes)
      // Repulsion force - push nodes apart
      .force('charge', d3.forceManyBody()
        .strength(options.strength ?? -100) // Weaker repulsion (was -300)
        .distanceMax(400)) // Limit range for performance
      // Collision force - prevent overlap
      .force('collision', d3.forceCollide()
        .radius(collisionRadius)
        .strength(1.0) // Increased from 0.7 for stronger bouncing
        .iterations(2)) // Increased from 1 for better collision
      .alphaDecay(0.02) // Increased from 0.005 (4x faster convergence)
      .velocityDecay(0.4); // Increased from 0.2 (more damping, faster stop)

    // Update positions on each tick
    // Use requestAnimationFrame for smoother updates
    let animationFrameId: number;

    simulation.on('tick', () => {
      tickCountRef.current++;

      // Stop simulation after max ticks or low energy
      if (tickCountRef.current >= maxTicks || simulation.alpha() < 0.01) {
        simulation.stop();
        return;
      }

      // Update React Flow nodes using requestAnimationFrame to decouple from tick rate
      animationFrameId = requestAnimationFrame(() => {
        if (isUpdatingRef.current) return;
        isUpdatingRef.current = true;

        setNodes((currentNodes) => {
          let hasChanges = false;
          const updated = currentNodes.map((node) => {
            // Skip dragged nodes (they are controlled by user)
            if (node.type === 'node' && node.dragging) return node;

            const simNode = simNodes.find((n: any) => n.id === node.id) as any;
            if (simNode) {
              // Only update if position changed significantly (>0.5px for smoother look)
              const dx = Math.abs(simNode.x - node.position.x);
              const dy = Math.abs(simNode.y - node.position.y);
              if (dx > 0.5 || dy > 0.5) {
                hasChanges = true;
                return {
                  ...node,
                  position: {
                    x: simNode.x,
                    y: simNode.y,
                  },
                };
              }
            }
            return node;
          });

          isUpdatingRef.current = false;
          return hasChanges ? updated : currentNodes;
        });
      });
    });

    simulationRef.current = simulation;

    // Cleanup on unmount
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current.on('tick', null); // Remove all event listeners
        simulationRef.current = null;
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [nodes.length, enabled, collisionRadius, maxTicks]); // setNodes is stable, don't include it

  // Manual reheat on drag - separate from main simulation
  const reheatSimulation = useCallback(() => {
    if (!simulationRef.current || !enabled) return;

    // Sync positions from React Flow to simulation
    const simNodes = simulationRef.current.nodes() as any[];
    nodes.forEach(node => {
      const simNode = simNodes.find(n => n.id === node.id);
      if (simNode) {
        simNode.x = node.position.x;
        simNode.y = node.position.y;
        simNode.vx = 0;
        simNode.vy = 0;
      }
    });

    // Restart with low energy (don't fully reheat)
    tickCountRef.current = 0;
    simulationRef.current.alpha(0.1).restart();
  }, [nodes, enabled]);

  // Expose reheat function for manual triggers (e.g., after drag)
  return { reheatSimulation };
}
