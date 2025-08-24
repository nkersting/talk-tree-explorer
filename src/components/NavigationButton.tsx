import { ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocus } from "@/contexts/FocusContext";

export function NavigationButton() {
  const { focusNextNode, focusPreviousNode, bfsTraversal, currentBfsIndex } = useFocus();

  const isDisabled = bfsTraversal.length === 0;
  const currentNode = currentBfsIndex >= 0 ? bfsTraversal[currentBfsIndex] : null;
  const nextIndex = (currentBfsIndex + 1) % bfsTraversal.length;
  const nextNode = bfsTraversal[nextIndex];

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-20">
      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-col gap-2">
          <Button
            onClick={focusPreviousNode}
            disabled={isDisabled}
            size="lg"
            className="h-12 w-12 rounded-full bg-primary/90 hover:bg-primary shadow-lg backdrop-blur-sm border border-white/20"
            aria-label="Focus previous node"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            onClick={focusNextNode}
            disabled={isDisabled}
            size="lg"
            className="h-12 w-12 rounded-full bg-primary/90 hover:bg-primary shadow-lg backdrop-blur-sm border border-white/20"
            aria-label="Focus next node"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        {!isDisabled && (
          <div className="text-xs text-muted-foreground text-center bg-background/80 backdrop-blur-sm px-3 py-2 rounded border border-border min-w-32">
            <div className="font-semibold text-foreground mb-1">
              {currentBfsIndex + 1}/{bfsTraversal.length}
            </div>
            {nextNode && (
              <div className="font-medium text-foreground text-wrap max-w-28 leading-tight">
                {nextNode}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}