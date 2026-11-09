import { Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenContext, useToken } from "./token";

export function Root() {
  const [token, setToken] = useToken();
  const board = useQuery(api.board.get, token ? { token } : "skip");

  if (!token || board === null) {
    return <Connect rejected={board === null ? token : null} onConnect={setToken} />;
  }

  return (
    <TokenContext value={token}>
      <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-8">
        <Link
          to="/"
          className="condensed rounded-md bg-slab px-2 py-1 text-2xl leading-none font-extrabold tracking-tight text-slab-foreground"
        >
          Pitlane
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/settings"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            activeProps={{ "aria-current": "page", className: "underline underline-offset-4" }}
          >
            <SlidersHorizontal data-icon="inline-start" aria-hidden />
            Models and key specs
          </Link>
          <Button variant="ghost" size="sm" onClick={() => setToken(null)}>
            Sign out
          </Button>
        </div>
      </header>
      <Outlet />
    </TokenContext>
  );
}

// `rejected` is the token that failed, kept in the field so it can be checked.
function Connect({ rejected, onConnect }: { rejected: string | null; onConnect: (token: string) => void }) {
  const [value, setValue] = useState(rejected ?? "");
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* The pit board: the product's signature, the only yellow on the screen. */}
      <div className="flex min-h-[28svh] items-end bg-signal px-4 pt-10 pb-6 text-signal-foreground sm:px-8 lg:min-h-svh lg:px-12 lg:pb-12">
        <p className="condensed text-[clamp(4.5rem,16vw,11rem)] leading-[0.8] font-extrabold tracking-tight">Pitlane</p>
      </div>
      {/* A fixed top offset, so the form does not jump when the error appears. */}
      <div className="px-4 pt-10 pb-12 sm:px-8 lg:px-16 lg:pt-[24svh]">
        <form
          className="max-w-md space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) onConnect(value.trim());
          }}
        >
          <div className="space-y-1">
            <h1 className="condensed text-4xl leading-none font-extrabold">Open your board</h1>
            <p className="text-muted-foreground">Paste an API token. It is kept in this browser only.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">API token</Label>
            <Input
              id="token"
              // A rejected token is shown in full so it can be checked.
              type={rejected === null ? "password" : "text"}
              autoComplete="off"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="pit_…"
              aria-invalid={rejected !== null || undefined}
              className="h-10"
            />
          </div>
          {rejected !== null && (
            <Alert variant="destructive">
              <AlertDescription>
                That token doesn't open a board. Check it, or create a new one with{" "}
                <code className="font-sans font-semibold text-foreground">pnpm convex run tokens:create</code>.
              </AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" className="h-10 w-full sm:w-auto sm:px-6">
            Open board
          </Button>
        </form>
      </div>
    </main>
  );
}
