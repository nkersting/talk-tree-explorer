import { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { createPortal } from "react-dom";
import type { KnowledgeNode, Widget } from "../types"; // Adjusted path to match the correct location
import { useFocus } from '@/contexts/FocusContext';
import { 
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

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
  widgets?: Widget[];
};

type Edge3D = { source: string; target: string };

function normalizeWeight(w?: number) {
  if (w === undefined || Number.isNaN(w)) return 0.5;
  const clamped = Math.max(1, Math.min(100, w));
  return (clamped - 1) / 99; // 0..1
}

function build3DLayout(root: KnowledgeNode) {
  const nodes: Node3D[] = [];
  const edges: Edge3D[] = [];
  let idCounter = 0;

  // Improved spacing parameters to prevent overlaps
  const layerDistance = 15; // Increased distance between depth levels
  const minNodeDistance = 4; // Minimum distance between any two nodes
  const baseRadius = 6; // Base radius for first level
  
  function countNodesAtDepth(node: KnowledgeNode, targetDepth: number, currentDepth = 0): number {
    if (currentDepth === targetDepth) return 1;
    if (!node.children || currentDepth >= targetDepth) return 0;
    
    return node.children.reduce((sum, child) => 
      sum + countNodesAtDepth(child, targetDepth, currentDepth + 1), 0);
  }
  
  function calculateOptimalRadius(nodeCount: number, minDistance: number): number {
    if (nodeCount <= 1) return 0;
    // Calculate radius needed to fit nodeCount nodes with minDistance between them
    const circumference = nodeCount * minDistance * 2;
    return Math.max(baseRadius, circumference / (2 * Math.PI));
  }
  
  function traverse(n: KnowledgeNode, depth: number, parentId?: string, parentPos: [number, number, number] = [0, 0, 0], siblingIndex = 0, totalSiblings = 1) {
    const id = `n3-${idCounter++}`;
    const z = depth * layerDistance;
    
    let x = 0, y = 0;
    
    if (depth === 0) {
      // Root node at origin
      x = 0;
      y = 0;
    } else {
      // Calculate position based on sibling arrangement
      if (totalSiblings === 1) {
        // Single child, place directly below parent with slight offset to avoid exact overlap
        x = parentPos[0] + (Math.random() - 0.5) * 0.5; // Small random offset
        y = parentPos[1] + (Math.random() - 0.5) * 0.5;
      } else {
        // Multiple siblings, arrange in circle around parent
        const radius = calculateOptimalRadius(totalSiblings, minNodeDistance);
        const angle = (siblingIndex / totalSiblings) * Math.PI * 2;
        x = parentPos[0] + Math.cos(angle) * radius;
        y = parentPos[1] + Math.sin(angle) * radius;
      }
    }

    const position: [number, number, number] = [x, y, z];
    
    // Check for collisions with existing nodes and adjust if necessary
    let finalPosition = position;
    let attempts = 0;
    const maxAttempts = 20;
    
    while (attempts < maxAttempts) {
      let collision = false;
      for (const existingNode of nodes) {
        const dx = finalPosition[0] - existingNode.position[0];
        const dy = finalPosition[1] - existingNode.position[1];
        const dz = finalPosition[2] - existingNode.position[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distance < minNodeDistance) {
          collision = true;
          // Move away from collision
          const moveDistance = minNodeDistance - distance + 1;
          const moveAngle = Math.atan2(dy, dx);
          finalPosition = [
            finalPosition[0] + Math.cos(moveAngle) * moveDistance,
            finalPosition[1] + Math.sin(moveAngle) * moveDistance,
            finalPosition[2]
          ];
          break;
        }
      }
      
      if (!collision) break;
      attempts++;
    }

    nodes.push({ id, label: n.node, weight: n.weight, position: finalPosition, widgets: n.widgets });

    if (parentId) edges.push({ source: parentId, target: id });

    const children = n.children ?? [];
    const childCount = children.length;
    
    if (childCount > 0) {
      for (let i = 0; i < childCount; i++) {
        traverse(children[i], depth + 1, id, finalPosition, i, childCount);
      }
    }

    return id;
  }

  traverse(root, 0);

  return { nodes, edges };
}

// Debug indicator to show positions
function DebugMarker({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} scale={[0.2, 0.2, 0.2]}>
      <sphereGeometry />
      <meshBasicMaterial color="red" />
    </mesh>
  );
}

// Completely reworked Image Preview component
function ImagePreview({ 
  src, 
  position, 
  index, 
  notes,
  widget,
  onWidgetClick 
}: { 
  src: string; 
  position: [number, number, number]; 
  index: number;
  notes?: string;
  widget: Widget;
  onWidgetClick: (widget: Widget) => void;
}) {
  const [fullscreenView, setFullscreenView] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Use the position passed from parent (already calculated symmetrically)
  const imagePos: [number, number, number] = position;
  
  // Resolve image path from data directory
  const imagePath = useMemo(() => {
    // If it's a URL, use it directly
    if (src.startsWith('http')) {
      return src;
    }
    
    // If it starts with slash, it's from the root
    if (src.startsWith('/')) {
      return src;
    }
    
    // Otherwise, it's relative to the data directory
    return `/data/${src}`;
  }, [src]);
  
 
  
  // Handle image loading
  const handleImageLoad = () => {
    console.log(`✅ Image loaded successfully: ${imagePath}`);
    setIsVisible(true);
    setImageError(false);
  };
  
  const handleImageError = () => {
    console.error(`❌ Failed to load image: ${imagePath}`);
    setImageError(true);
  };
  
  // Handle visibility based on camera position
  const { camera } = useThree();
  useFrame(() => {
    if (!imageRef.current) return;
    
    // Calculate distance to camera
    const distance = new THREE.Vector3(...imagePos).distanceTo(camera.position);
    
    // Only show images that are reasonably close to the camera
    if (distance < 30) {
      imageRef.current.style.opacity = "1";
    } else {
      imageRef.current.style.opacity = "0";
    }
  });
  
  // Open side panel view  
  const openSidePanel = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Opening side panel for:", imagePath);
    // Pass the entire widget object to the handler
    onWidgetClick(widget);
  };
  
  // Close fullscreen view
  const closeFullscreen = () => {
    setFullscreenView(false);
  };
  
  return (
    <>
      {/* Debug sphere to see where the image should be */}
      <DebugMarker position={imagePos} />
      
      {/* The actual image */}
      <group position={imagePos}>
        <Html
          center
          transform
          occlude={false}
          distanceFactor={10}
          position={[0, 0, 0]}
          style={{ 
            width: "60px", 
            height: "60px",
            // Try different approach for the container
            transform: "rotateY(180deg)"
          }}
        >
          {imageError ? (
            <div 
              style={{
                width: "100%",
                height: "100%",
                position: "relative",
                backgroundColor: "rgba(255,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "5px",
                border: "2px solid white",
                boxShadow: "0 0 10px rgba(0,0,0,0.7)",
                fontSize: "10px",
                color: "white",
                textAlign: "center"
              }}
            >
              Image<br/>Error
            </div>
          ) : (
            <div 
              ref={imageRef}
              style={{
                width: "100%",
                height: "100%",
                position: "relative",
                cursor: "pointer",
                borderRadius: "5px",
                opacity: isVisible ? 1 : 0,
                transition: "opacity 0.3s",
                overflow: "hidden",
                border: "2px solid white",
                boxShadow: "0 0 10px rgba(0,0,0,0.7)",
                // Add this style to fix the inversion
                transform: "scaleX(-1)"
              }}
              onClick={openSidePanel}
            >
              <img 
                src={imagePath}
                alt="Preview"
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  // Fix inversion
                  transform: "scaleX(-1)"
                }}
              />
            </div>
          )}
        </Html>
      </group>
      
      {/* Fullscreen view using portal */}
      {fullscreenView && createPortal(
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "pointer",
          }}
          onClick={closeFullscreen}
        >
          <div 
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              position: "relative",
            }}
            onClick={e => e.stopPropagation()}
          >
            <img 
              src={imagePath}
              alt="Fullscreen view"
              style={{
                maxWidth: "100%",
                maxHeight: "90vh",
                boxShadow: "0 0 30px rgba(0,0,0,0.8)"
              }}
            />
            <button
              style={{
                position: "absolute",
                top: "-40px",
                right: "0",
                background: "rgba(255,255,255,0.2)",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: "pointer"
              }}
              onClick={closeFullscreen}
            >
              Close
            </button>
            <div style={{
              marginTop: "10px",
              color: "white",
              textAlign: "center",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>
              {src}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Update the NodeMesh component to handle widgets as dictionaries with "name" attribute
function NodeMesh({ 
  node, 
  onClick, 
  isFocused = false,
  onWidgetClick
}: { 
  node: Node3D; 
  onClick: (id: string) => void;
  isFocused?: boolean;
  onWidgetClick: (widget: Widget) => void;
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
  
  // Debug widgets
  useEffect(() => {
    if (node.widgets && node.widgets.length > 0) {
      console.log(`Node ${node.id} at position ${node.position} has ${node.widgets.length} widgets:`, node.widgets);
    }
  }, [node]);
  
  // Filter widgets for image files (handle both local files and URLs)
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
  const imageWidgets = node.widgets?.filter(widget => {
    if (!widget) return false;
    
    // Extract the name from the widget object - widgets are now always objects
    const widgetName = widget.name;
    
    if (!widgetName) return false;
    
    // Check if it's a URL with image extension or just a local image file
    if (widgetName.startsWith('http')) {
      return imageExtensions.some(ext => widgetName.toLowerCase().includes(ext));
    }
    return imageExtensions.some(ext => widgetName.toLowerCase().endsWith(ext));
  }) || [];
  
  const allImages = imageWidgets;
  
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
      
      {/* Render image previews symmetrically around the node */}
      {allImages.map((widget, index) => {
        const angle = (index / allImages.length) * Math.PI * 2; // Distribute evenly in a circle
        const radius = 2.0; // Radius around the node
        const widgetPosition: [number, number, number] = [
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0 
        ];
        
        // Extract the widget name from the widget object - widgets are now always objects  
        const widgetSrc = widget.name;
        
        console.log(`Node ${node.id} at position ${node.position} has widget image at position ${widgetPosition}`);
        
        // Extract notes from widget object
        const widgetNotes = widget.notes || '';
        
        return (
          <ImagePreview 
            key={`${node.id}-img-${index}`}
            src={widgetSrc} 
            position={widgetPosition} 
            index={index}
            notes={widgetNotes}
            widget={widget}
            onWidgetClick={onWidgetClick}
          />
        );
      })}
    </group>
  );
}

// Custom OrbitControls hook to refine controls
function useCustomOrbitControls(controlsRef: React.RefObject<any>) {
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

// Component to render an edge with animated pulse showing direction
function EdgeWithPulse({ 
  sourcePos, 
  targetPos, 
  color, 
  lineWidth, 
  opacity, 
  isFocused 
}: {
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  color: string;
  lineWidth: number;
  opacity: number;
  isFocused: boolean;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  // Create tube geometry along the line
  const curve = useMemo(() => {
    return new THREE.LineCurve3(
      new THREE.Vector3(...sourcePos),
      new THREE.Vector3(...targetPos)
    );
  }, [sourcePos, targetPos]);
  
  // Animate the pulse
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = clock.getElapsedTime();
    }
  });
  
  // Custom shader material for animated pulse
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) },
        opacity: { value: opacity },
        time: { value: 0 },
        speed: { value: isFocused ? 1.5 : 0.8 }, // Faster pulse when focused
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float opacity;
        uniform float time;
        uniform float speed;
        varying vec2 vUv;
        
        void main() {
          // Create a pulse that travels from 0 to 1 along the line
          float pulsePosition = mod(time * speed * 0.5, 1.0);
          float distanceFromPulse = abs(vUv.x - pulsePosition);
          
          // Create a smooth pulse with falloff
          float pulseWidth = 0.1; // Width of the pulse
          float pulse = 1.0 - smoothstep(0.0, pulseWidth, distanceFromPulse);
          
          // Base alpha with pulse intensity
          float alpha = opacity * (0.3 + 0.7 * pulse);
          
          // Fade out at the edges for smoother tube appearance
          float edgeFade = 1.0 - abs(vUv.y - 0.5) * 2.0;
          alpha *= edgeFade;
          
          // Brighten the color during pulse
          vec3 finalColor = color * (1.0 + pulse * 0.5);
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }, [color, opacity, isFocused]);
  
  return (
    <mesh>
      <tubeGeometry 
        args={[curve, 32, lineWidth * 0.02, 8, false]} 
      />
      <primitive 
        ref={materialRef}
        object={shaderMaterial} 
        attach="material" 
      />
    </mesh>
  );
}

// src/components/Graph3D.tsx - update the GraphScene component
function GraphScene({ data }: { data: KnowledgeNode }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null);
  const { nodes, edges } = useMemo(() => build3DLayout(data), [data]);
  const idToNode = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  
  // Get the current focus from context
  const { focusedNodeLabel, setFocusedNodeLabel, focusSource, setFocusSource } = useFocus();
  
  // Create a map of node labels to IDs for quick lookup
  const labelToId = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach(node => map.set(node.label, node.id));
    return map;
  }, [nodes]);
  
  // Listen for changes to focusedNodeLabel and update the 3D focus when coming from 2D view
  useEffect(() => {
    if (focusedNodeLabel && focusSource === 'graph2d') {
      const matchingId = labelToId.get(focusedNodeLabel);
      if (matchingId) {
        setFocusId(matchingId);
      }
    } else if (!focusedNodeLabel) {
      setFocusId(null);
    }
  }, [focusedNodeLabel, labelToId, focusSource]);
  
  // Update the node click handler
  const handleNodeClick = (id: string) => {
    const clickedNode = idToNode.get(id);
    if (!clickedNode) return;
    
    // Toggle focus state
    if (focusId === id) {
      setFocusId(null);
      setFocusedNodeLabel(null);
      setFocusSource(null);
    } else {
      setFocusId(id);
      setFocusedNodeLabel(clickedNode.label);
      setFocusSource('graph3d');
    }
  };

  // Handle widget clicks
  const handleWidgetClick = (widget: Widget) => {
    setSelectedWidget(widget);
    setSidePanelOpen(true);
  };
  
  // Handle focus animation when node is clicked
  useEffect(() => {
    if (focusId && controlsRef.current) {
      const focusedNode = nodes.find(n => n.id === focusId);
      if (focusedNode) {
        // Get node position
        const nodePos = focusedNode.position;
        
        // Store original camera position and rotation
        const startPos = camera.position.clone();
        const startTarget = controlsRef.current.target.clone();
        
        // Calculate target position (we want to be at a slight offset from the node)
        const targetDistance = 6; // Distance from node to camera
        
        // Direction from node to current camera (normalized)
        const dir = new THREE.Vector3()
          .subVectors(startPos, new THREE.Vector3(...nodePos))
          .normalize();
        
        // Calculate target camera position
        const targetPos = new THREE.Vector3(
          nodePos[0] + dir.x * targetDistance,
          nodePos[1] + dir.y * targetDistance,
          nodePos[2] + dir.z * targetDistance
        );
        
        // Animate to target
        let startTime = Date.now();
        const duration = 1000; // Animation duration in ms
        
        function animate() {
          const now = Date.now();
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          
          // Ease function (cubic ease in/out)
          const ease = progress < 0.5 
            ? 4 * progress * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          
          // Interpolate camera position
          camera.position.set(
            startPos.x + (targetPos.x - startPos.x) * ease,
            startPos.y + (targetPos.y - startPos.y) * ease,
            startPos.z + (targetPos.z - startPos.z) * ease
          );
          
          // Interpolate orbit controls target (what the camera looks at)
          controlsRef.current.target.set(
            startTarget.x + (nodePos[0] - startTarget.x) * ease,
            startTarget.y + (nodePos[1] - startTarget.y) * ease,
            startTarget.z + (nodePos[2] - startTarget.z) * ease
          );
          
          controlsRef.current.update();
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        }
        
        animate();
      }
    }
  }, [focusId, nodes, camera]);
  
  // Get colors from CSS variables
  const muted = useCssHsl("--muted-foreground", "hsl(215 20% 65%)");
  const focusedEdgeColor = "#000000";
  
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 7, -5]} intensity={0.5} />
      
      <OrbitControls
        ref={controlsRef}
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
      
      {/* Render edges connecting nodes with arrow heads */}
      {edges.map((e, idx) => {
        const sourceNode = idToNode.get(e.source);
        const targetNode = idToNode.get(e.target);
        if (!sourceNode || !targetNode) return null;
        
        const isFocusedEdge = focusId === e.source || focusId === e.target;
        const lineColor = isFocusedEdge ? focusedEdgeColor : muted;
        
        return (
          <EdgeWithPulse
            key={`edge-${idx}`}
            sourcePos={sourceNode.position}
            targetPos={targetNode.position}
            color={lineColor}
            lineWidth={isFocusedEdge ? 3 : 1}
            opacity={isFocusedEdge ? 1.0 : 0.6}
            isFocused={isFocusedEdge}
          />
        );
      })}
      
      {nodes.map((n) => (
        <NodeMesh 
          key={n.id} 
          node={n} 
          onClick={handleNodeClick} 
          isFocused={n.id === focusId}
          onWidgetClick={handleWidgetClick}
        />
      ))}
    </>
  );
}

// And update the Graph3D component to include the drawer
export function Graph3D({ data }: { data: KnowledgeNode }) {
  const card = useCssHsl("--card", "hsl(0 0% 100%)");
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null);
  
  return (
    <>
      <section aria-label="3D knowledge tree" className="w-full h-[800px] mt-10">
        <div className="w-full h-full rounded-lg border border-border bg-card overflow-hidden">
          <Canvas shadows camera={{ position: [0, 5, -15], fov: 50 }}>
            <color attach="background" args={[card] as any} />
            <GraphSceneWithDrawer 
              data={data} 
              setSidePanelOpen={setSidePanelOpen}
              setSelectedWidget={setSelectedWidget}
            />
          </Canvas>
        </div>
      </section>

      {/* Side panel drawer */}
      <Drawer open={sidePanelOpen} onOpenChange={setSidePanelOpen}>
        <DrawerContent className="max-w-md ml-auto h-full">
          <DrawerHeader className="text-left">
            <DrawerTitle>{selectedWidget?.title || 'Widget Details'}</DrawerTitle>
            <DrawerDescription>
              {selectedWidget?.subtitle || ''}
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-4 flex-1 overflow-auto">
            {selectedWidget && (
              <div className="space-y-4">
                {/* Full-size widget image */}
                <div className="w-full">
                  <img 
                    src={selectedWidget.name.startsWith('http') 
                      ? selectedWidget.name 
                      : selectedWidget.name.startsWith('/') 
                        ? selectedWidget.name 
                        : `/data/${selectedWidget.name}`
                    }
                    alt="Widget" 
                    className="w-full max-h-96 object-contain rounded-lg border border-border"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                
                {/* Widget notes */}
                {selectedWidget.notes && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Notes:</h3>
                    <div className="text-muted-foreground whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                      {selectedWidget.notes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

// Create a wrapper component that passes the drawer state down
function GraphSceneWithDrawer({ 
  data, 
  setSidePanelOpen, 
  setSelectedWidget 
}: { 
  data: KnowledgeNode;
  setSidePanelOpen: (open: boolean) => void;
  setSelectedWidget: (widget: Widget | null) => void;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => build3DLayout(data), [data]);
  const idToNode = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  
  // Find the root node (at depth 0) for initial positioning
  const rootNode = useMemo(() => {
    return nodes.find(node => node.position[2] === 0); // Root node is at z=0 (depth 0)
  }, [nodes]);
  
  // Center the graph on the root node on initial load
  useEffect(() => {
    if (controlsRef.current && rootNode) {
      // Set the orbit controls to look at the root node
      controlsRef.current.target.set(
        rootNode.position[0], 
        rootNode.position[1], 
        rootNode.position[2]
      );
      controlsRef.current.update();
    }
  }, [rootNode]);
  
  // Get the current focus from context
  const { focusedNodeLabel, setFocusedNodeLabel, focusSource, setFocusSource } = useFocus();
  
  // Create a map of node labels to IDs for quick lookup
  const labelToId = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach(node => map.set(node.label, node.id));
    return map;
  }, [nodes]);
  
  // Listen for changes to focusedNodeLabel and update the 3D focus when coming from 2D view
  useEffect(() => {
    if (focusedNodeLabel && focusSource === 'graph2d') {
      const matchingId = labelToId.get(focusedNodeLabel);
      if (matchingId) {
        setFocusId(matchingId);
      }
    } else if (!focusedNodeLabel) {
      setFocusId(null);
    }
  }, [focusedNodeLabel, labelToId, focusSource]);
  
  // Update the node click handler
  const handleNodeClick = (id: string) => {
    const clickedNode = idToNode.get(id);
    if (!clickedNode) return;
    
    // Toggle focus state
    if (focusId === id) {
      setFocusId(null);
      setFocusedNodeLabel(null);
      setFocusSource(null);
    } else {
      setFocusId(id);
      setFocusedNodeLabel(clickedNode.label);
      setFocusSource('graph3d');
    }
  };

  // Handle widget clicks
  const handleWidgetClick = (widget: Widget) => {
    setSelectedWidget(widget);
    setSidePanelOpen(true);
  };
  
  // Handle focus animation when node is clicked
  useEffect(() => {
    if (focusId && controlsRef.current) {
      const focusedNode = nodes.find(n => n.id === focusId);
      if (focusedNode) {
        // Get node position
        const nodePos = focusedNode.position;
        
        // Store original camera position and rotation
        const startPos = camera.position.clone();
        const startTarget = controlsRef.current.target.clone();
        
        // Calculate target position (we want to be at a slight offset from the node)
        const targetDistance = 6; // Distance from node to camera
        
        // Direction from node to current camera (normalized)
        const dir = new THREE.Vector3()
          .subVectors(startPos, new THREE.Vector3(...nodePos))
          .normalize();
        
        // Calculate target camera position
        const targetPos = new THREE.Vector3(
          nodePos[0] + dir.x * targetDistance,
          nodePos[1] + dir.y * targetDistance,
          nodePos[2] + dir.z * targetDistance
        );
        
        // Animate to target
        let startTime = Date.now();
        const duration = 1000; // Animation duration in ms
        
        function animate() {
          const now = Date.now();
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          
          // Ease function (cubic ease in/out)
          const ease = progress < 0.5 
            ? 4 * progress * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          
          // Interpolate camera position
          camera.position.set(
            startPos.x + (targetPos.x - startPos.x) * ease,
            startPos.y + (targetPos.y - startPos.y) * ease,
            startPos.z + (targetPos.z - startPos.z) * ease
          );
          
          // Interpolate orbit controls target (what the camera looks at)
          controlsRef.current.target.set(
            startTarget.x + (nodePos[0] - startTarget.x) * ease,
            startTarget.y + (nodePos[1] - startTarget.y) * ease,
            startTarget.z + (nodePos[2] - startTarget.z) * ease
          );
          
          controlsRef.current.update();
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        }
        
        animate();
      }
    }
  }, [focusId, nodes, camera]);
  
  // Get colors from CSS variables
  const muted = useCssHsl("--muted-foreground", "hsl(215 20% 65%)");
  const focusedEdgeColor = "#000000";
  
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 7, -5]} intensity={0.5} />
      
      <OrbitControls
        ref={controlsRef}
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
      
      {/* Render edges connecting nodes with arrow heads */}
      {edges.map((e, idx) => {
        const sourceNode = idToNode.get(e.source);
        const targetNode = idToNode.get(e.target);
        if (!sourceNode || !targetNode) return null;
        
        const isFocusedEdge = focusId === e.source || focusId === e.target;
        const lineColor = isFocusedEdge ? focusedEdgeColor : muted;
        
        // Calculate line thickness based on average of node weights
        const sourceWeight = normalizeWeight(sourceNode.weight);
        const targetWeight = normalizeWeight(targetNode.weight);
        const averageWeight = (sourceWeight + targetWeight) / 2;
        
        // Base thickness: 0.5 to 4, scaled by average weight
        const baseThickness = 0.5 + (averageWeight * 3.5);
        const lineWidth = isFocusedEdge ? baseThickness * 1.5 : baseThickness;
        
        return (
          <EdgeWithPulse
            key={`edge-${idx}`}
            sourcePos={sourceNode.position}
            targetPos={targetNode.position}
            color={lineColor}
            lineWidth={lineWidth}
            opacity={isFocusedEdge ? 1.0 : 0.6}
            isFocused={isFocusedEdge}
          />
        );
      })}
      
      {nodes.map((n) => (
        <NodeMesh 
          key={n.id} 
          node={n} 
          onClick={handleNodeClick} 
          isFocused={n.id === focusId}
          onWidgetClick={handleWidgetClick}
        />
      ))}
    </>
  );
}