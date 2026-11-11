import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowUpRight, Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import { version as extensionVersion } from "../extension/manifest.json";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Each merge that bumps the extension's version publishes a release with the zip attached,
// so the latest release is the version in the manifest this app was built with.
const extensionRelease = "https://github.com/rczobor/pitlane/releases/latest";

// The two ways cars reach the board: the Chrome extension, and an assistant through Pitlane's
// MCP server. Menu names follow each product's own help pages; they move now and then, so
// each guide links to its source.
const extensionLink = (
  <Link to="/add" hash="extension" className="text-foreground underline underline-offset-4">
    Chrome extension
  </Link>
);
const assistantsLink = (
  <Link to="/add" hash="assistants" className="text-foreground underline underline-offset-4">
    Claude or ChatGPT
  </Link>
);

export function AddCars() {
  const url = useQuery(api.mcp.serverUrl);
  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <div className="max-w-3xl">
        <Link to="/" className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Board
        </Link>
        <h1 className="condensed mt-4 text-4xl leading-none font-extrabold">Add cars</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          {/* Names the parts in the order they show: phones put the assistants first. */}
          <span className="max-sm:hidden">
            Two ways to get cars onto your board: save them yourself with the {extensionLink}, or let {assistantsLink}{" "}
            do it.
          </span>
          <span className="sm:hidden">
            Two ways to get cars onto your board: let {assistantsLink} save them, or save them yourself with the{" "}
            {extensionLink}.
          </span>{" "}
          Both read the listing in your own browser. New cars land in Watching; only you move them between
          tiers.
        </p>
        <p className="mt-2 max-w-prose">For now only the board's owner can add cars.</p>

        {/* Phones put the assistants first: the extension needs Chrome on a computer. */}
        <div className="flex flex-col">
          <Part
            id="extension"
            className="max-sm:order-last"
            title="Chrome extension"
            intro="Opens beside the listing you are looking at: check what it read, fill any gaps and save. Saving a car that is already on the board records a re-check."
            requirement="Needs Chrome on a computer."
          >
            <Guide
              id="install"
              title="Install"
              note="To update, unzip the new version over the same folder and press reload on the extension's card."
            >
              <Step>
                {/* The release page also lists GitHub's "Source code" archives, which don't load as an extension. */}
                <p>
                  From the latest release, download <Menu>pitlane-extension-{extensionVersion}.zip</Menu> and unzip it into
                  a folder you keep.
                </p>
                <a
                  href={extensionRelease}
                  target="_blank"
                  rel="noreferrer"
                // The Copy fields' height: py-2 around a 20px line, inside the border.
                className={buttonVariants({ variant: "outline", className: "h-auto py-2" })}
                >
                  Download version {extensionVersion} from GitHub<span className="sr-only"> (opens in a new tab)</span>
                  <ArrowUpRight data-icon="inline-end" aria-hidden />
                </a>
              </Step>
              <Step>
                {/* Chrome won't open chrome:// pages from a web link, so it is copied, not linked. */}
                <p>Open this in Chrome's address bar and turn on <Menu>Developer mode</Menu>:</p>
                <CopyField value="chrome://extensions" />
              </Step>
              <Step>
                Choose <Menu>Load unpacked</Menu> and pick that folder.
              </Step>
              <Step>
                On a listing, open Chrome's <Menu>Extensions</Menu> menu (the puzzle piece) and choose Pitlane to open its
                side panel; pin it to keep it in the toolbar. It uses your Pitlane sign-in in the same browser.
              </Step>
              <Step>
                Check what it read and save. The car appears in Watching on your{" "}
                <Link to="/" className="underline underline-offset-4">
                  board
                </Link>
                .
              </Step>
            </Guide>
          </Part>

          <Part
            id="assistants"
            title="Claude or ChatGPT"
            intro="Once connected, your assistant can save the listings you open, re-check them, and read your board. It never moves cars between tiers."
          >
            <section aria-labelledby="url-heading" className="space-y-3">
              <h3 id="url-heading" className="font-semibold">
                Server URL
              </h3>
              <Separator />
              {url ? <CopyField value={url} /> : <Skeleton className="h-10" />}
              <p className="text-muted-foreground">
                You sign in to Pitlane when you add it, so nothing else needs to be copied.
              </p>
            </section>

            <Guide id="claude" title="Claude" source="https://claude.com/docs/connectors/custom/remote-mcp">
              <Step>
                Open <Menu>Customize › Connectors</Menu> in Claude on the web or the desktop app.
              </Step>
              <Step>
                Choose <Menu>Add custom connector</Menu>, name it Pitlane and paste the server URL.
              </Step>
              <Step>
                If it asks how Claude identifies itself, keep <Menu>Use Claude's published identity</Menu>. Leave the client
                ID and secret empty.
              </Step>
              <Step>
                Choose <Menu>Add</Menu>, then <Menu>Connect</Menu>, and sign in to Pitlane.
              </Step>
              <Step>
                In a chat, turn Pitlane on under <Menu>+ › Connectors</Menu>. The phone app picks it up from your account.
              </Step>
            </Guide>

            <Guide id="claude-code" title="Claude Code" source="https://code.claude.com/docs/en/mcp">
              <Step>
                <p>Run this in a terminal:</p>
                {url ? <CopyField value={`claude mcp add --transport http pitlane ${url}`} /> : <Skeleton className="h-10" />}
              </Step>
              <Step>
                In Claude Code, run <Menu>/mcp</Menu>, pick pitlane and sign in.
              </Step>
            </Guide>

            <Guide id="chatgpt" title="ChatGPT" source="https://developers.openai.com/api/docs/guides/custom-mcp-server">
              <Step>
                Open <Menu>Plugins</Menu> in ChatGPT on the web, choose <Menu>+</Menu>, then{" "}
                <Menu>Add custom MCP server</Menu>. Your plan or workspace has to allow custom servers.
              </Step>
              <Step>Name it Pitlane and paste the server URL.</Step>
              <Step>
                Set authentication to <Menu>OAuth</Menu> and leave the client ID and secret empty. If it asks how ChatGPT
                registers, pick client ID metadata documents (CIMD): Pitlane doesn't support dynamic registration.
              </Step>
              <Step>
                Accept the warning, choose <Menu>Create as a plugin</Menu>, then install the plugin and sign in to Pitlane.
              </Step>
              <Step>
                In a chat, type <Menu>@</Menu> and pick Pitlane. ChatGPT asks before each save; approve it.
              </Step>
            </Guide>

            <section aria-labelledby="ask-heading" className="space-y-3">
              <h3 id="ask-heading" className="font-semibold">
                Then ask
              </h3>
              <Separator />
              <p>
                The assistant has to see the listing page, so let it use your browser: Claude in Chrome, or ChatGPT's
                agent.
              </p>
              <ul className="space-y-1 pl-9 font-medium">
                <Ask>Save this listing to Pitlane.</Ask>
                <Ask>Re-check my Pitlane listings.</Ask>
                <Ask>Which cars on my Pitlane board have dropped in price?</Ask>
              </ul>
              <p>
                Saved cars appear in Watching on your{" "}
                <Link to="/" className="underline underline-offset-4">
                  board
                </Link>
                .
              </p>
            </section>
          </Part>
        </div>
      </div>
    </main>
  );
}

// One way of adding cars; its guides are the sections inside. Its heavier rule sets it above
// the guides' own heading-and-rule.
function Part({
  id,
  className,
  title,
  intro,
  requirement,
  children,
}: {
  id: string;
  className?: string;
  title: string;
  intro: string;
  requirement?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("mt-16", className)}>
      <h2 id={id} className="condensed border-b-2 border-foreground pb-2 text-2xl leading-none font-extrabold">
        {title}
      </h2>
      <p className="mt-3 max-w-prose text-muted-foreground">{intro}</p>
      {requirement && <p className="mt-2 max-w-prose">{requirement}</p>}
      <div className="mt-8 space-y-12">{children}</div>
    </section>
  );
}

function Guide({
  id,
  title,
  source,
  note,
  children,
}: {
  id: string;
  title: string;
  source?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id={`${id}-heading`} className="font-semibold">
          {title}
        </h3>
        {source && (
          <a
            href={source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {title} help<span className="sr-only"> (opens in a new tab)</span>
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      <Separator />
      <ol className="space-y-3 [counter-reset:step]">{children}</ol>
      {note && <p className="pl-9 text-muted-foreground">{note}</p>}
    </section>
  );
}

// The number is drawn by a CSS counter so it can be styled like the rest of the signage.
function Step({ children }: { children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 [counter-increment:step] before:condensed before:text-right before:text-lg before:leading-6 before:font-extrabold before:text-muted-foreground before:content-[counter(step)]">
      <div className="min-w-0 space-y-2 leading-6">{children}</div>
    </li>
  );
}

// A menu item or button label in the other product.
function Menu({ children }: { children: ReactNode }) {
  return <span className="font-semibold whitespace-nowrap">{children}</span>;
}

function Ask({ children }: { children: ReactNode }) {
  return <li>“{children}”</li>;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLSpanElement>(null);
  // Without the clipboard (plain-http origins) or permission, select the value for Ctrl+C instead.
  const select = () => field.current && getSelection()?.selectAllChildren(field.current);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="flex gap-2">
      {/* One line, so the field and Copy share a height; on phones it scrolls, and the fade shows there is more. */}
      <code className="min-w-0 flex-1 rounded-md border font-sans text-sm leading-5 font-medium">
        <span ref={field} className="block overflow-x-auto py-2 pr-8 pl-3 whitespace-nowrap [mask-image:linear-gradient(to_right,black_92%,transparent)]">
          {value}
        </span>
      </code>
      <Button
        variant="outline"
        className="h-auto"
        onClick={() => {
          if (navigator.clipboard) void navigator.clipboard.writeText(value).then(() => setCopied(true), select);
          else select();
        }}
      >
        {copied ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}
