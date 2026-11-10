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

export type RemovableCar = { listingId: Id<"listings">; title: string };

// Removing is final: the car's notes, key specs and tier go with it. `car` outlives
// `open`, so the text stays while the dialog animates closed.
export function RemoveCarDialog({
  car,
  open,
  onOpenChange,
  onLeaving,
  onRemoved,
}: {
  car: RemovableCar | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set before the removal is sent and cleared if it fails: the car's queries turn null before it resolves. */
  onLeaving?: (leaving: boolean) => void;
  onRemoved?: () => Promise<void> | void;
}) {
  const remove = useMutation(api.board.remove);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!car) return;
    setPending(true);
    setError(null);
    onLeaving?.(true);
    try {
      await remove({ listingId: car.listingId });
      onOpenChange(false);
      await onRemoved?.();
    } catch (caught) {
      onLeaving?.(false);
      setError(caught instanceof ConvexError ? String(caught.data.message) : "Removing failed. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-removal would look like a cancel while the car still goes.
        if (pending && !next) return;
        setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this car?</AlertDialogTitle>
          <AlertDialogDescription>
            {car?.title} comes off your board, and its tier, notes and key-spec values are deleted. Saving the listing
            again adds it back to Watching.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => void confirm()}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
