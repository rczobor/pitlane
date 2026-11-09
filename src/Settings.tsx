import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BoardData, BoardModel, KeySpecDef } from "./format";
import { useBoardToken } from "./token";

export function Settings() {
  const token = useBoardToken();
  const board = useQuery(api.board.get, { token });
  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <div className="max-w-3xl">
      <Button variant="ghost" className="-ml-2.5" nativeButton={false} render={<Link to="/" />}>
        <ArrowLeft data-icon="inline-start" aria-hidden />
        Board
      </Button>
      <h1 className="condensed mt-4 text-4xl leading-none font-extrabold">Models and key specs</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Models split the board into one tier list per model. Key specs are what decide a car's tier; the order here is
        the order they show on cards.
      </p>
      {board ? <SettingsForm board={board} /> : <Skeleton className="mt-8 h-96" />}
      </div>
    </main>
  );
}

type DraftSpec = KeySpecDef;

const newId = () => crypto.randomUUID().slice(0, 8);

function move<T>(list: T[], index: number, by: -1 | 1) {
  const next = list.slice();
  const target = index + by;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function SettingsForm({ board }: { board: BoardData }) {
  const token = useBoardToken();
  const saveSettings = useMutation(api.board.saveSettings);
  const [models, setModels] = useState<BoardModel[]>(board.models);
  const [specs, setSpecs] = useState<DraftSpec[]>(board.keySpecs);
  const [status, setStatus] = useState<{ kind: "saved" } | { kind: "error"; message: string } | null>(null);
  const [scopeOpen, setScopeOpen] = useState<string | null>(null);
  const dirty =
    JSON.stringify(models) !== JSON.stringify(board.models) || JSON.stringify(specs) !== JSON.stringify(board.keySpecs);
  const discard = () => {
    setModels(board.models);
    setSpecs(board.keySpecs);
    setStatus(null);
  };
  const modelName = (id: string) => models.find((m) => m.id === id)?.name || "Unnamed";
  const carCount = (id: string) => board.listings.filter((l) => l.modelId === id).length;

  const editSpec = (index: number, patch: Partial<DraftSpec>) => {
    setSpecs((all) => all.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setStatus(null);
  };
  const editModels = (next: BoardModel[]) => {
    setModels(next);
    setStatus(null);
  };

  async function save() {
    try {
      await saveSettings({
        token,
        models,
        keySpecs: specs,
      });
      setStatus({ kind: "saved" });
    } catch (error) {
      const message = error instanceof ConvexError ? String(error.data.message) : "Saving failed. Try again.";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <form
      className="mt-8 space-y-10"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <section className="space-y-3">
        <h2 className="font-semibold">Models</h2>
        <Separator />
        <ol className="space-y-2">
          {models.map((model, index) => (
            <li key={model.id} className="flex items-center gap-2">
              <Input
                aria-label={`Model ${index + 1} name`}
                value={model.name}
                onChange={(event) =>
                  editModels(models.map((m) => (m.id === model.id ? { ...m, name: event.target.value } : m)))
                }
                className="flex-1"
              />
              {/* Removing a model leaves these cars without one; nothing is lost until Save. */}
              <span className="w-14 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                {carCount(model.id) === 1 ? "1 car" : `${carCount(model.id)} cars`}
              </span>
              <RowActions
                name={model.name || "model"}
                first={index === 0}
                last={index === models.length - 1}
                onUp={() => editModels(move(models, index, -1))}
                onDown={() => editModels(move(models, index, 1))}
                onRemove={() => editModels(models.filter((m) => m.id !== model.id))}
              />
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" onClick={() => editModels([...models, { id: newId(), name: "" }])}>
          <Plus data-icon="inline-start" aria-hidden />
          Add model
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Key specs</h2>
        <Separator />
        <ol>
          {specs.map((spec, index) => (
            <li key={spec.id} className="space-y-2 border-t py-4 first:border-t-0 first:pt-1">
              <div className="flex items-center gap-2">
                {/* Priority: the order key specs take on every card. */}
                <span className="condensed w-6 shrink-0 text-2xl leading-none font-extrabold tabular-nums" aria-hidden>
                  {index + 1}
                </span>
                <Input
                  aria-label={`Key spec ${index + 1} name`}
                  value={spec.name}
                  onChange={(event) => editSpec(index, { name: event.target.value })}
                  className="min-w-0 flex-1"
                />
                <RowActions
                  name={spec.name || "key spec"}
                  first={index === 0}
                  last={index === specs.length - 1}
                  onUp={() => setSpecs(move(specs, index, -1))}
                  onDown={() => setSpecs(move(specs, index, 1))}
                  onRemove={() => setSpecs(specs.filter((s) => s.id !== spec.id))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Type</span>
                <ToggleGroup
                  aria-label={`${spec.name || "Key spec"} type`}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={[spec.kind]}
                  onValueChange={(value) => {
                    const kind = value[0];
                    if (kind === "check" || kind === "choice") editSpec(index, { kind });
                  }}
                >
                  <ToggleGroupItem value="check" className="data-pressed:bg-foreground data-pressed:text-background">
                    Yes / no
                  </ToggleGroupItem>
                  <ToggleGroupItem value="choice" className="data-pressed:bg-foreground data-pressed:text-background">
                    Choice
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              {spec.kind === "choice" && (
                <ChoiceList
                  specName={spec.name || "this key spec"}
                  choices={spec.choices}
                  onChange={(choices) => editSpec(index, { choices })}
                />
              )}
              {models.length > 0 && scopeOpen !== spec.id && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Applies to</span>
                  <span>
                    {spec.models.length === 0
                      ? "All models"
                      : spec.models.length <= 2
                        ? spec.models.map(modelName).join(", ")
                        : `${spec.models.length} of ${models.length} models`}
                  </span>
                  <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setScopeOpen(spec.id)}>
                    Edit<span className="sr-only"> models for {spec.name || "this key spec"}</span>
                  </Button>
                </div>
              )}
              {models.length > 0 && scopeOpen === spec.id && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Applies to</span>
                  {/* "All" is an explicit choice: picking a model replaces it, clearing every model returns to it. */}
                  <ToggleGroup
                    aria-label={`Models ${spec.name || "this key spec"} applies to`}
                    multiple
                    variant="outline"
                    size="sm"
                    value={spec.models.length === 0 ? ["all"] : spec.models}
                    onValueChange={(value) => {
                      const picked = value.filter((v) => v !== "all");
                      const choseAll = value.includes("all") && !(spec.models.length === 0);
                      editSpec(index, { models: choseAll ? [] : picked });
                    }}
                    className="flex-wrap"
                  >
                    <ToggleGroupItem value="all" className="data-pressed:bg-foreground data-pressed:text-background">
                      All models
                    </ToggleGroupItem>
                    {models.map((m) => (
                      <ToggleGroupItem
                        key={m.id}
                        value={m.id}
                        className="data-pressed:bg-foreground data-pressed:text-background"
                      >
                        {m.name || "Unnamed"}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setScopeOpen(null)}>
                    Done
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setSpecs([...specs, { id: newId(), name: "", kind: "check", choices: [], models: [] }])
          }
        >
          <Plus data-icon="inline-start" aria-hidden />
          Add key spec
        </Button>
      </section>

      {/* Pinned while there is something to save, so edits near the top are not left behind. */}
      {dirty ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background px-4 py-3 sm:mx-0 sm:px-0">
          <p className="mr-auto text-sm font-medium">Unsaved changes</p>
          <Button type="button" variant="ghost" onClick={discard}>
            Discard
          </Button>
          <Button type="submit" size="lg">
            Save changes
          </Button>
        </div>
      ) : (
        status?.kind === "saved" && (
          <p role="status" className="text-sm text-muted-foreground">
            Saved
          </p>
        )
      )}
      {status?.kind === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

// Choices as removable chips plus an add field, the same values the car page offers.
function ChoiceList({
  specName,
  choices,
  onChange,
}: {
  specName: string;
  choices: string[];
  onChange: (choices: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (value && !choices.includes(value)) onChange([...choices, value]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ul aria-label={`Choices for ${specName}`} className="contents">
        {choices.map((choice) => (
          <li key={choice} className="inline-flex h-8 items-center gap-1 rounded-md border pr-1 pl-2.5 text-sm">
            {choice}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${choice}`}
              onClick={() => onChange(choices.filter((c) => c !== choice))}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Input
        aria-label={`Add a choice to ${specName}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter adds the choice instead of submitting the whole form.
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        placeholder="Add a choice"
        maxLength={60}
        className="h-8 w-40"
      />
      {draft.trim() && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          Add
        </Button>
      )}
    </div>
  );
}

function RowActions({
  name,
  first,
  last,
  onUp,
  onDown,
  onRemove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${name} up`} disabled={first} onClick={onUp}>
        <ArrowUp aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${name} down`} disabled={last} onClick={onDown}>
        <ArrowDown aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} onClick={onRemove}>
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}
