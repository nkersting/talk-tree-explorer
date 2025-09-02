import { useCallback, useMemo, useEffect, useState } from "react";
import { 
  ReactFlow, 
  Node, 
  Edge, 
  useNodesState, 
  useEdgesState, 
  Background, 
  Controls,
  NodeTypes,
  Handle,
  Position,
  NodeChange,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useFocus } from '@/contexts/FocusContext';
import TaperedEdge from './TaperedEdge';

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
  
  // Determine if this node is currently focused
  const isFocused = focusedNodeLabel === data.label;
  
  // Check if this node matches the search term
  const isSearchMatch = data.searchTerm && data.label.toLowerCase().includes(data.searchTerm.toLowerCase());
  
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
            // Updated styling for focused node with THICKER light blue border and yellow highlight for search matches
            className={`rounded-full shadow-[var(--shadow-glow)] transition-transform duration-400 hover:scale-105 cursor-move flex items-center justify-center text-xs font-medium text-center leading-tight p-1 ${
              isFocused 
              ? 'scale-210 animate-[pulse_2s_ease-in-out_infinite] bg-primary text-primary-foreground' 
              : isSearchMatch
              ? 'bg-yellow-400 text-black ring-2 ring-yellow-500'
              : 'bg-primary text-primary-foreground ring-1 ring-ring'
            }`}
            style={{
              width: radius * 2,
              height: radius * 2,
              fontSize: Math.max(8, radius / 3),
              ...(isFocused ? { boxShadow: '0 0 0 18px rgb(125 211 252)' } : {}) // 8px thick sky-300 border
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

const edgeTypes = {
  tapered: TaperedEdge,
};

function convertTreeToReactFlow(root: KnowledgeNode) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeMap = new Map<string, { x: number; y: number; depth: number }>();
  const nodeWeightMap = new Map<string, number>();
  
  function weightToRadius(w?: number) {
    if (w === undefined || Number.isNaN(w)) return 25;
    const clamped = Math.max(1, Math.min(100, w));
    const t = (clamped - 1) / 99;
    return 15 + t * 35; // 15-40px radius for more visible scaling
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

    const y = 3 * (depthCount - 1 - depth) * vGap + vGap / 2;
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
      const parentWeight = nodeWeightMap.get(parentId) || 1;
      edges.push({
        id: `edge-${parentId}-${currentNodeId}`,
        source: parentId,
        target: currentNodeId,
        type: 'tapered',
        data: {
          sourceWeight: parentWeight,
          targetWeight: node.weight || 1,
          edgeId: `edge-${parentId}-${currentNodeId}`,
        },
      });
    }

    return currentNodeId;
  }

  processNode(root, 0);
  
  console.log('Generated nodes:', nodes.map(n => ({ id: n.id, label: n.data.label })));
  console.log('Generated edges:', edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type })));
  
  return { nodes, edges };
}

export function KnowledgeTree({ data }: { data: KnowledgeNode }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => 
    convertTreeToReactFlow(data), [data]
  );
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();

  // Update nodes with search term
  useEffect(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        searchTerm: searchTerm
      }
    })));
  }, [searchTerm, setNodes]);

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
    <section aria-label="Knowledge tree" className="w-full h-full">
      <div className="w-full h-full rounded-lg border border-border bg-card overflow-hidden">
        {/* Conditional Search Bar */}
        {isSearchVisible && (
          <div className="p-4 border-b border-border bg-card">
            <Input
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-md"
            />
          </div>
        )}
        <div className="w-full" style={{ height: isSearchVisible ? 'calc(100% - 80px)' : '100%' }}>
          <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          maxZoom={10}
          minZoom={0.01}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          style={{ backgroundColor: 'hsl(var(--card))' }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
            <Background color="hsl(var(--muted))" gap={20} />
            <Controls showInteractive={false}>
              <Button
                variant="ghost" 
                size="sm"
                onClick={() => setIsSearchVisible(!isSearchVisible)}
                className="h-8 w-8 p-0"
              >
                <Search size={14} />
              </Button>
            </Controls>
          </ReactFlow>
        </div>
      </div>
    </section>
  );
}
