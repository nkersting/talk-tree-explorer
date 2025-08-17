// types.ts (at project root or in src/types.ts)
export type KnowledgeNode = {
  node: string;
  weight?: number;
  children?: KnowledgeNode[];
  widgets?: (string | { name: string; notes: string; [key: string]: any })[];
};