import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="font-display text-6xl font-extrabold text-primary">404</h1>
      <p className="text-muted-foreground">{t("This page doesn't exist.")}</p>
      <Link href="/">
        <Button>{t("Back home")}</Button>
      </Link>
    </div>
  );
}
