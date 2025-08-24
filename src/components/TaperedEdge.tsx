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
  
  // Calculate stroke widths based on weights - make them more visible
  const sourceStrokeWidth = Math.max(3, Math.min(15, sourceWeight * 2));
  const targetStrokeWidth = Math.max(3, Math.min(15, targetWeight * 2));
  
  // Use average for now - true tapering would require more complex SVG
  const averageStrokeWidth = (sourceStrokeWidth + targetStrokeWidth) / 2;

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: '#ff0000', // Bright red for maximum visibility
        strokeWidth: Math.max(8, averageStrokeWidth), // Minimum 8px width
        opacity: 1, // Full opacity
      }}
    />
  );
}