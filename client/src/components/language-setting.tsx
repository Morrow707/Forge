import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { setPreferredLanguage, useT } from "@/i18n";
import { LANGUAGES, LANGUAGE_NATIVE_NAMES, languageOrEnglish, type Language } from "@shared/languages";
import type { PublicUser } from "@shared/schema";
import { cn } from "@/lib/utils";

/** THE LANGUAGE PICKER (2026-11-22), in Account Settings for every role. Saves users.language and
 *  puts it on screen at once. Each language is named in its own words, so a reader who cannot read
 *  the current one can still find theirs. The top bar's flip is separate and is not saved. */
export function LanguageSetting({ user }: { user: PublicUser }) {
  const t = useT();
  const qc = useQueryClient();
  const saved = languageOrEnglish(user.language);
  const save = useMutation({
    mutationFn: async (language: Language) =>
      (await (await apiRequest("PUT", "/api/account/language", { language })).json()) as PublicUser,
    onSuccess: (updated) => {
      // A self response carrying every flag, so it may replace the cached identity wholesale.
      qc.setQueryData(["/api/auth/me"], updated);
      setPreferredLanguage(languageOrEnglish(updated.language));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't save your language")),
  });

  return (
    <div className="space-y-1.5 border-t border-border pt-4" data-testid="language-setting">
      <Label>{t("Language")}</Label>
      <p className="text-xs text-muted-foreground">
        {t("Forge's own words are shown in this language. Coach notes and messages are translated by AI and marked as translated. Legal documents stay in English.")}
      </p>
      <div className="flex gap-2" role="radiogroup" aria-label={t("Language")}>
        {LANGUAGES.map((language) => (
          <button
            key={language}
            type="button"
            role="radio"
            aria-checked={saved === language}
            lang={language}
            disabled={save.isPending}
            onClick={() => language !== saved && save.mutate(language)}
            data-testid={`language-${language}`}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
              saved === language ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-surface-elevated",
            )}
          >
            {LANGUAGE_NATIVE_NAMES[language]}
          </button>
        ))}
      </div>
    </div>
  );
}
