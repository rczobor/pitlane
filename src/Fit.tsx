import { Ban, Check as CheckIcon, CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Criteria, evaluate } from "../shared/fit";
import { Separator } from "@/components/ui/separator";
import { checkLabel, dealBreakerLabel, type KeySpecDef, type ResolvedSpec } from "./format";
import { specValueText } from "./KeySpecLedger";

type Props = {
  car: { price: { amount: number; currency: string }; firstRegistration?: string; mileageKm: number };
  criteria?: Criteria;
  specDefs: KeySpecDef[];
  keySpecs: ResolvedSpec[];
  modelId: string | null;
};

const statusIcon = { met: CheckIcon, missed: X, unknown: CircleHelp };
const statusText = { met: "met", missed: "missed", unknown: "not known yet" };

// Every check that decides the car's fit, with deal-breakers first: the "why" behind a
// tier. The count of checks met heads the section.
export function FitSection({ car, criteria, specDefs, keySpecs, modelId }: Props) {
  const { checks, met, total, dealBreakers } = evaluate(car, criteria, specDefs, keySpecs, modelId);
  return (
    <section aria-labelledby="fit">
      <h2 id="fit" className="font-semibold">
        How it fits
        {total > 0 && (
          <span className="font-normal text-muted-foreground tabular-nums">
            {" "}
            · {met} of {total} met
          </span>
        )}
      </h2>
      <Separator className="my-3" />
      {total === 0 && dealBreakers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Set a budget, years, mileage or preferred values in Specs.</p>
      ) : (
      <ul className="space-y-1 text-sm">
        {dealBreakers.map((d) => (
          <li key={d.specId} className="flex items-center gap-2 font-semibold text-destructive">
            <Ban className="size-4 shrink-0" aria-hidden />
            Deal-breaker: {dealBreakerLabel(d, keySpecs)}
          </li>
        ))}
        {checks.map((check) => {
          const Icon = statusIcon[check.status];
          // An unconfirmed listing value is what keeps a spec unknown; say what it claims.
          const claim = check.kind === "spec" ? keySpecs.find((s) => s.id === check.specId) : undefined;
          return (
            <li
              key={check.kind === "spec" ? check.specId : check.kind}
              className={cn("flex items-center gap-2", check.status !== "met" && "text-muted-foreground")}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span>
                {checkLabel(check, car.price.currency)}
                <span className="sr-only">: {statusText[check.status]}</span>
                {claim?.source === "listing" && (
                  <span className="text-xs"> (the listing says {specValueText(claim)}, not confirmed)</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}
