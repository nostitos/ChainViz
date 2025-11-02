import { useEffect, useRef } from 'react';
import { Node, Edge, useReactFlow } from '@xyflow/react';

interface EdgeTensionOptions {
  enabled: boolean;
  strength: number; // How strong the tension force is (0-1)
  minLength: number; // Minimum edge length in pixels
  maxLength: number; // Maximum edge length before tension kicks in
}

/**
 * Hook that applies edge tension forces to pull nodes closer together
 * when edges are long. Runs every 200ms when enabled.
 */
export function useEdgeTension(
  nodes: Node[],
  edges: Edge[],
  options: EdgeTensionOptions
) {
  const { setNodes } = useReactFlow();
  const intervalRef = useRef<NodeJS.Timeout>();
  const optionsRef = useRef(options);
  const edgesRef = useRef(edges);
  const isRunningRef = useRef(false);

  // Update refs when they change
  useEffect(() => {
    optionsRef.current = options;
    edgesRef.current = edges;
  }, [options, edges]);

  // Apply tension forces periodically
  useEffect(() => {
    if (!options.enabled || nodes.length === 0 || edges.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
      return;
    }

    const applyTension = () => {
      // Prevent concurrent runs
      if (isRunningRef.current) return;
      isRunningRef.current = true;

      const { strength, maxLength } = optionsRef.current;
      const currentEdges = edgesRef.current;

      setNodes((currentNodes) => {
        const forces = new Map<string, { x: number; y: number }>();
        let hasForces = false;
        
        currentEdges.forEach((edge) => {
          const sourceNode = currentNodes.find(n => n.id === edge.source);
          const targetNode = currentNodes.find(n => n.id === edge.target);
          
          if (!sourceNode || !targetNode) return;

          const dx = targetNode.position.x - sourceNode.position.x;
          const dy = targetNode.position.y - sourceNode.position.y;
          const length = Math.sqrt(dx * dx + dy * dy);

          if (length > maxLength) {
            hasForces = true;
            const excessLength = length - maxLength;
            const tensionForce = excessLength * strength * 0.1;
            
            const nx = dx / length;
            const ny = dy / length;
            
            const sourceForce = forces.get(sourceNode.id) || { x: 0, y: 0 };
            sourceForce.x += nx * tensionForce;
            sourceForce.y += ny * tensionForce;
            forces.set(sourceNode.id, sourceForce);
            
            const targetForce = forces.get(targetNode.id) || { x: 0, y: 0 };
            targetForce.x -= nx * tensionForce;
            targetForce.y -= ny * tensionForce;
            forces.set(targetNode.id, targetForce);
          }
        });

        isRunningRef.current = false;

        // Only update if there are forces to apply
        if (!hasForces) return currentNodes;

        return currentNodes.map((node) => {
          const force = forces.get(node.id);
          if (!force) return node;

          return {
            ...node,
            position: {
              x: node.position.x + force.x,
              y: node.position.y + force.y,
            },
          };
        });
      });
    };

    // Apply tension every 500ms (reduced frequency to save memory)
    intervalRef.current = setInterval(applyTension, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [options.enabled, nodes.length, edges.length, setNodes]); // Removed edges from dependencies to prevent constant restarts
}

