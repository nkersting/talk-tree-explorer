import { useCallback, useMemo, useEffect } from "react";
import { 
  ReactFlow, 
  Node, 
  Edge, 
  useNodesState, 
  useEdgesState, 
  Background, 
  Controls,
  MiniMap,
  NodeTypes,
  Handle,
  Position,
  NodeChange,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFocus } from '@/contexts/FocusContext';

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

// Custom node component with handles
function KnowledgeNodeComponent({ data }: { data: any }) {
  const radius = data.radius || 20;
  const { focusedNodeLabel, setFocusedNodeLabel, focusSource, setFocusSource } = useFocus();
  
  const isFocused = focusedNodeLabel === data.label;
  
  // Handle click on the node
  const handleNodeClick = () => {
    if (focusedNodeLabel === data.label) {
      // Toggle off if already focused
      setFocusedNodeLabel(null);
      setFocusSource(null);
    } else {
      setFocusedNodeLabel(data.label);
      setFocusSource('graph2d');
    }
  };
  
  return (
    <>
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ 
          background: 'hsl(var(--primary))', 
          border: '2px solid hsl(var(--background))',
          width: '8px',
          height: '8px'
        }}
      />
      
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] ring-1 ring-ring transition-transform duration-200 hover:scale-105 cursor-move flex items-center justify-center text-xs font-medium text-center leading-tight p-1 ${
              isFocused ? 'scale-110 ring-2 ring-foreground animate-pulse' : ''
            }`}
            style={{
              width: radius * 2,
              height: radius * 2,
              fontSize: Math.max(8, radius / 3),
            }}
            title={data.label}
            onClick={handleNodeClick}
          >
            {data.label}
          </div>
        </TooltipTrigger>
        <TooltipContent>{data.label}</TooltipContent>
      </Tooltip>
      
      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ 
          background: 'hsl(var(--primary))', 
          border: '2px solid hsl(var(--background))',
          width: '8px',
          height: '8px'
        }}
      />
    </>
  );
}

const nodeTypes: NodeTypes = {
  knowledge: KnowledgeNodeComponent,
};

function convertTreeToReactFlow(root: KnowledgeNode) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeMap = new Map<string, { x: number; y: number; depth: number }>();
  const nodeWeightMap = new Map<string, number>();
  
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
    
    // Store node weight for edge thickness calculation
    nodeWeightMap.set(currentNodeId, node.weight || 1);

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
        type: 'straight',
        style: { 
          stroke: 'hsl(var(--muted-foreground))', 
          strokeWidth: 1 // Will be updated after all nodes are processed
        },
      });
    }

    return currentNodeId;
  }

  processNode(root, 0);
  
  // Update edge thickness based on average weight of connected nodes
  edges.forEach(edge => {
    const sourceWeight = nodeWeightMap.get(edge.source) || 1;
    const targetWeight = nodeWeightMap.get(edge.target) || 1;
    const averageWeight = (sourceWeight + targetWeight) / 2;
    const strokeWidth = Math.max(1, Math.min(8, averageWeight * 0.8));
    
    edge.style = {
      ...edge.style,
      strokeWidth: strokeWidth
    };
  });
  
  return { nodes, edges };
}

export function KnowledgeTree({ data }: { data: KnowledgeNode }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => 
    convertTreeToReactFlow(data), [data]
  );
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();

  // Dynamic repositioning based on node movements
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    
    // Check if any node was dragged
    const draggedChanges = changes.filter(change => 
      change.type === 'position' && change.dragging === false
    );
    
    if (draggedChanges.length > 0) {
      // Apply force-directed layout to avoid overlaps
      setNodes(nds => {
        const updatedNodes = [...nds];
        
        // Simple collision detection and resolution
        for (let i = 0; i < updatedNodes.length; i++) {
          for (let j = i + 1; j < updatedNodes.length; j++) {
            const nodeA = updatedNodes[i];
            const nodeB = updatedNodes[j];
            
            if (!nodeA.position || !nodeB.position) continue;
            
            const dx = nodeB.position.x - nodeA.position.x;
            const dy = nodeB.position.y - nodeA.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = 100; // Minimum distance between nodes
            
            if (distance < minDistance && distance > 0) {
              const pushDistance = (minDistance - distance) / 2;
              const angle = Math.atan2(dy, dx);
              
              // Push nodes apart
              const pushX = Math.cos(angle) * pushDistance;
              const pushY = Math.sin(angle) * pushDistance;
              
              updatedNodes[i] = {
                ...nodeA,
                position: {
                  x: nodeA.position.x - pushX,
                  y: nodeA.position.y - pushY
                }
              };
              
              updatedNodes[j] = {
                ...nodeB,
                position: {
                  x: nodeB.position.x + pushX,
                  y: nodeB.position.y + pushY
                }
              };
            }
          }
        }
        
        return updatedNodes;
      });
    }
  }, [onNodesChange, setNodes]);

  return (
    <section aria-label="Knowledge tree" className="w-full h-[600px]">
      <div className="w-full h-full rounded-lg border border-border bg-card overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
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
