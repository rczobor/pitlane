import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type RemovableCar = { listingId: Id<"listings">; title: string; status: "available" | "removed" };

// The two ways a car leaves the board. Marking the ad removed keeps everything and only
// hides the car; deleting ("remove") drops the user's take on it.
export type CarExit = "markRemoved" | "remove";

const copy = {
  markRemoved: {
    title: "Mark this ad as removed?",
    body: "leaves the board, and re-checks stop. Nothing is deleted: its tier, notes, key specs, price history and photos stay. “Show removed” on the board lists it, and “Put back on board” on its page undoes this.",
    confirm: "Mark ad as removed",
    cancel: "Cancel",
    failed: "Marking failed. Try again.",
  },
  remove: {
    title: "Delete this car?",
    body: "comes off your board, with its tier, notes, key specs, price history and photos. This can't be undone; adding the listing again starts it over in Watching.",
    confirm: "Delete",
    cancel: "Keep it",
    failed: "Deleting failed. Try again.",
  },
} satisfies Record<CarExit, Record<string, string>>;

// Deleting a car whose ad is gone: the listing can't be added again.
const goneBody =
  "comes off your board, with its tier, notes, key specs, price history and photos. The ad is gone, so this can't be undone.";

// `car` outlives `open`, so the text stays while the dialog animates closed.
export function RemoveCarDialog({
  kind = "remove",
  car,
  open,
  onOpenChange,
  onLeaving,
  onRemoved,
}: {
  kind?: CarExit;
  car: RemovableCar | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set before a removal is sent and cleared if it fails: the car's queries turn null before it resolves. */
  onLeaving?: (leaving: boolean) => void;
  onRemoved?: () => Promise<void> | void;
}) {
  const remove = useMutation(api.board.remove);
  const markRemoved = useMutation(api.board.markRemoved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = copy[kind];

  const confirm = async () => {
    if (!car) return;
    setPending(true);
    setError(null);
    if (kind === "remove") onLeaving?.(true);
    try {
      await (kind === "remove" ? remove : markRemoved)({ listingId: car.listingId });
      onOpenChange(false);
      await onRemoved?.();
    } catch (caught) {
      if (kind === "remove") onLeaving?.(false);
      setError(caught instanceof ConvexError ? String(caught.data.message) : text.failed);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-request would look like a cancel while the change still goes through.
        if (pending && !next) return;
        setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {car?.title} {kind === "remove" && car?.status === "removed" ? goneBody : text.body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{text.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant={kind === "remove" ? "destructive" : "default"}
            disabled={pending}
            onClick={() => void confirm()}
          >
            {text.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
