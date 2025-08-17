// types.ts (at project root or in src/types.ts)
export type Widget = {
  name: string;
  title?: string;
  subtitle?: string;
  notes: string;
  [key: string]: any;
};

export type KnowledgeNode = {
  node: string;
  weight?: number;
  children?: KnowledgeNode[];
  widgets?: Widget[];
};