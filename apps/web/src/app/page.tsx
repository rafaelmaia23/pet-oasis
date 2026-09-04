import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Pet Oasis</h1>
          <p className="text-muted-foreground">
            A aplicação está de pé, com a identidade visual Eucalipto &amp;
            Creme nos dois temas.
          </p>
        </div>
        <ThemeToggle />
      </div>
      <div>
        <Button render={<Link href="/design" />}>Ver o design system</Button>
      </div>
    </main>
  );
}
