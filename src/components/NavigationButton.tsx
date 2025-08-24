import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocus } from "@/contexts/FocusContext";

export function NavigationButton() {
  const { focusNextNode, bfsTraversal, currentBfsIndex } = useFocus();

  const isDisabled = bfsTraversal.length === 0;
  const currentNode = currentBfsIndex >= 0 ? bfsTraversal[currentBfsIndex] : null;
  const nextIndex = (currentBfsIndex + 1) % bfsTraversal.length;
  const nextNode = bfsTraversal[nextIndex];

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-20">
      <div className="flex flex-col items-center gap-2">
        <Button
          onClick={focusNextNode}
          disabled={isDisabled}
          size="lg"
          className="h-12 w-12 rounded-full bg-primary/90 hover:bg-primary shadow-lg backdrop-blur-sm border border-white/20"
          aria-label="Focus next node"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        {!isDisabled && (
          <div className="text-xs text-muted-foreground text-center bg-background/80 backdrop-blur-sm px-2 py-1 rounded border border-border">
            {currentBfsIndex + 1}/{bfsTraversal.length}
            {nextNode && (
              <div className="font-medium text-foreground truncate max-w-20">
                {nextNode}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}