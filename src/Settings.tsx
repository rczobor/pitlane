import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Preference } from "../shared/fit";
import type { BoardData, BoardListing, BoardModel, KeySpecDef, ResolvedSpec } from "./format";
import { ListingCard } from "./ListingCard";
import { preferenceLabel } from "./SpecEditor";
import { useBoardToken } from "./token";

export function Settings() {
  const token = useBoardToken();
  const board = useQuery(api.board.get, { token });
  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <div className="max-w-3xl">
        <Link to="/" className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Board
        </Link>
      <h1 className="condensed mt-4 text-4xl leading-none font-extrabold">Models and key specs</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Models split the board into one tier list per model. Key specs are what decide a car's tier; the order here is
        the order they show on cards.
      </p>
      </div>
      {board ? <SettingsForm board={board} /> : <Skeleton className="mt-8 h-96 max-w-3xl" />}
    </main>
  );
}

type DraftSpec = KeySpecDef;

// Not crypto.randomUUID: it only exists in secure contexts, and the app is opened over
// plain http on the home network. Ids only need to be unique within one board.
const newId = () => Math.random().toString(36).slice(2, 10);

// Compares settings the way the server stores them: older specs have no `preferred`,
// names are trimmed, and only choice specs keep choices. A raw comparison would show
// "Unsaved changes" forever after saving such a spec.
const settingsKey = (models: BoardModel[], specs: DraftSpec[]) =>
  JSON.stringify({
    models: models.map((m) => [m.id, m.name.trim()]),
    specs: specs.map((s) => [
      s.id,
      s.name.trim(),
      s.kind,
      s.kind === "choice" ? s.choices : [],
      s.models,
      (s.preferred ?? []).map((p) => [p.value, p.models]),
    ]),
  });

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
  const dirty = settingsKey(models, specs) !== settingsKey(board.models, board.keySpecs);
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
      const saved = await saveSettings({ token, models, keySpecs: specs });
      setModels(saved.models);
      setSpecs(saved.keySpecs);
      setStatus({ kind: "saved" });
    } catch (error) {
      const message = error instanceof ConvexError ? String(error.data.message) : "Saving failed. Try again.";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,48rem)_minmax(0,1fr)] lg:items-start">
    <form
      className="space-y-10"
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
              <PreferredEditor
                spec={spec}
                models={models}
                modelName={modelName}
                onChange={(preferred) => editSpec(index, { preferred })}
              />
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
    <Preview board={board} specs={specs} models={models} />
    </div>
  );
}

// A real car from the board, rendered with the unsaved settings: the order, scope and
// preferred values shown exactly as cards will show them once saved.
function Preview({ board, specs, models }: { board: BoardData; specs: DraftSpec[]; models: BoardModel[] }) {
  const withCars = models.filter((m) => board.listings.some((l) => l.modelId === m.id));
  const [modelId, setModelId] = useState(withCars[0]?.id ?? null);
  const sample = board.listings.find((l) => l.modelId === modelId) ?? board.listings[0];
  return (
    <aside aria-labelledby="preview-heading" className="space-y-3 lg:sticky lg:top-6">
      <h2 id="preview-heading" className="font-semibold">
        Preview
      </h2>
      <Separator />
      {!sample ? (
        <p className="text-sm text-muted-foreground">Add a car to the board to preview its card here.</p>
      ) : (
        <>
          {withCars.length > 1 && (
            <ToggleGroup
              aria-label="Preview a car of model"
              variant="outline"
              size="sm"
              value={modelId ? [modelId] : []}
              onValueChange={(value) => value[0] && setModelId(value[0])}
              className="flex-wrap"
            >
              {withCars.map((m) => (
                <ToggleGroupItem key={m.id} value={m.id} className="data-pressed:bg-foreground data-pressed:text-background">
                  {m.name || "Unnamed"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <ListingCard
            preview
            listing={{ ...sample, keySpecs: draftSpecsFor(sample, specs) }}
            modelName={models.find((m) => m.id === sample.modelId)?.name}
            specDefs={specs}
          />
          <p className="max-w-80 text-sm text-muted-foreground">Updates as you edit; nothing is saved until you save.</p>
        </>
      )}
    </aside>
  );
}

// The car's key specs under the draft settings. Values come from the saved board, so a
// spec that is new or newly in scope shows as unknown until saved.
function draftSpecsFor(listing: BoardListing, specs: DraftSpec[]): ResolvedSpec[] {
  return specs
    .filter((s) => s.models.length === 0 || (listing.modelId !== null && s.models.includes(listing.modelId)))
    .map((s) => {
      const saved = listing.keySpecs.find((k) => k.id === s.id);
      return { id: s.id, name: s.name || "Untitled", kind: s.kind, value: saved?.value ?? null, source: saved?.source ?? null };
    });
}

const modelsText = (ids: string[], modelName: (id: string) => string) =>
  ids.length === 0 ? "all models" : ids.map(modelName).join(", ");

// Which values the user wants, per model: "PDK for 718 GT4, 718 GT4 RS; Manual for 991.2 GT3".
function PreferredEditor({
  spec,
  models,
  modelName,
  onChange,
}: {
  spec: DraftSpec;
  models: BoardModel[];
  modelName: (id: string) => string;
  onChange: (preferred: Preference[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [scope, setScope] = useState<string[]>([]);
  const preferred = spec.preferred ?? [];
  const values = spec.kind === "check" ? ["yes", "no"] : spec.choices;
  const label = (v: string) => preferenceLabel(spec.kind, v);
  const name = spec.name || "this key spec";

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Preferred</span>
        <span>
          {preferred.length === 0
            ? "No preference"
            : preferred.map((p) => `${label(p.value)} for ${modelsText(p.models, modelName)}`).join("; ")}
        </span>
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setOpen(true)}>
          Edit<span className="sr-only"> preferred values for {name}</span>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm text-muted-foreground">Preferred values</p>
      {preferred.length > 0 && (
        <ul aria-label={`Preferred values for ${name}`} className="flex flex-wrap gap-1.5">
          {preferred.map((p, i) => (
            <li key={`${p.value}-${i}`} className="inline-flex h-8 items-center gap-1 rounded-md border pr-1 pl-2.5 text-sm">
              {label(p.value)} for {modelsText(p.models, modelName)}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove preference ${label(p.value)} for ${modelsText(p.models, modelName)}`}
                onClick={() => onChange(preferred.filter((_, j) => j !== i))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add choices first.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            aria-label={`Preferred value for ${name}`}
            variant="outline"
            size="sm"
            value={value ? [value] : []}
            onValueChange={(next) => setValue(next[0] ?? null)}
            className="flex-wrap"
          >
            {values.map((v) => (
              <ToggleGroupItem key={v} value={v} className="data-pressed:bg-foreground data-pressed:text-background">
                {label(v)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {models.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">for</span>
              <ToggleGroup
                aria-label={`Models the preferred ${name} applies to`}
                multiple
                variant="outline"
                size="sm"
                value={scope.length === 0 ? ["all"] : scope}
                onValueChange={(next) => {
                  const picked = next.filter((v) => v !== "all");
                  setScope(next.includes("all") && scope.length > 0 ? [] : picked);
                }}
                className="flex-wrap"
              >
                <ToggleGroupItem value="all" className="data-pressed:bg-foreground data-pressed:text-background">
                  All models
                </ToggleGroupItem>
                {models.map((m) => (
                  <ToggleGroupItem key={m.id} value={m.id} className="data-pressed:bg-foreground data-pressed:text-background">
                    {m.name || "Unnamed"}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </>
          )}
          <Button
            type="button"
            size="sm"
            disabled={value === null}
            onClick={() => {
              if (value === null) return;
              onChange([...preferred, { value, models: scope }]);
              setValue(null);
              setScope([]);
            }}
          >
            Add preference
          </Button>
        </div>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Done
      </Button>
    </div>
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
