import { Snowflake } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isFestiveSeason } from "./festiveSeason";

// Christmas decorations: falling snow, a string of lights over the header, a tree beside the
// wordmark, and snow caps and holly on the pit boards (`festive-slab` in styles.css). They show
// from 25 November to 6 January, and the header's Hide decorations button turns them off on this
// device. VITE_FESTIVE=on shows them out of season (design reviews), =off hides them.

// Flakes rest where they stand under reduced motion, by a custom property.
declare module "react" {
  interface CSSProperties {
    "--rest"?: string;
    "--cap-left"?: string;
    "--cap-width"?: string;
    "--glow"?: string;
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
    <Button variant="ghost" size="sm" onClick={onToggle}>
      <Snowflake data-icon="inline-start" aria-hidden />
      {/* Named by what it does, so it reads as reversible either way. */}
      <span className="max-sm:sr-only">{active ? "Hide decorations" : "Show decorations"}</span>
    </Button>
  );
}

const reducedMotion = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (onChange: () => void) => {
  const query = matchMedia(reducedMotion);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** Loops `animate` on each element under the returned ref that matches `selector`, while the
 *  viewer allows motion. Web Animations rather than CSS ones: React listens for CSS animation
 *  events on its root, and Chrome then wakes the main thread whenever any CSS animation loops,
 *  which for 150 of them was most frames, all day. Web Animations fire no such events, so they
 *  run on the compositor alone. */
function useLoops<T extends Element>(selector: string, animate: (element: Element, index: number) => Animation) {
  const ref = useRef<T>(null);
  const reduced = useSyncExternalStore(subscribeMotion, () => matchMedia(reducedMotion).matches);
  useEffect(() => {
    if (reduced || !ref.current) return;
    const animations = [...ref.current.querySelectorAll(selector)].map(animate);
    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [reduced, selector, animate]);
  return ref;
}

// A fixed field of flakes; each falls on its own speed, start and drift. Seeded, so every
// render and every capture lays them out alike.
const flakes = (() => {
  let seed = 11;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: 90 }, () => {
    const size = 3 + random() * 4;
    const duration = Math.round((10 + random() * 10) * 10) * 100;
    const left = `${(random() * 100).toFixed(2)}%`;
    const opacity = 0.65 + random() * 0.35;
    // A negative delay starts every flake mid-fall, so the screen never fills from the top.
    const delay = -Math.round(random() * duration);
    const drift = Math.round((random() - 0.5) * 90);
    const style: CSSProperties = {
      left,
      width: `${size.toFixed(1)}px`,
      height: `${size.toFixed(1)}px`,
      opacity,
      "--rest": `${(random() * 100).toFixed(1)}vh`,
    };
    return { style, duration, delay, drift };
  });
})();

const fall = (flake: Element, i: number) => {
  const { duration, delay, drift } = flakes[i];
  return flake.animate(
    [{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(${drift}px, calc(100vh + 24px), 0)` }],
    { duration, delay, iterations: Infinity },
  );
};

/** Snow over the whole page, behind its content: it falls on the ground between the cards,
 *  never over a photo or a card (owner's call: more snow than the header band). It never
 *  takes a click, and stands still for people who reduce motion. */
export function Snowfall({ className }: { className?: string }) {
  const ref = useLoops<HTMLDivElement>("i", fall);
  return (
    <div ref={ref} aria-hidden className={cn("snowfall", className)}>
      {flakes.map(({ style }, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}

const bulbColors = ["var(--festive-red)", "var(--festive-green)", "var(--signal)", "#fff"];
const sag = (t: number) => 2 * (1 - t) * t * 28 + 3;

// Each bulb dims and brightens on a phase of its own.
const twinkle = (bulb: Element, n: number) =>
  bulb.animate([{ opacity: 1, easing: "ease-in-out" }, { opacity: 0.5, easing: "ease-in-out" }, { opacity: 1 }], {
    duration: 2400,
    delay: -Math.round(((n * 0.37) % 2.4) * 1000),
    iterations: Infinity,
  });

/** A string of lights across the top of the header, hung in 240px swags: enough for a 3840px
 *  screen. */
export function Lights() {
  const ref = useLoops<HTMLDivElement>("ellipse", twinkle);
  const bulbs = [0.12, 0.31, 0.5, 0.69, 0.88];
  return (
    <div ref={ref} aria-hidden className="lights pointer-events-none absolute inset-x-0 top-0 flex overflow-hidden">
      {Array.from({ length: 16 }, (_, swag) => (
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
                  // White bulbs take the wire's hairline, so they hold on the pale concrete.
                  stroke={n % bulbColors.length === 3 ? "currentColor" : undefined}
                  strokeWidth="0.75"
                  style={{ "--glow": bulbColors[n % bulbColors.length] }}
                />
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}

/** A pine beside the wordmark, star on top and baubles in the lights' colours (user's call
 *  over a tree of stacked pit boards, 2026-11-25). */
export function Tree() {
  return (
    <svg aria-hidden viewBox="0 0 40 52" className="h-11 w-8.5 shrink-0">
      <path d="M20 2 L22.4 7.2 L28 7.6 L23.6 11 L25 16.4 L20 13.4 L15 16.4 L16.4 11 L12 7.6 L17.6 7.2 Z" fill="var(--signal)" />
      <path d="M20 12 L30 25 H10 Z" fill="var(--festive-pine)" />
      <path d="M20 19 L34 35 H6 Z" fill="var(--festive-pine)" />
      <path d="M20 27 L38 46 H2 Z" fill="var(--festive-pine)" />
      <rect x="17" y="46" width="6" height="6" fill="var(--festive-trunk)" />
      <circle cx="15" cy="30" r="2.3" fill="var(--festive-red)" />
      <circle cx="26" cy="38" r="2.3" fill="var(--festive-red)" />
      <circle cx="12" cy="42" r="2.3" fill="var(--signal)" />
      <circle cx="23" cy="24" r="2" fill="#fff" />
    </svg>
  );
}

/** Snow settled on about one card in four, at a spot and width of its own: the same cards and
 *  spots on every visit, since they follow the car's id. Undefined for the rest. */
export function cardSnow(id: string): CSSProperties | undefined {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  if (hash % 4 !== 0) return undefined;
  return { "--cap-left": `${4 + ((hash >>> 2) % 30)}%`, "--cap-width": `${35 + ((hash >>> 7) % 35)}%` };
}

/** A snow bank along the foot of the page. */
export function SnowBank() {
  return (
    <svg aria-hidden viewBox="0 0 1440 48" preserveAspectRatio="none" className="block h-10 w-full sm:h-12">
      <path
        d="M0 22 C120 8 220 26 360 16 C500 6 620 24 760 14 C900 4 1020 26 1160 16 C1280 8 1380 18 1440 12 V48 H0 Z"
        fill="var(--snow-cap)"
      />
    </svg>
  );
}
