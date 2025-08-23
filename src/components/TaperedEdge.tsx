import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

export default function TaperedEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const sourceWeight = typeof data?.sourceWeight === 'number' ? data.sourceWeight : 1;
  const targetWeight = typeof data?.targetWeight === 'number' ? data.targetWeight : 1;
  
  // Calculate stroke widths based on weights
  const sourceStrokeWidth = Math.max(1.5, Math.min(12, sourceWeight * 1.2));
  const targetStrokeWidth = Math.max(1.5, Math.min(12, targetWeight * 1.2));
  
  // Use average for now - true tapering would require more complex SVG
  const averageStrokeWidth = (sourceStrokeWidth + targetStrokeWidth) / 2;

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: 'hsl(var(--muted-foreground))',
        strokeWidth: averageStrokeWidth,
      }}
    />
  );
}