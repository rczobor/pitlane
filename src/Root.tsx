import { Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/settings" />}>
            <SlidersHorizontal data-icon="inline-start" aria-hidden />
            Models and key specs
          </Button>
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
  // A fixed top offset, so the form does not jump when the error appears.
  return (
    <main className="mx-auto max-w-md px-4 pt-[20vh] pb-12">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onConnect(value.trim());
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="mb-2">
              {/* The wordmark on a pit board, the product's signature. */}
              <span className="condensed inline-block rounded-md bg-signal px-3 py-1.5 text-5xl leading-none font-extrabold tracking-tight text-signal-foreground">
                Pitlane
              </span>
            </CardTitle>
            <CardDescription>Paste an API token to open your board. It is kept in this browser only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <Button type="submit" size="lg" className="w-full">
              Open board
            </Button>
          </CardContent>
        </Card>
      </form>
    </main>
  );
}
