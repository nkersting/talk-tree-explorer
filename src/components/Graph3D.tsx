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
import { Switch } from "@/components/ui/switch";

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

  // Improved spacing parameters to prevent overlaps (halved for shorter links)
  const layerDistance = 7.5; // Half the distance between depth levels
  const minNodeDistance = 2; // Half the minimum distance between any two nodes
  const baseRadius = 3; // Half the base radius for first level
  
  function countNodesAtDepth(node: KnowledgeNode, targetDepth: number, currentDepth = 0): number {
    if (currentDepth === targetDepth) return 1;
    if (!node.children || currentDepth >= targetDepth) return 0;
    
    return node.children.reduce((sum, child) => 
      sum + countNodesAtDepth(child, targetDepth, currentDepth + 1), 0);
  }
  
  function calculateOptimalRadius(nodeCount: number, minDistance: number, averageNodeSize = 1): number {
    if (nodeCount <= 1) return 0;
    // Calculate radius needed to fit nodeCount nodes with minDistance between them
    // Scale by average node size - smaller nodes get shorter links
    const sizeScale = 0.5 + (averageNodeSize * 0.8); // Range from 0.5x to 1.3x
    const circumference = nodeCount * minDistance * 2 * sizeScale;
    return Math.max(baseRadius * sizeScale, circumference / (2 * Math.PI));
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
        // Calculate average node size for this group (including parent and siblings)
        const parentWeight = normalizeWeight(n.weight);
        const siblingWeights = (n.children || []).map(child => normalizeWeight(child.weight));
        const averageSize = ([parentWeight, ...siblingWeights].reduce((sum, w) => sum + w, 0)) / (siblingWeights.length + 1);
        
        const radius = calculateOptimalRadius(totalSiblings, minNodeDistance, 0.2 * averageSize * normalizeWeight(n.weight) * normalizeWeight(n.weight));
        const angle = (siblingIndex / totalSiblings) * Math.PI * 15; // Wider spread 
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

// Debug indicator to show positions - make more visible
function DebugMarker({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} scale={[0.3, 0.3, 0.3]}>
      <sphereGeometry />
      <meshBasicMaterial color="lime" />
    </mesh>
  );
}

// YouTube Preview component
function YouTubePreview({ 
  url, 
  position, 
  index, 
  notes,
  widget,
  onWidgetClick 
}: { 
  url: string; 
  position: [number, number, number]; 
  index: number;
  notes?: string;
  widget: Widget;
  onWidgetClick: (widget: Widget) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  
  // Use the position passed from parent
  const previewPos: [number, number, number] = position;
  
  // Get YouTube video ID
  const getYouTubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };
  
  const videoId = getYouTubeVideoId(url);
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';
  
  // Handle visibility based on camera position
  const { camera } = useThree();
  useFrame(() => {
    if (!previewRef.current) return;
    
    // Calculate distance to camera
    const distance = new THREE.Vector3(...previewPos).distanceTo(camera.position);
    
    // Only show previews that are reasonably close to the camera
    if (distance < 30) {
      previewRef.current.style.opacity = "1";
      setIsVisible(true);
    } else {
      previewRef.current.style.opacity = "0";
      setIsVisible(false);
    }
  });
  
  // Open side panel view  
  const openSidePanel = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Opening side panel for YouTube video:", url);
    onWidgetClick(widget);
  };
  
  return (
    <>
      {/* Debug sphere to see where the preview should be */}
      <DebugMarker position={previewPos} />
      
      {/* The YouTube preview */}
      <group position={previewPos}>
        <Html
          center
          transform
          occlude={false}
          distanceFactor={10}
          position={[0, 0, 0]}
          style={{ 
            width: "60px", 
            height: "45px", // 4:3 aspect ratio for YouTube thumbnails
            transform: "rotateY(180deg)"
          }}
        >
          <div 
            ref={previewRef}
            style={{
              width: "100%",
              height: "100%",
              position: "relative",
              cursor: "pointer",
              borderRadius: "5px",
              opacity: isVisible ? 1 : 0,
              transition: "opacity 0.3s",
              overflow: "hidden",
              border: "2px solid #ff0000", // YouTube red border
              boxShadow: "0 0 10px rgba(255,0,0,0.7)",
              transform: "scaleX(-1)", // Fix inversion
              backgroundColor: "#000"
            }}
            onClick={openSidePanel}
          >
            {thumbnailUrl ? (
              <>
                <img 
                  src={thumbnailUrl}
                  alt="YouTube thumbnail"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)" // Fix inversion
                  }}
                />
                {/* Play button overlay */}
                <div style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "20px",
                  height: "20px",
                  backgroundColor: "rgba(255,0,0,0.8)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "8px",
                  fontWeight: "bold"
                }}>
                  ▶
                </div>
              </>
            ) : (
              <div style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#ff0000",
                color: "white",
                fontSize: "8px",
                textAlign: "center"
              }}>
                YouTube<br/>Video
              </div>
            )}
          </div>
        </Html>
      </group>
    </>
  );
}

// Website Preview component for URL widgets
function WebsitePreview({ 
  url, 
  position, 
  index, 
  notes,
  widget,
  onWidgetClick 
}: { 
  url: string; 
  position: [number, number, number]; 
  index: number;
  notes?: string;
  widget: Widget;
  onWidgetClick: (widget: Widget) => void;
}) {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Use the position passed from parent
  const imagePos: [number, number, number] = position;
  
  // Get preview image from widget's preview attribute
  useEffect(() => {
    if (widget.preview) {
      // Resolve preview image path
      const imagePath = widget.preview.startsWith('http') 
        ? widget.preview 
        : widget.preview.startsWith('/') 
          ? widget.preview 
          : `/data/${widget.preview}`;
      setPreviewImageUrl(imagePath);
    }
  }, [widget.preview]);
  
  // Handle image loading
  const handleImageLoad = () => {
    console.log(`✅ Website preview loaded: ${url}`);
    setIsVisible(true);
    setImageError(false);
  };
  
  const handleImageError = () => {
    console.error(`❌ Failed to load website preview: ${url}`);
    setImageError(true);
  };
  
  // Handle visibility based on camera position
  const { camera } = useThree();
  useFrame(() => {
    if (!imageRef.current) return;
    
    // Calculate distance to camera
    const distance = new THREE.Vector3(...imagePos).distanceTo(camera.position);
    
    // Show images that are reasonably close to the camera - increased range for better visibility
    if (distance < 50) {
      imageRef.current.style.opacity = "1";
      // Also ensure it's initially visible if this is the first frame
      if (!isVisible) {
        setIsVisible(true);
      }
    } else {
      imageRef.current.style.opacity = "0.3"; // Keep slightly visible even at distance
    }
  });
  
  // Open sidebar when clicked
  const openSidebar = (e: React.MouseEvent) => {
    e.stopPropagation();
    onWidgetClick(widget);
  };
  
  return (
    <>
      {/* Website Screenshot Preview */}
      <Html
        key={`website-${index}`}
        position={imagePos}
        transform
        occlude
        sprite
      >
        <div 
          ref={imageRef}
          className="website-preview-container"
          style={{
            width: '120px',
            height: '80px',
            cursor: 'pointer',
            opacity: 0,
            transition: 'opacity 0.3s ease',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '2px solid rgba(255, 255, 255, 0.8)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            background: 'rgba(255, 255, 255, 0.95)',
          }}
          onClick={openSidebar}
        >
          {previewImageUrl && !imageError ? (
            <img
              src={previewImageUrl}
              alt="Website preview"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '6px',
              }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              fontSize: '11px',
              textAlign: 'center',
              padding: '8px',
            }}>
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>🌐</div>
              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Website</div>
              <div style={{ fontSize: '9px', opacity: 0.9, lineHeight: '1.2' }}>
                {url.length > 25 ? url.substring(8, 25) + '...' : url.replace(/^https?:\/\//, '')}
              </div>
              <div style={{ fontSize: '8px', opacity: 0.7, marginTop: '4px' }}>Click to open</div>
            </div>
          )}
          
          {/* Hover overlay */}
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 0.2s ease',
              fontSize: '10px',
              textAlign: 'center',
              padding: '8px',
              borderRadius: '6px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0';
            }}
          >
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>🔗</div>
            <div>Open Website</div>
            {notes && (
              <div style={{ fontSize: '8px', marginTop: '4px', opacity: 0.8 }}>
                {notes.length > 40 ? `${notes.substring(0, 40)}...` : notes}
              </div>
            )}
          </div>
        </div>
      </Html>
    </>
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
    // Still show a placeholder even on error
    setIsVisible(true);
  };
  
  // Handle visibility based on camera position
  const { camera } = useThree();
  useFrame(() => {
    if (!imageRef.current) return;
    
    // Calculate distance to camera
    const distance = new THREE.Vector3(...imagePos).distanceTo(camera.position);
    
    // Always show images when reasonably close - increased range and always visible when loaded
    if (distance < 50) {
      imageRef.current.style.opacity = "1";
      if (!isVisible && !imageError) {
        setIsVisible(true); // Force visibility
      }
    } else {
      imageRef.current.style.opacity = "0.5"; // Still partially visible at distance
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
                opacity: 1, // Always visible - remove conditional opacity
                transition: "opacity 0.3s",
                overflow: "hidden",
                border: "2px solid cyan", // More visible border color
                boxShadow: "0 0 15px rgba(0,255,255,0.7)", // Cyan glow
                transform: "scaleX(-1)",
                backgroundColor: imageError ? "rgba(255,0,0,0.3)" : "rgba(255,255,255,0.1)"
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
  onWidgetClick,
  showOnlyFocusedWidgets = false,
  focusedNodeId
}: { 
  node: Node3D; 
  onClick: (id: string) => void;
  isFocused?: boolean;
  onWidgetClick: (widget: Widget) => void;
  showOnlyFocusedWidgets?: boolean;
  focusedNodeId?: string | null;
}) {
  const primary = useCssHsl("--primary", "hsl(210 100% 70%)");
  const ring = useCssHsl("--ring", "hsl(262 90% 66%)");
  const focusColor = "hsl(210 80% 90%)"; // Very light blue for focused nodes
  const focusEmissive = "hsl(210 70% 85%)"; // Light blue for glow effect
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
  
  // Helper function to detect YouTube URLs
  const isYouTubeUrl = (url: string) => {
    return url.includes('youtube.com/watch') || 
           url.includes('youtu.be/') || 
           url.includes('youtube.com/embed/') ||
           url.includes('youtube.com/v/');
  };

  // Helper function to get YouTube video ID
  const getYouTubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

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

  // Filter widgets for YouTube videos
  const youtubeWidgets = node.widgets?.filter(widget => {
    if (!widget) return false;
    const widgetName = widget.name;
    if (!widgetName) return false;
    return isYouTubeUrl(widgetName);
  }) || [];
  
  const allWidgets = [...imageWidgets, ...youtubeWidgets];
  
  // Determine if widgets should be visible
  const shouldShowWidgets = !showOnlyFocusedWidgets || (showOnlyFocusedWidgets && node.id === focusedNodeId);
  
  return (
    <group 
      position={node.position} 
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
      scale={[pulseScale, pulseScale, pulseScale]}
    >
      {/* Main node sphere */}
      <mesh castShadow receiveShadow scale={[scale, scale, scale]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          color={isFocused ? focusColor : primary} 
          emissive={isFocused ? "hsl(220 100% 50%)" : ring}
          emissiveIntensity={isFocused ? 1.2 : 0.15} 
          metalness={isFocused ? 0.3 : 0.1} 
          roughness={isFocused ? 0.2 : 0.4} 
        />
      </mesh>
      
      {/* Glow halo for focused nodes */}
      {isFocused && (
        <mesh scale={[scale * 1.8, scale * 1.8, scale * 1.8]}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial 
            color="hsl(220 100% 60%)"
            transparent
            opacity={0.3}
            side={2} // DoubleSide
          />
        </mesh>
      )}
      <Html center distanceFactor={6} style={{ pointerEvents: "none" }}>
        <div style={{
          background: isFocused ? "rgba(30, 144, 255, 0.8)" : "hsl(var(--card) / 0.8)",
          color: isFocused ? "white" : textColor,
          border: isFocused ? "1px solid rgba(135, 206, 250, 0.8)" : "1px solid hsl(var(--border))",
          borderRadius: 8,
          padding: "2px 6px",
          fontSize: 12,
          whiteSpace: "nowrap",
          fontWeight: isFocused ? "bold" : "normal",
          boxShadow: isFocused ? "0 0 8px rgba(30, 144, 255, 0.5)" : "none",
        }}>
          {node.label}
        </div>
      </Html>
      
      {/* Render widget previews symmetrically around the node */}
      {shouldShowWidgets && allWidgets.map((widget, index) => {
        const angle = (index / allWidgets.length) * Math.PI * 2; // Distribute evenly in a circle
        const radius = 2.0; // Radius around the node
        const widgetPosition: [number, number, number] = [
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0 
        ];
        
        // Extract the widget name from the widget object - widgets are now always objects  
        const widgetSrc = widget.name;
        
        console.log(`Node ${node.id} at position ${node.position} has widget at position ${widgetPosition}`);
        
        // Extract notes from widget object
        const widgetNotes = widget.notes || '';
        
        // Check if it's a YouTube video, website URL, or image
        const isYoutube = isYouTubeUrl(widgetSrc);
        const isWebsiteUrl = widgetSrc.startsWith('http://') || widgetSrc.startsWith('https://');
        
        console.log(`Processing widget for ${node.label}: "${widgetSrc}" - isYoutube: ${isYoutube}, isWebsiteUrl: ${isWebsiteUrl}`);
        
        if (isYoutube) {
          return (
            <YouTubePreview 
              key={`${node.id}-youtube-${index}`}
              url={widgetSrc} 
              position={widgetPosition} 
              index={index}
              notes={widgetNotes}
              widget={widget}
              onWidgetClick={onWidgetClick}
            />
          );
        } else if (isWebsiteUrl && !isYoutube) {
          return (
            <WebsitePreview 
              key={`${node.id}-website-${index}`}
              url={widgetSrc} 
              position={widgetPosition} 
              index={index}
              notes={widgetNotes}
              widget={widget}
              onWidgetClick={onWidgetClick}
            />
          );
        } else {
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
        }
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

// Component to render an edge with tapered thickness based on node weights
function TaperedEdge({ 
  sourcePos, 
  targetPos, 
  sourceWeight,
  targetWeight,
  color, 
  opacity, 
  isFocused 
}: {
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  sourceWeight?: number;
  targetWeight?: number;
  color: string;
  opacity: number;
  isFocused: boolean;
}) {
  // Calculate line thickness based on node weights
  const sourceThickness = normalizeWeight(sourceWeight) * 0.35 + 0.01; 
  const targetThickness = normalizeWeight(targetWeight) * 0.35 + 0.01; 
  
  // Create tapered line geometry
  const segments = 20; // Number of segments for smooth tapering
  const points = [];
  const radii = [];
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Interpolate position along the line from source to target
    points.push(new THREE.Vector3(
      sourcePos[0] + (targetPos[0] - sourcePos[0]) * t,
      sourcePos[1] + (targetPos[1] - sourcePos[1]) * t,
      sourcePos[2] + (targetPos[2] - sourcePos[2]) * t
    ));
    // Interpolate thickness from source to target
    const thickness = sourceThickness + (targetThickness - sourceThickness) * t;
    radii.push(thickness * (isFocused ? 2 : 1));
  }
  
  // Create tube geometry for tapered line
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeometry = new THREE.TubeGeometry(curve, segments, 0.1, 8, false);
  
  // Modify the tube geometry to have variable radius
  const positionAttribute = tubeGeometry.attributes.position;
  for (let i = 0; i < positionAttribute.count; i++) {
    const segmentIndex = Math.floor(i / 9); // 9 vertices per ring (8 sides + center)
    const radius = radii[Math.min(segmentIndex, radii.length - 1)] || 0.05;
    
    // Get the vertex position
    const x = positionAttribute.getX(i);
    const y = positionAttribute.getY(i);
    const z = positionAttribute.getZ(i);
    
    // Calculate distance from the curve center for this vertex
    const segmentT = segmentIndex / segments;
    const curvePoint = curve.getPoint(segmentT);
    const dx = x - curvePoint.x;
    const dy = y - curvePoint.y;
    const dz = z - curvePoint.z;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    // Scale the vertex position based on the desired radius
    if (distFromCenter > 0) {
      const scale = radius / 0.1; // 0.1 is the default tube radius
      positionAttribute.setXYZ(i,
        curvePoint.x + dx * scale,
        curvePoint.y + dy * scale,
        curvePoint.z + dz * scale
      );
    }
  }
  
  positionAttribute.needsUpdate = true;
  tubeGeometry.computeVertexNormals();
  
  return (
    <mesh>
      <primitive object={tubeGeometry} />
      <meshStandardMaterial 
        color={color}
        transparent 
        opacity={opacity}
        metalness={0.2}
        roughness={0.8}
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
    if (focusedNodeLabel) {
      const matchingId = labelToId.get(focusedNodeLabel);
      if (matchingId) {
        setFocusId(matchingId);
      }
    } else {
      setFocusId(null);
    }
  }, [focusedNodeLabel, labelToId]);
  
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
    // Check if widget name is a URL
    const isUrl = widget.name.startsWith('http://') || widget.name.startsWith('https://');
    
    if (isUrl) {
      // Open URL in new tab
      window.open(widget.name, '_blank');
    } else {
      // Open side panel for non-URL widgets
      setSelectedWidget(widget);
      setSidePanelOpen(true);
    }
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
        maxDistance={1000}
        dampingFactor={0.1}
        rotateSpeed={0.7}
        panSpeed={0.5}
        zoomSpeed={1.0}
        makeDefault
      />
      
      {/* Render edges connecting nodes with tapered thickness */}
      {edges.map((e, idx) => {
        const sourceNode = idToNode.get(e.source);
        const targetNode = idToNode.get(e.target);
        if (!sourceNode || !targetNode) return null;
        
        const isFocusedEdge = focusId === e.source || focusId === e.target;
        const lineColor = isFocusedEdge ? focusedEdgeColor : muted;
        
        return (
          <TaperedEdge
            key={`edge-${idx}`}
            sourcePos={sourceNode.position}
            targetPos={targetNode.position}
            sourceWeight={sourceNode.weight}
            targetWeight={targetNode.weight}
            color={lineColor}
            opacity={isFocusedEdge ? 0.7 : 0.3}
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
  const [showOnlyFocusedWidgets, setShowOnlyFocusedWidgets] = useState(true);
  
  return (
    <>
      <section aria-label="3D knowledge tree" className="w-full h-[800px] mt-10 relative">
        {/* Widget visibility toggle */}
        <div className="absolute top-4 right-4 z-10 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
          <div className="flex items-center space-x-2">
            <Switch
              id="widget-visibility"
              checked={showOnlyFocusedWidgets}
              onCheckedChange={setShowOnlyFocusedWidgets}
            />
            <label 
              htmlFor="widget-visibility" 
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              Focus mode
            </label>
          </div>
        </div>
        
        <div className="w-full h-full rounded-lg border border-border bg-card overflow-hidden">
          <Canvas shadows camera={{ position: [0, 5, -15], fov: 50 }}>
            <color attach="background" args={[card] as any} />
            <GraphSceneWithDrawer 
              data={data} 
              setSidePanelOpen={setSidePanelOpen}
              setSelectedWidget={setSelectedWidget}
              showOnlyFocusedWidgets={showOnlyFocusedWidgets}
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
                {/* Check if it's a YouTube video and render accordingly */}
                {selectedWidget.name.includes('youtube.com') || selectedWidget.name.includes('youtu.be') ? (
                  <div className="w-full">
                    <iframe 
                      src={(() => {
                        const getYouTubeVideoId = (url: string) => {
                          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                          const match = url.match(regExp);
                          return (match && match[2].length === 11) ? match[2] : null;
                        };
                        const videoId = getYouTubeVideoId(selectedWidget.name);
                        return videoId ? `https://www.youtube.com/embed/${videoId}` : selectedWidget.name;
                      })()}
                      title="YouTube video"
                      className="w-full aspect-video rounded-lg border border-border"
                      allowFullScreen
                    />
                  </div>
                ) : selectedWidget.name.startsWith('http://') || selectedWidget.name.startsWith('https://') ? (
                  /* Website iframe for URLs */
                  <div className="w-full">
                    <iframe 
                      src={selectedWidget.name}
                      title="Website"
                      className="w-full h-96 rounded-lg border border-border"
                      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    />
                  </div>
                ) : (
                  /* Full-size widget image */
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
                )}
                
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
  setSelectedWidget,
  showOnlyFocusedWidgets 
}: { 
  data: KnowledgeNode;
  setSidePanelOpen: (open: boolean) => void;
  setSelectedWidget: (widget: Widget | null) => void;
  showOnlyFocusedWidgets: boolean;
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
    if (focusedNodeLabel) {
      const matchingId = labelToId.get(focusedNodeLabel);
      if (matchingId) {
        setFocusId(matchingId);
      }
    } else {
      setFocusId(null);
    }
  }, [focusedNodeLabel, labelToId]);
  
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
    // Open side panel for all widgets (including URLs)
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
        maxDistance={1000}
        dampingFactor={0.1}
        rotateSpeed={0.7}
        panSpeed={0.5}
        zoomSpeed={1.0}
        makeDefault
      />
      
      {/* Render edges connecting nodes with tapered thickness */}
      {edges.map((e, idx) => {
        const sourceNode = idToNode.get(e.source);
        const targetNode = idToNode.get(e.target);
        if (!sourceNode || !targetNode) return null;
        
        // Explicitly check for null focusId to ensure proper unfocusing
        const isFocusedEdge = focusId !== null && (focusId === e.source || focusId === e.target);
        const lineColor = isFocusedEdge ? focusedEdgeColor : muted;
        
        return (
          <TaperedEdge
            key={`edge-${idx}`}
            sourcePos={sourceNode.position}
            targetPos={targetNode.position}
            sourceWeight={sourceNode.weight}
            targetWeight={targetNode.weight}
            color={lineColor}
            opacity={isFocusedEdge ? 0.7 : 0.3}
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
          showOnlyFocusedWidgets={showOnlyFocusedWidgets}
          focusedNodeId={focusId}
        />
      ))}
    </>
  );
}