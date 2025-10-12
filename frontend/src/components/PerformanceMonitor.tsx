import { useEffect, useState, useRef } from 'react';

interface PerformanceMetrics {
  fps: number;
  memoryMB: number;
  nodeCount: number;
  edgeCount: number;
}

export function PerformanceMonitor({ nodeCount, edgeCount }: { nodeCount: number; edgeCount: number }) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    memoryMB: 0,
    nodeCount,
    edgeCount,
  });
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  useEffect(() => {
    let animationId: number;

    const updateMetrics = () => {
      frameCountRef.current++;
      const now = Date.now();
      const elapsed = now - lastTimeRef.current;

      // Update FPS every second
      if (elapsed >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed);
        
        // Get memory if available (Chrome/Edge)
        let memoryMB = 0;
        if (performance && (performance as any).memory) {
          const mem = (performance as any).memory;
          memoryMB = Math.round(mem.usedJSHeapSize / 1024 / 1024);
        }

        setMetrics({
          fps,
          memoryMB,
          nodeCount,
          edgeCount,
        });

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      animationId = requestAnimationFrame(updateMetrics);
    };

    animationId = requestAnimationFrame(updateMetrics);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [nodeCount, edgeCount]);

  return (
    <div
      style={{
        position: 'relative',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#0f0',
        padding: '10px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '11px',
        minWidth: '200px',
        border: '1px solid rgba(100, 181, 246, 0.3)',
      }}
    >
      <div style={{ marginBottom: '4px', fontWeight: 'bold', color: '#fff' }}>
        ⚡ Performance Monitor
      </div>
      <div style={{ color: metrics.fps >= 50 ? '#0f0' : metrics.fps >= 30 ? '#ff0' : '#f00' }}>
        FPS: {metrics.fps}
      </div>
      {metrics.memoryMB > 0 && (
        <div style={{ color: metrics.memoryMB < 500 ? '#0f0' : metrics.memoryMB < 2000 ? '#ff0' : '#f00' }}>
          Memory: {metrics.memoryMB} MB
        </div>
      )}
      <div style={{ color: '#aaa' }}>
        Nodes: {metrics.nodeCount}
      </div>
      <div style={{ color: '#aaa' }}>
        Edges: {metrics.edgeCount}
      </div>
    </div>
  );
}

