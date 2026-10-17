import type { Health } from "@mvp/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { Link } from "react-router";
import { enabledNav, type ModuleId } from "@/app.config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, unwrap } from "@/lib/api";

const MODULE_BLURB: Record<ModuleId, string> = {
  items: "Full CRUD chain: schema → API → typed client → form. Copy it, rename it.",
  chat: "Streaming LLM chat. Swap providers with one env var; runs in mock mode without a key.",
  live: "WebSocket channel demo. Anything that changes shows up in every open tab.",
  apiKeys: "Mint keys so scripts, bots and hardware can call the same API.",
  python: "Optional FastAPI side-car, proxied through the api so auth is shared.",
};

export function DashboardPage() {
  const modules = enabledNav().filter((n) => n.id !== "dashboard");

  return (
    <>
      <HealthCard />
      <section>
        <h2 className="mb-3 text-lg font-semibold">Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <Card key={m.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <m.icon className="size-4" /> {m.label}
                </CardTitle>
                <CardDescription>{MODULE_BLURB[m.id as ModuleId]}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild variant="outline" size="sm">
                  <Link to={m.path}>
                    Open <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}

function HealthCard() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.api.health.$get().then((r) => unwrap<Health>(r)),
    refetchInterval: 15_000,
  });

  if (health.isPending) return <Skeleton className="h-20 w-full" />;

  if (health.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>API unreachable</AlertTitle>
        <AlertDescription>
          {health.error.message}. Is the api running? Try <code>npm run dev</code> from the repo root.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <CircleCheck />
      <AlertTitle className="flex items-center gap-2">
        API connected <Badge variant="secondary">v{health.data.version}</Badge>
        <Badge variant="outline">db: {health.data.db}</Badge>
      </AlertTitle>
      <AlertDescription>
        Server time {new Date(health.data.time).toLocaleTimeString()}. Interactive docs at{" "}
        <a href="/docs" className="underline underline-offset-4">
          /docs
        </a>
        .
      </AlertDescription>
    </Alert>
  );
}
