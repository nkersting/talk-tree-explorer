import { useState, MouseEvent, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import knowledgeData from "../../data/knowledge.json";
import { Graph3D } from "@/components/Graph3D";
import { SEO } from "@/components/SEO";
import { KnowledgeNode } from "../types"; 
import { KnowledgeTree } from "@/components/KnowledgeTree";
import { FocusProvider, useFocus } from '@/contexts/FocusContext';
import { NavigationButton } from "@/components/NavigationButton";


const particleData = knowledgeData.knowledgeTree as KnowledgeNode;

function IndexContent() {
  const { initializeBfsTraversal } = useFocus();
  
  useEffect(() => {
    initializeBfsTraversal(particleData);
  }, []);

  const [spot, setSpot] = useState<{ x: number; y: number }>({ x: 50, y: 50 });

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSpot({ x, y });
  };

  return (
    <>
      <SEO
        title={`${knowledgeData["seo"].title}`}
        description={`${knowledgeData["seo"].description}`}
      />
      <header className="relative">
        <div
          onMouseMove={onMove}
          className="relative mx-auto max-w-5xl px-6 pt-8 pb-4"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background: `radial-gradient(600px 300px at ${spot.x}% ${spot.y}%, hsl(var(--ring) / 0.12), transparent 60%)`,
            }}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            {knowledgeData["seo"].title}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
          {knowledgeData["seo"].description}          </p>
        </div>
      </header>
      <main className="relative min-h-screen h-[calc(100vh+8rem)]">
        <ReactFlowProvider>
          <div className="absolute top-4 left-4 w-96 h-80 bg-background border border-border rounded-lg shadow-lg z-10 overflow-hidden">
            <KnowledgeTree data={particleData} />
          </div>
        </ReactFlowProvider>
        <div className="w-full h-full">
          <Graph3D data={particleData} />
        </div>
        <NavigationButton />
      </main>
    </>
  );
}

const Index = () => {
  return (
    <FocusProvider>
      <IndexContent />
    </FocusProvider>
  );
};

export default Index;
