import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowUpRight, Check, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// How to add Pitlane's MCP server to Claude or ChatGPT. Menu names follow each product's
// own help pages; they move now and then, so each section links to the source.
export function Connect() {
  const url = useQuery(api.mcp.serverUrl);
  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <div className="max-w-3xl">
        <Link to="/" className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Board
        </Link>
        <h1 className="condensed mt-4 text-4xl leading-none font-extrabold">Connect Claude or ChatGPT</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Once connected, your assistant can save the listings you open, re-check them, and read your board. It never
          moves cars between tiers; new cars land in Watching.
        </p>
        <p className="mt-2 max-w-prose">For now only the board's owner can connect an assistant.</p>

        <section aria-labelledby="url-heading" className="mt-8 space-y-3">
          <h2 id="url-heading" className="font-semibold">
            Server URL
          </h2>
          <Separator />
          {url ? <CopyField value={url} /> : <Skeleton className="h-10" />}
          <p className="text-sm text-muted-foreground">
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
            Set authentication to <Menu>OAuth</Menu> and leave the client ID and secret empty.
          </Step>
          <Step>
            Accept the warning, choose <Menu>Create as a plugin</Menu>, then install the plugin and sign in to Pitlane.
          </Step>
          <Step>
            In a chat, type <Menu>@</Menu> and pick Pitlane. ChatGPT asks before each save; approve it.
          </Step>
        </Guide>

        <section aria-labelledby="ask-heading" className="mt-12 space-y-3">
          <h2 id="ask-heading" className="font-semibold">
            Then ask
          </h2>
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
        </section>
      </div>
    </main>
  );
}

function Guide({ id, title, source, children }: { id: string; title: string; source: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-12 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`${id}-heading`} className="font-semibold">
          {title}
        </h2>
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {title} help<span className="sr-only"> (opens in a new tab)</span>
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </div>
      <Separator />
      <ol className="space-y-3 [counter-reset:step]">{children}</ol>
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
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="flex gap-2">
      {/* One line, so the field and Copy share a height; on phones it scrolls, and the fade shows there is more. */}
      <code className="min-w-0 flex-1 rounded-md border font-sans text-sm leading-5 font-medium">
        <span className="block overflow-x-auto px-3 py-2 whitespace-nowrap [mask-image:linear-gradient(to_right,black_92%,transparent)]">
          {value}
        </span>
      </code>
      <Button
        variant="outline"
        className="h-auto"
        // The clipboard API only exists on secure origins; over plain http the value stays selectable.
        onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {})}
      >
        {copied ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}
