import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import type { KnowledgeNode } from "@/components/KnowledgeTree";

// Resolve CSS HSL tokens like --primary into a usable CSS color string
function useCssHsl(varName: string, fallback: string = "hsl(220 14% 96%)") {
  const [color, setColor] = useState<string>(fallback);
  useEffect(() => {
    const root = document.documentElement;
    const val = getComputedStyle(root).getPropertyValue(varName).trim();
    if (val) {
      setColor(`hsl(${val})`);
    }
  }, [varName]);
  return color;
}

type Node3D = {
  id: string;
  label: string;
  weight?: number;
  position: [number, number, number];
};

type Edge3D = { source: string; target: string };

function normalizeWeight(w?: number) {
  if (w === undefined || Number.isNaN(w)) return 0.5;
  const clamped = Math.max(1, Math.min(10, w));
  return (clamped - 1) / 9; // 0..1
}

function build3DLayout(root: KnowledgeNode) {
  const nodes: Node3D[] = [];
  const edges: Edge3D[] = [];
  let idCounter = 0;

  const layerZ = 6; // distance between layers along +Z (into the screen)
  const radial = 4; // base radius for each layer

  function traverse(n: KnowledgeNode, depth: number, parentId?: string) {
    const id = `n3-${idCounter++}`;

    // Arrange children on a circle; root at origin
    const z = depth * layerZ;

    nodes.push({ id, label: n.node, weight: n.weight, position: [0, 0, z] });

    if (parentId) edges.push({ source: parentId, target: id });

    const children = n.children ?? [];
    const count = children.length;
    if (count > 0) {
      const radius = radial * depth + 3; // grow the circle radius with depth
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const cx = Math.cos(angle) * radius;
        const cy = Math.sin(angle) * (radius * 0.6); // ellipse for nicer spread
        const childId = traverse(children[i], depth + 1, id);
        const child = nodes.find((nn) => nn.id === childId)!;
        child.position = [cx, cy, (depth + 1) * layerZ];
      }
    }

    return id;
  }

  traverse(root, 0);

  return { nodes, edges };
}

function CameraRig({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();
  const targetRef = useRef<[number, number, number]>(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useFrame(() => {
    // Smoothly move camera to target.z + offset
    const [tx, ty, tz] = targetRef.current;
    const desired = { x: tx, y: ty, z: tz - 10 }; // camera behind looking forward
    camera.position.x += (desired.x - camera.position.x) * 0.08;
    camera.position.y += (desired.y + 3 - camera.position.y) * 0.08; // a bit above
    camera.position.z += (desired.z - camera.position.z) * 0.08;
    camera.lookAt(tx, ty, tz);
  });

  return null;
}

function NodeMesh({ 
  node, 
  onClick, 
  isFocused = false 
}: { 
  node: Node3D; 
  onClick: (id: string) => void;
  isFocused?: boolean;
}) {
  const primary = useCssHsl("--primary", "hsl(262 83% 58%)");
  const ring = useCssHsl("--ring", "hsl(262 90% 66%)");
  const textColor = useCssHsl("--foreground", "hsl(222 47% 11%)");
  const weightN = normalizeWeight(node.weight);
  const depth = Math.max(0, node.position[2] / 6);
  const size = 0.35 + weightN * 0.6; // base by weight (heavier = larger)
  const scale = size / (1 + depth * 0.25); // smaller with distance
  
  // Add slight pulsing effect for focused node
  const [pulseScale, setPulseScale] = useState(1);
  
  useFrame(({ clock }) => {
    if (isFocused) {
      setPulseScale(1 + Math.sin(clock.getElapsedTime() * 3) * 0.05);
    } else {
      setPulseScale(1);
    }
  });
  
  return (
    <group 
      position={node.position} 
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
      scale={[pulseScale, pulseScale, pulseScale]}
    >
      <mesh castShadow receiveShadow scale={[scale, scale, scale]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          color={primary} 
          emissive={ring} 
          emissiveIntensity={isFocused ? 0.4 : 0.15} 
          metalness={0.1} 
          roughness={0.4} 
        />
      </mesh>
      <Html center distanceFactor={6} style={{ pointerEvents: "none" }}>
        <div style={{
          background: "hsl(var(--card) / 0.8)",
          color: textColor,
          border: "1px solid hsl(var(--border))",
          borderRadius: 8,
          padding: "2px 6px",
          fontSize: 12,
          whiteSpace: "nowrap",
          fontWeight: isFocused ? "bold" : "normal",
        }}>
          {node.label}
        </div>
      </Html>
    </group>
  );
}

function GraphScene({ data }: { data: KnowledgeNode }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => build3DLayout(data), [data]);
  const idToNode = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const focusPos: [number, number, number] = focusId ? (idToNode.get(focusId)?.position ?? [0, 0, 0]) : [0, 0, 0];
  
  // Get colors from CSS variables
  const muted = useCssHsl("--muted-foreground", "hsl(215 20% 65%)");
  // Use black for focused connections
  const focusedEdgeColor = "#000000";
  
  // Calculate focused node's connections
  const focusedConnections = useMemo(() => {
    if (!focusId) return new Set<string>();
    
    const connections = new Set<string>();
    edges.forEach(edge => {
      if (edge.source === focusId) {
        connections.add(`${edge.source}-${edge.target}`);
      } else if (edge.target === focusId) {
        connections.add(`${edge.source}-${edge.target}`);
      }
    });
    
    return connections;
  }, [focusId, edges]);
  
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 7, -5]} intensity={0.5} />
      <CameraRig target={focusPos} />
      
      {edges.map((e, idx) => {
        const a = idToNode.get(e.source)!;
        const b = idToNode.get(e.target)!;
        
        // Calculate average weight for line thickness
        const sourceWeight = normalizeWeight(a.weight);
        const targetWeight = normalizeWeight(b.weight);
        const avgWeight = (sourceWeight + targetWeight) / 2;
        
        // Base line width on average weight (0.5 to 3)
        const lineWidth = 0.5 + avgWeight * 2.5;
        
        // Check if this edge connects to the focused node
        const edgeKey = `${e.source}-${e.target}`;
        const isConnectedToFocus = focusedConnections.has(edgeKey);
        
        // Use black for connections to focused node
        const lineColor = isConnectedToFocus ? focusedEdgeColor : muted;
        const lineOpacity = isConnectedToFocus ? 1 : 0.6;
        
        return (
          <Line 
            key={idx} 
            points={[a.position, b.position]} 
            color={lineColor}
            lineWidth={lineWidth}
            transparent
            opacity={lineOpacity}
          />
        );
      })}
      
      {nodes.map((n) => (
        <NodeMesh key={n.id} node={n} onClick={setFocusId} isFocused={n.id === focusId} />
      ))}
    </>
  );
}

export function Graph3D({ data }: { data: KnowledgeNode }) {
  const card = useCssHsl("--card", "hsl(0 0% 100%)");
  return (
    <section aria-label="3D knowledge tree" className="w-full h-[520px] mt-10">
      <div className="w-full h-full rounded-lg border border-border bg-card overflow-hidden">
        <Canvas shadows camera={{ position: [0, 3, -10], fov: 50 }}>
          <color attach="background" args={[card] as any} />
          <GraphScene data={data} />
          <OrbitControls enablePan={false} enableZoom={true} />
        </Canvas>
      </div>
    </section>
  );
}
