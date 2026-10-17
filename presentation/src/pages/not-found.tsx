import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-6xl font-bold text-muted-foreground">404</p>
      <p className="text-muted-foreground">There is nothing at this address.</p>
      <Link to="/" className="text-primary underline underline-offset-4">
        Back to start
      </Link>
    </main>
  );
}
