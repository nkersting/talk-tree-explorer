import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { KnowledgeNode } from "@/types";

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
  widgets?: string[];
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

  const layerZ = 8; // standard distance between layers
  const radial = 5; // standard radius for each layer

  function traverse(n: KnowledgeNode, depth: number, parentId?: string) {
    const id = `n3-${idCounter++}`;

    // Arrange children on a circle; root at origin
    const z = depth * layerZ;

    nodes.push({ id, label: n.node, weight: n.weight, position: [0, 0, z], widgets: n.widgets });

    if (parentId) edges.push({ source: parentId, target: id });

    const children = n.children ?? [];
    const count = children.length;
    if (count > 0) {
      const radius = radial; // fixed radius for consistent edge lengths
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const cx = Math.cos(angle) * radius;
        const cy = Math.sin(angle) * radius * 0.7; // slight ellipse
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

// Image preview component
function ImagePreview({ src, position, index }: { src: string; position: [number, number, number]; index: number }) {
  const [hovered, setHovered] = useState(false);
  
  // Position images in a small arc around the node
  const angle = (index / 3) * Math.PI * 2;
  const radius = 2;
  const imagePos: [number, number, number] = [
    position[0] + Math.cos(angle) * radius,
    position[1] + Math.sin(angle) * radius,
    position[2]
  ];
  
  return (
    <group position={imagePos}>
      <Html
        center
        distanceFactor={8}
        style={{ pointerEvents: "all" }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <div style={{ position: "relative" }}>
          <img
            src={src}
            alt="Widget preview"
            style={{
              width: hovered ? "200px" : "40px",
              height: hovered ? "200px" : "40px",
              objectFit: "cover",
              borderRadius: "8px",
              border: "2px solid hsl(var(--border))",
              boxShadow: hovered ? "0 10px 30px -10px hsl(var(--primary) / 0.3)" : "0 2px 8px -2px hsl(var(--primary) / 0.2)",
              transition: "all 0.3s ease",
              cursor: "pointer",
              zIndex: hovered ? 1000 : 1,
              position: hovered ? "fixed" : "relative",
              top: hovered ? "50%" : "auto",
              left: hovered ? "50%" : "auto",
              transform: hovered ? "translate(-50%, -50%)" : "none",
            }}
          />
        </div>
      </Html>
    </group>
  );
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
  
  // Filter widgets for image files
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
  const imageWidgets = node.widgets?.filter(widget => 
    imageExtensions.some(ext => widget.toLowerCase().endsWith(ext))
  ) || [];
  
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
      
      {/* Render image previews */}
      {imageWidgets.map((widget, index) => (
        <ImagePreview 
          key={`${node.id}-image-${index}`}
          src={widget}
          position={node.position}
          index={index}
        />
      ))}
    </group>
  );
}

// Custom OrbitControls hook to refine controls
function useCustomOrbitControls(controlsRef: React.RefObject<OrbitControlsImpl>) {
  const { camera, gl } = useThree();
  
  useEffect(() => {
    if (!controlsRef.current) return;
    
    // Set initial position for better viewing
    camera.position.set(0, 5, -15);
    camera.lookAt(0, 0, 0);
    
    // Enhance control behavior
    const controls = controlsRef.current;
    controls.update();
    
    // Constrain vertical rotation to avoid upside-down view
    controls.minPolarAngle = Math.PI * 0.1;
    controls.maxPolarAngle = Math.PI * 0.8;
    
    // Add event listeners for zoom
    const handleWheel = (e: WheelEvent) => {
      // Smooth zoom sensitivity
      const zoomFactor = e.deltaY * 0.005;
      camera.position.z += zoomFactor;
      camera.position.z = Math.max(2, Math.min(camera.position.z, 30));
      controls.update();
    };
    
    gl.domElement.addEventListener('wheel', handleWheel, { passive: true });
    
    return () => {
      gl.domElement.removeEventListener('wheel', handleWheel);
    };
  }, [camera, gl, controlsRef]);
}

function GraphScene({ data }: { data: KnowledgeNode }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => build3DLayout(data), [data]);
  const idToNode = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const focusPos = useRef<[number, number, number]>([0, 0, 0]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  
  // Update focus position reference but don't force camera movement
  useEffect(() => {
    if (focusId) {
      const nodePos = idToNode.get(focusId)?.position ?? [0, 0, 0];
      focusPos.current = nodePos;
      
      // Optional: Only move camera on initial focus, not during pans/zooms
      if (controlsRef.current) {
        // Smoothly move to new target only on focus change
        const controls = controlsRef.current;
        controls.target.set(nodePos[0], nodePos[1], nodePos[2]);
        controls.update();
      }
    }
  }, [focusId, idToNode]);
  
  // Get colors from CSS variables
  const muted = useCssHsl("--muted-foreground", "hsl(215 20% 65%)");
  const focusedEdgeColor = "#000000";
  
  // Use improved OrbitControls setup
  const orbitControlsRef = useRef<OrbitControlsImpl>(null);
  
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 7, -5]} intensity={0.5} />
      
      {/* Replace CameraRig with OrbitControls - no forced movement */}
      <OrbitControls
        ref={orbitControlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={30}
        dampingFactor={0.1}
        rotateSpeed={0.7}
        panSpeed={0.5}
        zoomSpeed={1.0}
        makeDefault
      />
      
      {/* Rest of your scene rendering */}
      {edges.map((e, idx) => {
        const a = idToNode.get(e.source)!;
        const b = idToNode.get(e.target)!;
        
        // Calculate product of weights for line thickness
        const sourceWeight = normalizeWeight(a.weight);
        const targetWeight = normalizeWeight(b.weight);
        const weightProduct = sourceWeight * targetWeight;
        
        // Base line width on weight product (1 to 12) - 4x thicker
        const lineWidth = (0.25 + weightProduct * 2.75) * 4;
        
        // Check if this edge connects to the focused node
        const isConnected = focusId && (e.source === focusId || e.target === focusId);
        
        // Asphalt road colors
        const asphaltColor = "#2a2a2a"; // Dark asphalt
        const focusedAsphaltColor = "#1a1a1a"; // Darker asphalt for focused
        const lineColor = isConnected ? focusedAsphaltColor : asphaltColor;
        const lineOpacity = 0.9;
        
        // Calculate direction vector
        const direction = [
          b.position[0] - a.position[0],
          b.position[1] - a.position[1], 
          b.position[2] - a.position[2]
        ];
        const length = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
        const normalized = [direction[0]/length, direction[1]/length, direction[2]/length];
        
        // Create 10 chevrons along the path
        const numChevrons = 10;
        const chevrons = [];
        
        for (let i = 1; i <= numChevrons; i++) {
          const t = i / (numChevrons + 1); // position along the line (0 to 1), excluding endpoints
          const chevronPos: [number, number, number] = [
            a.position[0] + direction[0] * t,
            a.position[1] + direction[1] * t,
            a.position[2] + direction[2] * t
          ];
          
          // Create angular zebra stripe pattern like road markings
          const stripeWidth = 0.3 + weightProduct * 0.15;
          const stripeLength = lineWidth * 0.08; // Proportional to road width
          
          // Create perpendicular stripe across the road
          const perpendicular = [
            -normalized[1], 
            normalized[0], 
            0 // Keep stripes horizontal
          ];
          
          // Angular zebra stripe - white/light colored
          const zebraColor = "#f0f0f0"; // Light zebra stripe color
          const leftEnd: [number, number, number] = [
            chevronPos[0] - perpendicular[0] * stripeWidth,
            chevronPos[1] - perpendicular[1] * stripeWidth,
            chevronPos[2]
          ];
          const rightEnd: [number, number, number] = [
            chevronPos[0] + perpendicular[0] * stripeWidth,
            chevronPos[1] + perpendicular[1] * stripeWidth,
            chevronPos[2]
          ];
          
          // Add angled edges to make it more angular
          const angleOffset = stripeLength * 0.3;
          const leftAngled: [number, number, number] = [
            leftEnd[0] + normalized[0] * angleOffset,
            leftEnd[1] + normalized[1] * angleOffset,
            leftEnd[2]
          ];
          const rightAngled: [number, number, number] = [
            rightEnd[0] - normalized[0] * angleOffset,
            rightEnd[1] - normalized[1] * angleOffset,
            rightEnd[2]
          ];
          
          chevrons.push(
            <Line 
              key={`zebra-${i}`}
              points={[leftAngled, rightAngled]} 
              color={zebraColor}
              lineWidth={lineWidth * 0.6}
              transparent
              opacity={0.9}
            />
          );
        }
        
        return (
          <group key={`edge-${idx}-${isConnected ? 'focused' : 'unfocused'}`}>
            <Line 
              points={[a.position, b.position]} 
              color={lineColor}
              lineWidth={lineWidth}
              transparent
              opacity={lineOpacity}
            />
            {chevrons}
          </group>
        );
      })}
      
      {nodes.map((n) => (
        <NodeMesh 
          key={n.id} 
          node={n} 
          onClick={(id) => {
            // Only move camera on initial focus, allow free navigation after
            setFocusId(id === focusId ? null : id);
          }}
          isFocused={n.id === focusId} 
        />
      ))}
    </>
  );
}

// And update the Graph3D component to remove any custom controls that might interfere
export function Graph3D({ data }: { data: KnowledgeNode }) {
  const card = useCssHsl("--card", "hsl(0 0% 100%)");
  return (
    <section aria-label="3D knowledge tree" className="w-full h-[520px] mt-10">
      <div className="w-full h-full rounded-lg border border-border bg-card overflow-hidden">
        <Canvas shadows camera={{ position: [0, 5, -15], fov: 50 }}>
          <color attach="background" args={[card] as any} />
          <GraphScene data={data} />
          {/* OrbitControls is now inside the GraphScene component */}
        </Canvas>
      </div>
    </section>
  );
}