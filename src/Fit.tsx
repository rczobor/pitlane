import { Ban, Check as CheckIcon, CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Criteria, evaluate } from "../shared/fit";
import { checkLabel, dealBreakerLabel, type KeySpecDef, type ResolvedSpec } from "./format";

type Props = {
  car: { price: { amount: number; currency: string }; firstRegistration?: string; mileageKm: number };
  criteria?: Criteria;
  specDefs: KeySpecDef[];
  keySpecs: ResolvedSpec[];
  modelId: string | null;
};

const statusIcon = { met: CheckIcon, missed: X, unknown: CircleHelp };
const statusText = { met: "met", missed: "missed", unknown: "not known yet" };

// Every check that decides the car's fit, with deal-breakers first: the "why" behind a tier.
export function FitList({ car, criteria, specDefs, keySpecs, modelId }: Props) {
  const { checks, met, total, dealBreakers } = evaluate(car, criteria, specDefs, keySpecs, modelId);
  if (total === 0 && dealBreakers.length === 0) {
    return <p className="text-sm text-muted-foreground">Set a budget, years, mileage or preferred values in Specs.</p>;
  }
  return (
    <div className="space-y-2">
      {total > 0 && (
        <p className="text-sm font-semibold tabular-nums">
          {met} of {total} met
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {dealBreakers.map((d) => (
          <li key={d.specId} className="flex items-center gap-2 font-semibold text-destructive">
            <Ban className="size-4 shrink-0" aria-hidden />
            Deal-breaker: {dealBreakerLabel(d, keySpecs)}
          </li>
        ))}
        {checks.map((check) => {
          const Icon = statusIcon[check.status];
          return (
            <li
              key={check.kind === "spec" ? check.specId : check.kind}
              className={cn("flex items-center gap-2", check.status !== "met" && "text-muted-foreground")}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span>
                {checkLabel(check, car.price.currency)}
                <span className="sr-only">: {statusText[check.status]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
