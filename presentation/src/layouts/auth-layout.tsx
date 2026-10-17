import { Link } from "react-router";
import { appConfig } from "@/app.config";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
};

/** Centered card used by the login and sign-up pages. */
export function AuthLayout({ title, description, children, footer }: Props) {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden>{appConfig.logo}</span>
          {appConfig.name}
        </Link>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-start justify-center px-4 pt-8 sm:items-center sm:pt-0">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {children}
            <p className="text-center text-sm text-muted-foreground">{footer}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
