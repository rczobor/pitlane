import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, Ban, Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../convex/_generated/api";
import { buttonVariants, Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { evaluate } from "../shared/fit";
import {
  type BoardData,
  type BoardListing,
  dealBreakerLabel,
  formatAge,
  formatDate,
  formatDateTime,
  formatDrivetrain,
  formatKm,
  formatPower,
  formatPrice,
  formatRegistration,
} from "./format";
import { specTone, specValueText, specVerdict } from "./KeySpecLedger";
import { NoPhoto } from "./ListingCard";
import { TierSlab } from "./TierSlab";
import { useBoardToken } from "./token";

export const maxCompared = 3;

export function Compare({ ids }: { ids: string[] }) {
  const token = useBoardToken();
  const board = useQuery(api.board.get, { token });
  const navigate = useNavigate();
  const setIds = (next: string[]) =>
    void navigate({ to: "/compare", search: next.length > 0 ? { ids: next.join(",") } : {}, replace: true });

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <Link to="/" className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
        <ArrowLeft data-icon="inline-start" aria-hidden />
        Board
      </Link>
      <h1 className="condensed mt-4 text-4xl leading-none font-extrabold">Compare</h1>
      {board ? (
        <CompareTable board={board} ids={ids} onChange={setIds} />
      ) : (
        <Skeleton className="mt-8 h-96" />
      )}
    </main>
  );
}

// A row's cells, and a key that says whether the cars differ on it. Rows where every car
// matches are quieter, so the eye lands on what sets the cars apart.
type Row = { label: string; cell: (car: BoardListing) => ReactNode; key?: (car: BoardListing) => string };

function CompareTable({ board, ids, onChange }: { board: BoardData; ids: string[]; onChange: (ids: string[]) => void }) {
  // Ids of cars no longer on the board drop out quietly.
  const cars = ids.flatMap((id) => board.listings.find((l) => l.listingId === id) ?? []).slice(0, maxCompared);
  const model = (car: BoardListing) => board.models.find((m) => m.id === car.modelId);
  const fit = (car: BoardListing) =>
    evaluate(
      { price: car.price, firstRegistration: car.specs.firstRegistration, mileageKm: car.specs.mileageKm },
      model(car),
      board.keySpecs,
      car.keySpecs,
      car.modelId,
    );
  const add = (id: string) => onChange([...cars.map((c) => c.listingId), id]);
  const remove = (id: string) => onChange(cars.filter((c) => c.listingId !== id).map((c) => c.listingId));

  if (board.listings.length === 0) {
    return <p className="mt-6 text-muted-foreground">Add cars to the board to compare them.</p>;
  }

  const groups: { title?: string; rows: Row[] }[] = [
    {
      rows: [
        { label: "Tier", cell: (car) => <TierSlab tier={car.tier} className="h-10 min-w-10 px-2 text-3xl" />, key: (c) => c.tier },
        {
          label: "Price",
          cell: (car) => <Price car={car} />,
          key: (c) => `${c.price.amount} ${c.price.currency}`,
        },
        { label: "Fit", cell: (car) => <FitCell car={car} result={fit(car)} /> },
      ],
    },
    {
      title: "Car",
      rows: [
        { label: "First registration", cell: (c) => formatRegistration(c.specs.firstRegistration), key: (c) => c.specs.firstRegistration ?? "" },
        { label: "Mileage", cell: (c) => formatKm(c.specs.mileageKm), key: (c) => String(c.specs.mileageKm) },
        {
          label: "Power",
          cell: (c) => (c.specs.powerKw === undefined ? "—" : formatPower(c.specs.powerKw)),
          key: (c) => String(c.specs.powerKw),
        },
        { label: "Fuel and gearbox", cell: (c) => formatDrivetrain(c.specs), key: (c) => formatDrivetrain(c.specs) },
        { label: "Colour", cell: (c) => c.specs.color ?? "—", key: (c) => c.specs.color ?? "" },
        { label: "Previous owners", cell: (c) => c.specs.previousOwners ?? "—", key: (c) => String(c.specs.previousOwners) },
      ],
    },
    {
      title: "Key specs",
      // Only specs that apply to at least one of the cars.
      rows: board.keySpecs
        .filter((def) => cars.some((car) => car.keySpecs.some((s) => s.id === def.id)))
        .map((def) => ({
          label: def.name,
          cell: (car) => {
            const spec = car.keySpecs.find((s) => s.id === def.id);
            if (!spec) return <span className="text-muted-foreground">Not tracked for this model</span>;
            if (spec.value === null) return <span className="text-muted-foreground">Unknown</span>;
            const { hit, breaker } = specVerdict(spec, def, car.modelId);
            return (
              <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 font-semibold", specTone(spec, { hit, breaker }))}>
                {breaker && <Ban className="size-3.5" aria-hidden />}
                {hit && <Check className="size-3.5" aria-hidden />}
                {specValueText(spec)}
                {spec.source === "listing" && <span className="sr-only">(from the listing, not confirmed)</span>}
                {hit && <span className="sr-only">(preferred)</span>}
                {breaker && <span className="sr-only">(deal-breaker)</span>}
              </span>
            );
          },
          key: (car) => {
            const spec = car.keySpecs.find((s) => s.id === def.id);
            return `${spec?.value}|${spec?.source}`;
          },
        })),
    },
    {
      title: "Your take",
      rows: [
        { label: "Pros", cell: (c) => <Items items={c.pros} /> },
        { label: "Cons", cell: (c) => <Items items={c.cons} /> },
        {
          label: "Notes",
          cell: (c) =>
            c.notes ? (
              <p className="line-clamp-6 whitespace-pre-line">{c.notes}</p>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
      ],
    },
    {
      title: "Listing",
      rows: [
        { label: "Location", cell: (c) => c.location || "—", key: (c) => c.location ?? "" },
        { label: "Added", cell: (c) => `${formatDate(c.firstSeenAt)}, ${formatAge(c.firstSeenAt)}` },
        {
          label: "Last checked",
          cell: (c) => (c.status === "removed" && c.removedAt ? `Ad removed ${formatDate(c.removedAt)}` : formatDateTime(c.lastCheckedAt)),
        },
      ],
    },
  ];

  const candidates = board.listings.filter((l) => !cars.some((c) => c.listingId === l.listingId));
  // Group the picker by model, cars of the compared cars' models first.
  const pickerGroups = [...board.models, { id: null, name: "No model" }]
    .map((m) => ({ ...m, cars: candidates.filter((l) => l.modelId === m.id) }))
    .filter((g) => g.cars.length > 0)
    .sort((a, b) => Number(cars.some((c) => c.modelId === b.id)) - Number(cars.some((c) => c.modelId === a.id)));
  const picker = cars.length < maxCompared && candidates.length > 0 && (
    <NativeSelect
      aria-label="Add a car to compare"
      value=""
      onChange={(event) => event.target.value && add(event.target.value)}
      className="w-full"
    >
      <NativeSelectOption value="">Add a car…</NativeSelectOption>
      {pickerGroups.map((g) => (
        <NativeSelectOptGroup key={g.id ?? "none"} label={g.name || "Unnamed"}>
          {g.cars.map((l) => (
            <NativeSelectOption key={l.listingId} value={l.listingId}>
              {formatPrice(l.price)} · {l.title}
            </NativeSelectOption>
          ))}
        </NativeSelectOptGroup>
      ))}
    </NativeSelect>
  );

  if (cars.length === 0) {
    return (
      <div className="mt-6 max-w-md space-y-3">
        <p className="text-muted-foreground">Pick up to {maxCompared} cars to see them side by side.</p>
        {picker}
      </div>
    );
  }

  const columns = cars.length + (picker ? 1 : 0);
  const sticky = "sticky left-0 z-10 bg-background";
  return (
    // Phones scroll the table sideways; the row labels stay put, and columns are narrow
    // enough that the next car peeks in from the edge. `relative` keeps the
    // screen-reader-only labels inside the scroller instead of widening the page.
    <div className="relative -mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: `${8 + columns * 12}rem` }}>
        <colgroup>
          <col className="w-32 sm:w-44" />
          {Array.from({ length: columns }, (_, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <td className={sticky} />
            {cars.map((car) => (
              <th key={car.listingId} scope="col" className="px-3 pb-4 text-left align-top font-normal">
                <div className="space-y-2">
                  <div className="aspect-video overflow-hidden rounded-md bg-muted">
                    {car.coverUrl ? (
                      <img src={car.coverUrl} alt="" className={cn("size-full object-cover", car.status === "removed" && "grayscale")} />
                    ) : (
                      <NoPhoto />
                    )}
                  </div>
                  {model(car) && <p className="condensed text-lg leading-none font-bold">{model(car)!.name}</p>}
                  <Link
                    to="/listings/$listingId"
                    params={{ listingId: car.listingId }}
                    className="line-clamp-2 leading-tight font-medium underline-offset-4 hover:underline"
                  >
                    {car.title}
                  </Link>
                  <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => remove(car.listingId)}>
                    <X data-icon="inline-start" aria-hidden />
                    Remove<span className="sr-only"> {car.title} from the comparison</span>
                  </Button>
                </div>
              </th>
            ))}
            {picker && <td className="px-3 pb-4 align-top">{picker}</td>}
          </tr>
        </thead>
        {groups.map((group, g) => (
          <tbody key={g}>
            {group.title && (
              <tr>
                <th scope="colgroup" colSpan={columns + 1} className="pt-6 pb-2 text-left">
                  <span className={cn(sticky, "inline-block pr-3 font-semibold")}>{group.title}</span>
                </th>
              </tr>
            )}
            {group.rows.map((row) => {
              const same = cars.length > 1 && row.key !== undefined && new Set(cars.map(row.key)).size === 1;
              return (
                <tr key={row.label}>
                  <th scope="row" className={cn(sticky, "border-t py-2 pr-3 text-left align-top font-normal text-muted-foreground")}>
                    {row.label}
                  </th>
                  {cars.map((car) => (
                    <td
                      key={car.listingId}
                      className={cn("border-t px-3 py-2 align-top tabular-nums", same && "text-muted-foreground")}
                    >
                      {row.cell(car)}
                    </td>
                  ))}
                  {picker && <td className="border-t" />}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Price({ car }: { car: BoardListing }) {
  const change = car.price.currency === car.firstPrice.currency ? car.price.amount - car.firstPrice.amount : 0;
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="condensed text-2xl leading-none font-bold">{formatPrice(car.price)}</span>
      {change !== 0 && (
        <span className="text-xs font-semibold">
          {change < 0 ? "Down" : "Up"} {formatPrice({ ...car.price, amount: Math.abs(change) })}
        </span>
      )}
    </span>
  );
}

function FitCell({ car, result }: { car: BoardListing; result: ReturnType<typeof evaluate> }) {
  const { met, total, dealBreakers } = result;
  if (total === 0 && dealBreakers.length === 0) return <span className="text-muted-foreground">No criteria set</span>;
  return (
    <div className="space-y-1">
      {total > 0 && (
        <p className="font-semibold">
          {met} of {total} met
        </p>
      )}
      {dealBreakers.map((d) => (
        <p key={d.specId} className="flex items-center gap-1 font-semibold text-destructive">
          <Ban className="size-3.5 shrink-0" aria-hidden />
          {dealBreakerLabel(d, car.keySpecs)}
          <span className="sr-only">(deal-breaker)</span>
        </p>
      ))}
    </div>
  );
}

function Items({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item, i) => (
        <li key={`${item}-${i}`}>{item}</li>
      ))}
    </ul>
  );
}
