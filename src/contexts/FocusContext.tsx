import { createContext, ReactNode, useContext, useState, useMemo } from 'react';
import type { KnowledgeNode } from '../types';

interface FocusContextType {
  focusedNodeLabel: string | null;
  setFocusedNodeLabel: (label: string | null) => void;
  focusSource: 'graph2d' | 'graph3d' | null;
  setFocusSource: (source: 'graph2d' | 'graph3d' | null) => void;
  dfsTraversal: string[];
  currentDfsIndex: number;
  focusNextNode: () => void;
  focusPreviousNode: () => void;
  initializeDfsTraversal: (data: KnowledgeNode) => void;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

export function useFocus() {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
}

function createDfsTraversal(data: KnowledgeNode): string[] {
  const result: string[] = [];
  const stack: KnowledgeNode[] = [data];
  
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node.node);
    
    if (node.children) {
      // Add children in reverse order so we visit them in the correct order
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  
  return result;
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focusedNodeLabel, setFocusedNodeLabel] = useState<string | null>(null);
  const [focusSource, setFocusSource] = useState<'graph2d' | 'graph3d' | null>(null);
  const [dfsTraversal, setDfsTraversal] = useState<string[]>([]);
  const [currentDfsIndex, setCurrentDfsIndex] = useState<number>(-1);

  const initializeDfsTraversal = (data: KnowledgeNode) => {
    const traversal = createDfsTraversal(data);
    setDfsTraversal(traversal);
    setCurrentDfsIndex(-1);
  };

  const focusNextNode = () => {
    if (dfsTraversal.length === 0) return;
    
    const nextIndex = (currentDfsIndex + 1) % dfsTraversal.length;
    const nextNodeLabel = dfsTraversal[nextIndex];
    
    setCurrentDfsIndex(nextIndex);
    setFocusedNodeLabel(nextNodeLabel);
    setFocusSource('graph3d');
  };

  const focusPreviousNode = () => {
    if (dfsTraversal.length === 0) return;
    
    const prevIndex = currentDfsIndex <= 0 ? dfsTraversal.length - 1 : currentDfsIndex - 1;
    const prevNodeLabel = dfsTraversal[prevIndex];
    
    setCurrentDfsIndex(prevIndex);
    setFocusedNodeLabel(prevNodeLabel);
    setFocusSource('graph3d');
  };

  return (
    <FocusContext.Provider value={{ 
      focusedNodeLabel, 
      setFocusedNodeLabel,
      focusSource,
      setFocusSource,
      dfsTraversal,
      currentDfsIndex,
      focusNextNode,
      focusPreviousNode,
      initializeDfsTraversal
    }}>
      {children}
    </FocusContext.Provider>
  );
}