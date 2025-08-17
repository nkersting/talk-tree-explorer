import { createContext, ReactNode, useContext, useState } from 'react';

interface FocusContextType {
  focusedNodeLabel: string | null;
  setFocusedNodeLabel: (label: string | null) => void;
  focusSource: 'graph2d' | 'graph3d' | null;
  setFocusSource: (source: 'graph2d' | 'graph3d' | null) => void;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

export function useFocus() {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focusedNodeLabel, setFocusedNodeLabel] = useState<string | null>(null);
  const [focusSource, setFocusSource] = useState<'graph2d' | 'graph3d' | null>(null);

  return (
    <FocusContext.Provider value={{ 
      focusedNodeLabel, 
      setFocusedNodeLabel,
      focusSource,
      setFocusSource
    }}>
      {children}
    </FocusContext.Provider>
  );
}