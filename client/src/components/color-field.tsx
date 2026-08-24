import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pipette } from "lucide-react";

// Not yet in TypeScript's DOM lib -- Chrome/Edge only, feature-detected
// at every call site below rather than assumed present.
declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
  }
}

/** Exact-hex-first color input: a text field for typing/pasting a precise
 * hex value, a native color wheel as the quick-pick fallback, and a
 * eyedropper button where the browser supports it (sampling any
 * on-screen pixel, not just this page). Shared between the branding
 * dialog and a coach's own personal accent picker so both get the same
 * "exact colors, not a generic wheel" treatment. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const hasEyedropper = typeof window !== "undefined" && !!window.EyeDropper;

  function commit(next: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
  }

  async function pickWithEyedropper() {
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      setDraft(result.sRGBHex);
      commit(result.sRGBHex);
    } catch {
      // User cancelled the pick -- not an error.
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          placeholder="#003262"
          className="font-mono uppercase"
          maxLength={7}
        />
        <input
          type="color"
          aria-label={`${label} picker`}
          value={/^#[0-9a-fA-F]{6}$/.test(draft) ? draft : "#000000"}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        {hasEyedropper && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Sample ${label} from screen`}
            onClick={pickWithEyedropper}
          >
            <Pipette className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
