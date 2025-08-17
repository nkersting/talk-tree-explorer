import { createContext, useContext, useState, ReactNode } from 'react';

interface FocusContextType {
  focusedNodeLabel: string | null;
  setFocusedNodeLabel: (label: string | null) => void;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focusedNodeLabel, setFocusedNodeLabel] = useState<string | null>(null);

  return (
    <FocusContext.Provider value={{ focusedNodeLabel, setFocusedNodeLabel }}>
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus() {
  const context = useContext(FocusContext);
  if (context === undefined) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
}