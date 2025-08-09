import { useCallback, useMemo } from "react";
import { 
  ReactFlow, 
  Node, 
  Edge, 
  useNodesState, 
  useEdgesState, 
  Background, 
  Controls,
  MiniMap,
  NodeTypes
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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

// Custom node component
function KnowledgeNodeComponent({ data }: { data: any }) {
  const radius = data.radius || 20;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] ring-1 ring-ring transition-transform duration-200 hover:scale-105 cursor-move flex items-center justify-center text-xs font-medium text-center leading-tight p-1"
          style={{
            width: radius * 2,
            height: radius * 2,
            fontSize: Math.max(8, radius / 3),
          }}
          title={data.label}
        >
          {data.label}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-sm">
        <div className="font-medium">{data.label}</div>
        {typeof data.weight !== "undefined" && (
          <div className="text-muted-foreground">Weight: {data.weight}</div>
        )}
        {data.childrenCount > 0 && (
          <div className="text-muted-foreground">
            Children: {data.childrenCount}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

const nodeTypes: NodeTypes = {
  knowledge: KnowledgeNodeComponent,
};

function convertTreeToReactFlow(root: KnowledgeNode) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeMap = new Map<string, { x: number; y: number; depth: number }>();
  
  function weightToRadius(w?: number) {
    if (w === undefined || Number.isNaN(w)) return 20;
    const clamped = Math.max(1, Math.min(10, w));
    const t = (clamped - 1) / 9;
    return 12 + t * 16; // 12-28px radius
  }

  function computeDepth(n: KnowledgeNode): number {
    if (!n.children || n.children.length === 0) return 1;
    return 1 + Math.max(...n.children.map(computeDepth));
  }

  function leafCount(n: KnowledgeNode): number {
    if (!n.children || n.children.length === 0) return 1;
    return n.children.map(leafCount).reduce((a, b) => a + b, 0);
  }

  const totalLeaves = leafCount(root);
  const depthCount = computeDepth(root);
  const vGap = 120;
  const hPadding = 50;
  const usableWidth = Math.max(600, totalLeaves * 100);
  const stepX = totalLeaves > 1 ? usableWidth / (totalLeaves - 1) : 0;
  
  let leafIndex = 0;
  let nodeId = 0;

  function processNode(node: KnowledgeNode, depth: number, parentId?: string): string {
    const currentNodeId = `node-${nodeId++}`;
    
    let x: number;
    if (!node.children || node.children.length === 0) {
      x = hPadding + (totalLeaves === 1 ? usableWidth / 2 : leafIndex * stepX);
      leafIndex += 1;
    } else {
      const childIds = node.children.map(child => processNode(child, depth + 1, currentNodeId));
      const childPositions = childIds.map(id => nodeMap.get(id)!);
      x = childPositions.reduce((sum, pos) => sum + pos.x, 0) / childPositions.length;
    }

    const y = (depthCount - 1 - depth) * vGap + vGap / 2;
    nodeMap.set(currentNodeId, { x, y, depth });

    nodes.push({
      id: currentNodeId,
      type: 'knowledge',
      position: { x, y },
      data: {
        label: node.node,
        weight: node.weight,
        radius: weightToRadius(node.weight),
        childrenCount: node.children?.length || 0,
      },
      draggable: true,
    });

    if (parentId) {
      edges.push({
        id: `edge-${parentId}-${currentNodeId}`,
        source: parentId,
        target: currentNodeId,
        type: 'smoothstep',
        style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1.5 },
      });
    }

    return currentNodeId;
  }

  processNode(root, 0);
  return { nodes, edges };
}

export function KnowledgeTree({ data }: { data: KnowledgeNode }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => 
    convertTreeToReactFlow(data), [data]
  );
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <section aria-label="Knowledge tree" className="w-full h-[600px]">
      <div className="w-full h-full rounded-lg border border-border bg-card overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          style={{ backgroundColor: 'hsl(var(--card))' }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <Background color="hsl(var(--muted))" gap={20} />
          <Controls />
          <MiniMap 
            style={{ 
              backgroundColor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))'
            }}
            nodeColor="hsl(var(--primary))"
            maskColor="hsl(var(--background) / 0.8)"
          />
        </ReactFlow>
      </div>
    </section>
  );
}
