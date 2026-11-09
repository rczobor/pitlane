import { Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenContext, useToken } from "./token";

export function Root() {
  const [token, setToken] = useToken();
  const board = useQuery(api.board.get, token ? { token } : "skip");

  if (!token || board === null) {
    return <Connect rejected={board === null} onConnect={setToken} />;
  }

  return (
    <TokenContext value={token}>
      <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-8">
        <Link to="/" className="condensed rounded-sm text-3xl font-extrabold tracking-tight">
          Pitlane
        </Link>
        <Button variant="ghost" size="sm" onClick={() => setToken(null)}>
          Sign out
        </Button>
      </header>
      <Outlet />
    </TokenContext>
  );
}

function Connect({ rejected, onConnect }: { rejected: boolean; onConnect: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <main className="mx-auto max-w-md px-4 pt-[16vh]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onConnect(value.trim());
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="condensed text-5xl leading-none font-extrabold tracking-tight">Pitlane</CardTitle>
            <CardDescription>Paste an API token to open your board. It is kept in this browser only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="token">API token</Label>
              <Input
                id="token"
                type="password"
                autoComplete="off"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="pit_…"
                aria-invalid={rejected || undefined}
                className="font-mono"
              />
            </div>
            {rejected && (
              <Alert variant="destructive">
                <AlertDescription>
                  That token doesn't open a board. Check it, or create a new one with{" "}
                  <code>pnpm convex run tokens:create</code>.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" size="lg" className="w-full">
              Open board
            </Button>
          </CardFooter>
        </Card>
      </form>
    </main>
  );
}
