import { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type KnowledgeNode = {
  node: string;
  weight?: number;
  children?: KnowledgeNode[];
};

type PositionedNode = KnowledgeNode & {
  x: number;
  y: number;
  depth: number;
  radius: number;
};

function computeDepth(n: KnowledgeNode | undefined): number {
  if (!n) return 0;
  if (!n.children || n.children.length === 0) return 1;
  return 1 + Math.max(...n.children.map(computeDepth));
}

function layoutTree(
  root: KnowledgeNode,
  width: number,
  vGap: number,
  hPadding: number,
  sizeRange: [number, number]
) {
  // First pass: compute leaf counts to distribute x positions
  function leafCount(n: KnowledgeNode): number {
    if (!n.children || n.children.length === 0) return 1;
    return n.children.map(leafCount).reduce((a, b) => a + b, 0);
  }

  const totalLeaves = leafCount(root);
  const usableWidth = Math.max(0, width - hPadding * 2);
  const stepX = totalLeaves > 1 ? usableWidth / (totalLeaves - 1) : 0; // single leaf -> centered
  const depthCount = computeDepth(root);

  const nodes: PositionedNode[] = [];
  const edges: Array<{ from: PositionedNode; to: PositionedNode }> = [];

  let leafIndex = 0;

  function weightToRadius(w?: number) {
    const [minR, maxR] = sizeRange;
    if (w === undefined || Number.isNaN(w)) return minR;
    // Clamp weight between 1 and 10 by convention, scale to radius
    const clamped = Math.max(1, Math.min(10, w));
    const t = (clamped - 1) / 9;
    return minR + t * (maxR - minR);
  }

  function assign(n: KnowledgeNode, depth: number): PositionedNode {
    let x: number;

    if (!n.children || n.children.length === 0) {
      // leaf: place on next slot
      x = hPadding + (totalLeaves === 1 ? usableWidth / 2 : leafIndex * stepX);
      leafIndex += 1;
    } else {
      // internal: place at the average x of its children
      const childPositions = n.children.map((c) => assign(c, depth + 1));
      const avgX =
        childPositions.reduce((sum, c) => sum + c.x, 0) / childPositions.length;
      x = avgX;
    }

    const y = depth * vGap + vGap / 2; // top padding baked into vGap/2
    const positioned: PositionedNode = {
      ...n,
      x,
      y,
      depth,
      radius: weightToRadius(n.weight),
    };

    nodes.push(positioned);

    if (n.children && n.children.length > 0) {
      n.children.forEach((child) => {
        const childPos = nodes.find((nd) => nd !== positioned && nd.node === child.node && nd.depth === depth + 1);
        // If child not yet in nodes due to recursion order, it will be added during recursion; we'll create edges after full traversal
      });
    }

    return positioned;
  }

  // We need a two-pass approach to accumulate edges accurately; do a recursive walk that returns the positioned node and its children positioned
  function placeWithEdges(n: KnowledgeNode, depth: number): PositionedNode {
    // For internal nodes, place children first to compute avg x
    let positionedChildren: PositionedNode[] = [];

    if (n.children && n.children.length > 0) {
      positionedChildren = n.children.map((c) => placeWithEdges(c, depth + 1));
      const avgX =
        positionedChildren.reduce((sum, c) => sum + c.x, 0) / positionedChildren.length;
      const y = (depthCount - 1 - depth) * vGap + vGap / 2;
      const positioned: PositionedNode = {
        ...n,
        x: avgX,
        y,
        depth,
        radius: weightToRadius(n.weight),
      };
      nodes.push(positioned);
      positionedChildren.forEach((ch) => edges.push({ from: positioned, to: ch }));
      return positioned;
    } else {
      // leaf
      const x = hPadding + (totalLeaves === 1 ? usableWidth / 2 : leafIndex * stepX);
      const y = (depthCount - 1 - depth) * vGap + vGap / 2;
      leafIndex += 1;
      const positioned: PositionedNode = {
        ...n,
        x,
        y,
        depth,
        radius: weightToRadius(n.weight),
      };
      nodes.push(positioned);
      return positioned;
    }
  }

  nodes.length = 0;
  edges.length = 0;
  leafIndex = 0;
  placeWithEdges(root, 0);

  const height = Math.max(1, depthCount) * vGap;

  return { nodes, edges, height };
}

export function KnowledgeTree({ data }: { data: KnowledgeNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  // Resize handling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const verticalGap = 120; // px
    const hPad = 32; // px
    return layoutTree(data, width, verticalGap, hPad, [12, 28]);
  }, [data, width]);

  return (
    <section aria-label="Knowledge tree" className="w-full">
      <div
        ref={containerRef}
        className="relative w-full overflow-x-auto rounded-lg border border-border bg-card"
        style={{ minHeight: Math.max(320, layout.height) }}
      >
        {/* SVG Edges */}
        <svg
          width={width}
          height={layout.height}
          className="block"
          role="img"
          aria-label="Tree connections"
        >
          <g>
            {layout.edges.map((e, idx) => (
              <path
                key={idx}
                d={`M ${e.from.x},${e.from.y + e.from.radius} C ${e.from.x},${
                  (e.from.y + e.to.y) / 2
                } ${e.to.x},${(e.from.y + e.to.y) / 2} ${e.to.x},${
                  e.to.y - e.to.radius
                }`}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
              />
            ))}
          </g>
        </svg>

        {/* HTML Nodes for better tooltips & accessibility */}
        <div className="absolute inset-0">
          {layout.nodes.map((n, idx) => (
            <div
              key={`${n.node}-${idx}`}
              className="absolute"
              style={{ left: n.x, top: n.y }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="-translate-x-1/2 -translate-y-1/2 rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] ring-1 ring-ring transition-transform duration-200 hover:scale-105 focus:scale-105 focus:outline-none"
                    style={{
                      width: n.radius * 2,
                      height: n.radius * 2,
                    }}
                    aria-label={`Node ${n.node}`}
                    title={n.node}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-sm">
                  <div className="font-medium">{n.node}</div>
                  {typeof n.weight !== "undefined" && (
                    <div className="text-muted-foreground">Weight: {n.weight}</div>
                  )}
                  {n.children && n.children.length > 0 && (
                    <div className="text-muted-foreground">
                      Children: {n.children.length}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
