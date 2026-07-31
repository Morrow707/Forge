import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="font-display text-6xl font-extrabold text-primary">404</h1>
      <p className="text-muted-foreground">This page doesn't exist.</p>
      <Link href="/">
        <Button>Back home</Button>
      </Link>
    </div>
  );
}
