import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { translateUserText } from "@/i18n/translate-user-text";
import { cn } from "@/lib/utils";

/** TEXT A PERSON TYPED, IN THE READER'S LANGUAGE (2026-11-22). A coach's note or a message: in
 *  English it is drawn exactly as written; in another language it is translated by the server's AI
 *  the first time it is seen, labelled "Translated", with "Show original" beside it. Until the
 *  translation arrives, or if it cannot be made, the original is shown. Never wrap a legal
 *  document, a number, or the reader's own words in this. */
export function TranslatableText({
  text,
  className,
  as: Tag = "p",
}: {
  text: string;
  className?: string;
  as?: "p" | "span" | "div";
}) {
  const t = useT();
  const [translated, setTranslated] = useState<{ text: string; language: string; value: string } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const language = t.language;

  useEffect(() => {
    if (language === "en") return;
    let live = true;
    const load = async () => {
      const value = await translateUserText(text, language);
      if (live && value != null) setTranslated({ text, language, value });
    };
    void load();
    return () => {
      live = false;
    };
  }, [text, language]);

  const current = translated && translated.text === text && translated.language === language ? translated.value : null;
  if (language === "en" || current == null || current === text) {
    return <Tag className={className}>{text}</Tag>;
  }
  return (
    <div className="space-y-1">
      <Tag className={className} lang={showOriginal ? undefined : language}>
        {showOriginal ? text : current}
      </Tag>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{showOriginal ? t("Original") : t("Translated")}</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          className={cn("underline underline-offset-2 hover:text-foreground")}
          onClick={() => setShowOriginal((v) => !v)}
          data-testid="button-show-original"
        >
          {showOriginal ? t("Show translation") : t("Show original")}
        </button>
      </p>
    </div>
  );
}
