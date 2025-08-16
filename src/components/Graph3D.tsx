import { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { createPortal } from "react-dom";
import type { KnowledgeNode } from "../types"; // Adjusted path to match the correct location

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
function ImagePreview({ src, position, index }: { src: string; position: [number, number, number]; index: number }) {
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
  
  // Debug logging
  useEffect(() => {
    console.log(`ImagePreview: src=${src}, resolved=${imagePath}, position=`, imagePos);
  }, [imagePath, imagePos, src]);
  
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
  
  // Open fullscreen view
  const openFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Opening fullscreen for:", imagePath);
    setFullscreenView(true);
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
              onClick={openFullscreen}
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

// Update the NodeMesh component to handle widgets correctly
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
  
  // Debug widgets
  useEffect(() => {
    if (node.widgets && node.widgets.length > 0) {
      console.log(`Node ${node.id} has ${node.widgets.length} widgets:`, node.widgets);
    }
  }, [node]);
  
  // Filter widgets for image files (handle both local files and URLs)
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
  const imageWidgets = node.widgets?.filter(widget => {
    if (!widget) return false;
    // Check if it's a URL with image extension or just a local image file
    if (typeof widget === 'string') {
      if (widget.startsWith('http')) {
        return imageExtensions.some(ext => widget.toLowerCase().includes(ext));
      }
      return imageExtensions.some(ext => widget.toLowerCase().endsWith(ext));
    }
    return false;
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
      {allImages.map((imgSrc, index) => {
        const angle = (index / allImages.length) * Math.PI * 2; // Distribute evenly in a circle
        const radius = 2.0; // Increased radius for better visibility
        const widgetPosition: [number, number, number] = [
          node.position[0] + Math.cos(angle) * radius,
          node.position[1] + Math.sin(angle) * radius,
          node.position[2]
        ];
        return (
          <ImagePreview 
            key={`${node.id}-img-${index}`}
            src={imgSrc} 
            position={widgetPosition} 
            index={index} 
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

function GraphScene({ data }: { data: KnowledgeNode }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => build3DLayout(data), [data]);
  const idToNode = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  
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
      
      {/* Rest of your rendering code */}
      {edges.map((e, idx) => {
        // Edge rendering code
      })}
      
      {nodes.map((n) => (
        <NodeMesh 
          key={n.id} 
          node={n} 
          onClick={(id) => {
            // Allow toggling focus off by clicking the same node again
            setFocusId(prevId => prevId === id ? null : id);
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
        </Canvas>
      </div>
    </section>
  );
}