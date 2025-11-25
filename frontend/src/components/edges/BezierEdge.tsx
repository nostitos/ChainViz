import { memo } from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

/**
 * Custom edge component that supports multiple parallel edges with offset curves
 * Labels are positioned at 45% along the edge (instead of the default 50%)
 */
export const BezierEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps) => {
  // Get offset from edge data (for multiple edges between same nodes)
  const offset = (data?.offset as number) || 0;

  const curvature = 0.25 + Math.abs(offset) * 0.01;

  // Calculate bezier path with offset for parallel edges
  const [edgePath, defaultLabelX, defaultLabelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  });

  // Calculate label position at 2/3 (67%) along the curve
  // We interpolate between the default label position (at 50%) and the target
  // At 67%, we're 33% of the way from the 50% point to the target
  const labelPosition = {
    x: defaultLabelX + (targetX - defaultLabelX) * 0.33,
    y: defaultLabelY + (targetY - defaultLabelY) * 0.33,
  };

  // Apply perpendicular offset to the path for parallel edges
  // This shifts the edge up/down to prevent overlap
  let finalPath = edgePath;
  if (offset !== 0) {
    // For simplicity, we'll use transform to shift the path
    // A more sophisticated approach would recalculate the bezier curve
    finalPath = edgePath;
  }

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={finalPath}
        style={style}
        transform={offset !== 0 ? `translate(0, ${offset})` : undefined}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelPosition.x}px,${labelPosition.y + offset}px)`,
              pointerEvents: 'all',
              ...labelBgStyle,
              padding: '2px 4px',
              borderRadius: '3px',
            }}
          >
            <div style={{
              ...labelStyle,
              textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 4px rgba(0,0,0,0.8)',
              fontWeight: 700,
            }}>{label}</div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

BezierEdge.displayName = 'BezierEdge';

