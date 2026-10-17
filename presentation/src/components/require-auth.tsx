import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { authClient } from "@/lib/auth";

/** Wrap a route element: renders it only for signed-in users, else → /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (!data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
