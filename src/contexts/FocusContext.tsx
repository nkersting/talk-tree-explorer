import { createContext, ReactNode, useContext, useState, useMemo } from 'react';
import type { KnowledgeNode } from '../types';

interface FocusContextType {
  focusedNodeLabel: string | null;
  setFocusedNodeLabel: (label: string | null) => void;
  focusSource: 'graph2d' | 'graph3d' | null;
  setFocusSource: (source: 'graph2d' | 'graph3d' | null) => void;
  bfsTraversal: string[];
  currentBfsIndex: number;
  focusNextNode: () => void;
  initializeBfsTraversal: (data: KnowledgeNode) => void;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

export function useFocus() {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
}

function createBfsTraversal(data: KnowledgeNode): string[] {
  const result: string[] = [];
  const queue: KnowledgeNode[] = [data];
  
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node.node);
    
    if (node.children) {
      queue.push(...node.children);
    }
  }
  
  return result;
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focusedNodeLabel, setFocusedNodeLabel] = useState<string | null>(null);
  const [focusSource, setFocusSource] = useState<'graph2d' | 'graph3d' | null>(null);
  const [bfsTraversal, setBfsTraversal] = useState<string[]>([]);
  const [currentBfsIndex, setCurrentBfsIndex] = useState<number>(-1);

  const initializeBfsTraversal = (data: KnowledgeNode) => {
    const traversal = createBfsTraversal(data);
    setBfsTraversal(traversal);
    setCurrentBfsIndex(-1);
  };

  const focusNextNode = () => {
    if (bfsTraversal.length === 0) return;
    
    const nextIndex = (currentBfsIndex + 1) % bfsTraversal.length;
    const nextNodeLabel = bfsTraversal[nextIndex];
    
    setCurrentBfsIndex(nextIndex);
    setFocusedNodeLabel(nextNodeLabel);
    setFocusSource('graph3d');
  };

  return (
    <FocusContext.Provider value={{ 
      focusedNodeLabel, 
      setFocusedNodeLabel,
      focusSource,
      setFocusSource,
      bfsTraversal,
      currentBfsIndex,
      focusNextNode,
      initializeBfsTraversal
    }}>
      {children}
    </FocusContext.Provider>
  );
}