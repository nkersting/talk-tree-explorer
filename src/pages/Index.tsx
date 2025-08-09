import { useState, MouseEvent } from "react";
import { KnowledgeTree, type KnowledgeNode } from "@/components/KnowledgeTree";
import { SEO } from "@/components/SEO";

const particleData: KnowledgeNode = {
  node: "Particle Physics",
  weight: 10,
  children: [
    {
      node: "Historical Particle Physics",
      weight: 10,
      children: [
        {
          node: "Present Particle Physics",
          weight: 10,
          children: [
            {
              node: "Future Particle Physics",
              weight: 10,
              children: [
                {
                  node: "Quantum Gravity",
                  weight: 2,
                  children: []
                },
                {
                  node: "DM/DE",
                  weight: 2,
                  children: []
                },
                {
                  node: "TOE",
                  weight: 2,
                  children: []
                }
              ]
            },
            {
              node: "Gravity",
              weight: 5,
              children: [
                {
                  node: "Einstein",
                  weight: 3,
                  children: []
                },
                {
                  node: "LIGO",
                  weight: 2,
                  children: []
                }
              ]
            },
            {
              node: "Standard Model",
              weight: 5,
              children: [
                {
                  node: "SU(2)xSU(3)xU(1)",
                  weight: 3,
                  children: []
                },
                {
                  node: "Higgs",
                  weight: 3,
                  children: []
                },
                {
                  node: "Puzzles",
                  weight: 3,
                  children: []
                }
              ]
            },
            {
              node: "Mechanics",
              weight: 3,
              children: []
            }
          ]
        },
        {
          node: "Discovery Timeline",
          weight: 7,
          children: [
            {
              node: "Discovery of photon",
              weight: 6,
              children: [
                {
                  node: "Discovery of electron",
                  weight: 6,
                  children: [
                    {
                      node: "Discovery of neutron",
                      weight: 6,
                      children: [
                        {
                          node: "neutron experiment",
                          weight: 3,
                          children: [
                            {
                              node: "discoverer",
                              weight: 2,
                              children: []
                            },
                            {
                              node: "backdrop",
                              weight: 2,
                              children: []
                            }
                          ]
                        }
                      ]
                    },
                    {
                      node: "electron experiment",
                      weight: 3,
                      children: [
                        {
                          node: "discoverer",
                          weight: 2,
                          children: []
                        },
                        {
                          node: "backdrop",
                          weight: 2,
                          children: []
                        },
                        {
                          node: "positron prediction",
                          weight: 1,
                          children: []
                        }
                      ]
                    }
                  ]
                },
                {
                  node: "early experiments",
                  weight: 3,
                  children: [
                    {
                      node: "ancient times",
                      weight: 2,
                      children: []
                    },
                    {
                      node: "Newton",
                      weight: 2,
                      children: []
                    },
                    {
                      node: "Huygen",
                      weight: 2,
                      children: []
                    },
                    {
                      node: "Fresnel",
                      weight: 2,
                      children: []
                    }
                  ]
                },
                {
                  node: "particle experiment",
                  weight: 3,
                  children: []
                }
              ]
            }
          ]
        },
        {
          node: "Historical Backdrop",
          weight: 6,
          children: [
            {
              node: "Europe",
              weight: 2,
              children: []
            },
            {
              node: "Asia",
              weight: 2,
              children: []
            },
            {
              node: "US",
              weight: 3,
              children: []
            }
          ]
        }
      ]
    }
  ]
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
        title="Particle Physics Knowledge Tree – Bottom-Up"
        description="An upward-growing knowledge tree: explore Particle Physics from the root up with weighted nodes and tooltips."
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
            Particle Physics Knowledge Tree
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            A clear, bottom-up view of your JSON-defined knowledge tree with tooltips on each node.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <KnowledgeTree data={particleData} />
        <p className="mt-6 text-sm text-muted-foreground">
          JSON schema: <code>{`{ "node": "string", "weight": "number", "children": "KnowledgeNode[]" }`}</code>
        </p>
      </main>
    </>
  );
};

export default Index;
