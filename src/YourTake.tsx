import { useMutation } from "convex/react";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type Props = { listingId: Id<"listings">; notes: string; pros: string[]; cons: string[] };

// The user's own take on a car. Notes save shortly after typing stops and when the field
// loses focus; pros and cons save on every change.
export function YourTake({ listingId, notes, pros, cons }: Props) {
  // Applied locally at once, so a save followed quickly by another (an edit committed on
  // blur by a click on another item's ×) builds on the first instead of undoing it.
  const setNotes = useMutation(api.board.setNotes).withOptimisticUpdate((store, { listingId, ...take }) => {
    const listing = store.getQuery(api.board.listing, { listingId });
    if (listing) store.setQuery(api.board.listing, { listingId }, { ...listing, ...take });
  });
  const [draft, setDraft] = useState(notes);
  const [state, setState] = useState<"saved" | "saving" | "error" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The typed value not yet sent, if any.
  const pending = useRef<string | null>(null);

  const saveNotes = (value: string) => {
    clearTimeout(timer.current);
    pending.current = null;
    if (value === notes) return;
    setState("saving");
    setNotes({ listingId, notes: value }).then(
      () => setState("saved"),
      () => setState("error"),
    );
  };
  // Flush on leaving the page, so a note typed just before navigating is not lost.
  const flush = useRef(() => {});
  flush.current = () => {
    if (pending.current !== null) saveNotes(pending.current);
  };
  useEffect(() => () => flush.current(), []);

  return (
    <section aria-labelledby="your-take" className="space-y-4">
      <div>
        <h2 id="your-take" className="font-semibold">
          Your take
        </h2>
        <Separator className="mt-3" />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="notes">Notes</Label>
          <p role="status" className="text-xs text-muted-foreground">
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved. Try again." : ""}
          </p>
        </div>
        <Textarea
          id="notes"
          value={draft}
          maxLength={5_000}
          rows={4}
          placeholder="What you noticed, questions for the seller, what to check at the viewing…"
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            setState(null);
            pending.current = value;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => saveNotes(value), 800);
          }}
          onBlur={() => saveNotes(draft)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ItemList
          label="Pros"
          icon={<Plus className="size-3.5" aria-hidden />}
          items={pros}
          onChange={(next) => void setNotes({ listingId, pros: next })}
        />
        <ItemList
          label="Cons"
          icon={<Minus className="size-3.5" aria-hidden />}
          items={cons}
          onChange={(next) => void setNotes({ listingId, cons: next })}
        />
      </div>
    </section>
  );
}

function ItemList({
  label,
  icon,
  items,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (value) onChange([...items, value]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {items.length > 0 && (
        <ul aria-label={label} className="space-y-1">
          {items.map((item, i) => (
            // Keyed by position so an item's row, and its focus, survive saving an edit.
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1 shrink-0 text-muted-foreground">{icon}</span>
              <ItemText
                item={item}
                label={`${label.toLowerCase().slice(0, -1)}: ${item}`}
                onSave={(value) => onChange(items.with(i, value))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${label.toLowerCase().slice(0, -1)}: ${item}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label={`Add to ${label.toLowerCase()}`}
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Add to ${label.toLowerCase()}`}
          className="h-9"
        />
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!draft.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

// An item reads as plain text; clicking it swaps in an input. Enter or leaving the field
// saves, Escape cancels, and an emptied item keeps its old text (remove it with ×).
// Closing with a key puts focus back on the item, so keyboard users keep their place.
function ItemText({ item, label, onSave }: { item: string; label: string; onSave: (value: string) => void }) {
  const [mode, setMode] = useState<"view" | "edit" | "keyClosed">("view");
  // Enter and Escape close the input, and its blur on the way out must not save again.
  const closed = useRef(false);
  const close = (value: string | null, next: "view" | "keyClosed") => {
    if (closed.current) return;
    closed.current = true;
    setMode(next);
    const text = value?.trim();
    if (text && text !== item) onSave(text);
  };
  if (mode !== "edit") {
    return (
      <button
        type="button"
        autoFocus={mode === "keyClosed"}
        aria-label={`Edit ${label}`}
        className="-mx-1 min-w-0 flex-1 cursor-text rounded px-1 text-left break-words hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => {
          closed.current = false;
          setMode("edit");
        }}
      >
        {item}
      </button>
    );
  }
  return (
    <Input
      aria-label={`Edit ${label}`}
      defaultValue={item}
      maxLength={200}
      autoFocus
      className="-mx-1 -my-1.5 h-8 min-w-0 flex-1 px-1"
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          // Otherwise the same keypress activates the item that just took focus and reopens it.
          event.preventDefault();
          close(event.currentTarget.value, "keyClosed");
        }
        if (event.key === "Escape") close(null, "keyClosed");
      }}
      onBlur={(event) => close(event.currentTarget.value, "view")}
    />
  );
}
