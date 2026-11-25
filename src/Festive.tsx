import { Snowflake } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isFestiveSeason } from "./festiveSeason";

// Christmas decorations: falling snow, a string of lights over the header, a tree beside the
// wordmark, and snow caps and holly on the pit boards (`festive-slab` in styles.css). They show
// from 1 December to 6 January, and the header's Decorations button turns them off on this
// device. VITE_FESTIVE=on shows them out of season (design reviews), =off hides them.

// Flakes drift sideways, and rest where they stand under reduced motion, by custom properties.
declare module "react" {
  interface CSSProperties {
    "--drift"?: string;
    "--rest"?: string;
  }
}

const storageKey = "pitlane:decorations";

const inSeason = () => {
  const forced = import.meta.env.VITE_FESTIVE;
  return forced === "on" || (forced !== "off" && isFestiveSeason(new Date()));
};

function readOn() {
  try {
    return localStorage.getItem(storageKey) !== "off";
  } catch {
    return true;
  }
}

/** Whether the season is on, and the viewer's switch for it. The page's slabs follow
 *  `data-festive` on the root element. */
export function useFestive() {
  const [season] = useState(inSeason);
  const [on, setOn] = useState(readOn);
  const active = season && on;

  useEffect(() => {
    const root = document.documentElement;
    if (active) root.dataset.festive = "";
    else delete root.dataset.festive;
    return () => {
      delete root.dataset.festive;
    };
  }, [active]);

  const toggle = () => {
    setOn(!on);
    try {
      if (on) localStorage.setItem(storageKey, "off");
      else localStorage.removeItem(storageKey);
    } catch {
      // Private mode: the switch lasts until the page reloads.
    }
  };

  return { season, active, toggle };
}

export function DecorationsToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onToggle} className="relative">
      <Snowflake data-icon="inline-start" aria-hidden />
      {/* Named by what it does, so it reads as reversible either way. */}
      <span className="max-sm:sr-only">{active ? "Hide decorations" : "Show decorations"}</span>
    </Button>
  );
}

// A fixed field of flakes; each falls on its own speed, start and drift. Seeded, so every
// render and every capture lays them out alike.
const flakes = (() => {
  let seed = 11;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: 60 }, (): CSSProperties => {
    const size = 3 + random() * 4;
    const duration = 10 + random() * 10;
    return {
      left: `${(random() * 100).toFixed(2)}%`,
      width: `${size.toFixed(1)}px`,
      height: `${size.toFixed(1)}px`,
      opacity: 0.65 + random() * 0.35,
      animationDuration: `${duration.toFixed(1)}s`,
      // Negative delays start every flake mid-fall, so the screen never fills from the top.
      animationDelay: `-${(random() * duration).toFixed(1)}s`,
      "--drift": `${((random() - 0.5) * 90).toFixed(0)}px`,
      "--rest": `${(random() * 100).toFixed(1)}vh`,
    };
  });
})();

/** Snow behind the page's content. It never takes a click, and stands still for
 *  people who reduce motion (styles.css). */
export function Snowfall() {
  return (
    <div aria-hidden className="snowfall">
      {flakes.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}

const bulbColors = ["var(--festive-red)", "var(--festive-green)", "var(--signal)", "#fff"];
const sag = (t: number) => 2 * (1 - t) * t * 28 + 3;

/** A string of lights across the top of the header, hung in 240px swags. */
export function Lights() {
  const bulbs = [0.12, 0.31, 0.5, 0.69, 0.88];
  return (
    <div aria-hidden className="lights pointer-events-none absolute inset-x-0 top-0 flex overflow-hidden">
      {Array.from({ length: 12 }, (_, swag) => (
        <svg key={swag} viewBox="0 0 240 44" className="w-40 shrink-0 sm:w-60">
          <path d="M0 3 Q120 59 240 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {bulbs.map((t, i) => {
            const n = swag * bulbs.length + i;
            return (
              <g key={t} transform={`translate(${t * 240} ${sag(t)})`}>
                <rect x="-2.5" y="0" width="5" height="4" rx="1" fill="currentColor" />
                <ellipse
                  cx="0"
                  cy="10"
                  rx="4.5"
                  ry="6.5"
                  fill={bulbColors[n % bulbColors.length]}
                  style={{ animationDelay: `-${((n * 0.37) % 2.4).toFixed(2)}s` }}
                />
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}

/** A tree of stacked pit boards beside the wordmark, the S yellow on top as its star, hung
 *  with the string's lights. */
export function SlabTree() {
  const rows = [12, 20, 28, 36];
  return (
    <svg aria-hidden viewBox="0 0 40 46" className="h-10 w-9 shrink-0 text-slab">
      <rect x="15.5" y="1" width="9" height="9" transform="rotate(45 20 5.5)" fill="var(--signal)" />
      {rows.map((width, i) => (
        <rect key={width} x={20 - width / 2} y={12 + i * 8} width={width} height="6" rx="1.5" fill="currentColor" />
      ))}
      <rect x="17" y="44" width="6" height="2" fill="currentColor" />
      <circle cx="17" cy="15" r="1.3" fill="var(--festive-red)" />
      <circle cx="24" cy="23" r="1.3" fill="#fff" />
      <circle cx="13" cy="31" r="1.3" fill="var(--festive-green-light)" />
      <circle cx="28" cy="31" r="1.3" fill="var(--festive-red)" />
      <circle cx="9" cy="39" r="1.3" fill="#fff" />
      <circle cx="21" cy="39" r="1.3" fill="var(--festive-red)" />
      <circle cx="33" cy="39" r="1.3" fill="var(--festive-green-light)" />
    </svg>
  );
}
