import { ArrowRight, BookOpen } from "lucide-react";
import { Link } from "react-router";
import { appConfig } from "@/app.config";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

// Deliberately a shell, not a product: every word comes from app.config.ts.
export function LandingPage() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden>{appConfig.logo}</span>
          {appConfig.name}
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-24 text-center">
        <h1 className="max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          {appConfig.tagline}
        </h1>
        <p className="max-w-xl text-balance text-muted-foreground">{appConfig.description}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/app">
              Open the app <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="/docs">
              <BookOpen /> API docs
            </a>
          </Button>
        </div>
      </section>
    </main>
  );
}
