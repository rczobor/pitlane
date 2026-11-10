import { useEffect, useRef, useState } from "react";
import { formatDate, formatPrice } from "./format";

type Point = { at: number; amount: number };
type Props = { points: Point[]; currency: string; until: number };

// The top band holds the tooltip, so it never covers the line.
const height = 196;
const pad = { top: 52, right: 12, bottom: 24, left: 56 };

const compact = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);

// One series: the asking price as a step line with a marker at every change, running on
// to `until` (the last check, or when the ad was removed). The history list under it is
// the table view, so the chart only adds the shape.
export function PriceChart({ points, currency, until }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const amounts = points.map((p) => p.amount);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const span = high - low || high * 0.05;
  const yMin = low - span * 0.25;
  const yMax = high + span * 0.25;
  const t0 = points[0].at;
  const t1 = Math.max(until, points[points.length - 1].at + 1);
  const plotW = Math.max(width - pad.left - pad.right, 1);
  const plotH = height - pad.top - pad.bottom;
  const x = (at: number) => pad.left + ((at - t0) / (t1 - t0)) * plotW;
  const y = (amount: number) => pad.top + (1 - (amount - yMin) / (yMax - yMin)) * plotH;

  // A price holds until the next one, so each change is a horizontal run then a drop or rise.
  const path = `${points.map((p, i) => (i === 0 ? `M${x(p.at)},${y(p.amount)}` : `H${x(p.at)} V${y(p.amount)}`)).join(" ")} H${x(t1)}`;
  const ticks = [low, high].filter((v, i, all) => all.indexOf(v) === i);
  const point = active === null ? null : points[active];

  // The crosshair snaps to the nearest change, so the hit area is the whole plot.
  const nearest = (clientX: number) => {
    const left = box.current!.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i].at) - (clientX - left)) < Math.abs(x(points[best].at) - (clientX - left))) best = i;
    }
    return best;
  };

  return (
    <div ref={box} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label="Price over time" className="overflow-visible">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={pad.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {compact(v, currency)}
              </text>
            </g>
          ))}
          <text x={pad.left} y={height - 6} className="fill-muted-foreground text-[11px]">
            {formatDate(t0)}
          </text>
          <text x={width - pad.right} y={height - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {formatDate(until)}
          </text>
          {point && (
            <line x1={x(point.at)} x2={x(point.at)} y1={pad.top} y2={pad.top + plotH} stroke="var(--muted-foreground)" strokeWidth={1} />
          )}
          <path d={path} fill="none" stroke="var(--foreground)" strokeWidth={2} strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle
              key={p.at}
              cx={x(p.at)}
              cy={y(p.amount)}
              r={i === active ? 7 : 5}
              fill="var(--foreground)"
              stroke="var(--background)"
              strokeWidth={2}
              tabIndex={0}
              role="img"
              aria-label={`${formatDate(p.at)}: ${formatPrice({ amount: p.amount, currency })}`}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="outline-none focus-visible:stroke-ring"
            />
          ))}
          <rect
            x={pad.left}
            y={pad.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={(event) => setActive(nearest(event.clientX))}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
      )}
      {point && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(x(point.at) - 60, 0), Math.max(width - 120, 0)) }}
        >
          <p className="font-semibold tabular-nums">{formatPrice({ amount: point.amount, currency })}</p>
          <p className="text-muted-foreground">{formatDate(point.at)}</p>
        </div>
      )}
    </div>
  );
}
