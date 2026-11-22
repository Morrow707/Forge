import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { languageOrEnglish } from "@shared/languages";
import { setPreferredLanguage } from "./index";

/** Puts the signed-in person's saved language (users.language, null = English) on screen. Before
 *  sign-in the device's last choice, or the browser's language, stands. Renders nothing. */
export function LanguageSync() {
  const { user } = useAuth();
  const saved = user ? languageOrEnglish(user.language) : null;
  useEffect(() => {
    if (saved) setPreferredLanguage(saved);
  }, [saved]);
  return null;
}
