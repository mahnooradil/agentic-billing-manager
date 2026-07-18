import { siteConfig } from "@/config/site";

/** Slim app footer with copyright and a build/preview tag. */
export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 sm:flex-row sm:px-6 lg:px-8">
        <p className="text-xs text-muted-foreground">
          © {year} {siteConfig.name}. All rights reserved.
        </p>
        <p className="text-xs text-muted-foreground">
          v{siteConfig.version} · UI Preview
        </p>
      </div>
    </footer>
  );
}
