import { useState, MouseEvent } from "react";
import { KnowledgeTree, type KnowledgeNode } from "@/components/KnowledgeTree";
import { SEO } from "@/components/SEO";

const sampleData: KnowledgeNode = {
  node: "Keynote",
  weight: 8,
  children: [
    {
      node: "Introduction",
      weight: 5,
      children: [
        { node: "Context", weight: 3 },
        { node: "Problem", weight: 4 },
      ],
    },
    {
      node: "Main Ideas",
      weight: 7,
      children: [
        { node: "Idea A", weight: 6, children: [{ node: "Example A1", weight: 3 }] },
        { node: "Idea B", weight: 6, children: [{ node: "Example B1", weight: 2 }, { node: "Example B2", weight: 2 }] },
      ],
    },
    {
      node: "Conclusion",
      weight: 6,
      children: [
        { node: "Summary", weight: 4 },
        { node: "Q&A", weight: 5 },
      ],
    },
  ],
};

const Index = () => {
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
        title="Knowledge Tree Presenter – Top-Down JSON Tree"
        description="Visualize your talk's structure as a top-down knowledge tree with weighted nodes and helpful tooltips."
      />
      <header className="relative">
        <div
          onMouseMove={onMove}
          className="relative mx-auto max-w-5xl px-6 pt-14 pb-8"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background: `radial-gradient(600px 300px at ${spot.x}% ${spot.y}%, hsl(var(--ring) / 0.12), transparent 60%)`,
            }}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Knowledge Tree Presenter
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            A clear, top-down view of your JSON-defined knowledge tree with tooltips on each node.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <KnowledgeTree data={sampleData} />
        <p className="mt-6 text-sm text-muted-foreground">
          JSON schema: <code>{`{ "node": "string", "weight": "number", "children": "KnowledgeNode[]" }`}</code>
        </p>
      </main>
    </>
  );
};

export default Index;
