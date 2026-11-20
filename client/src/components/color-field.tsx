import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageColorPicker, type ColorSource } from "@/components/image-color-picker";
import { getJson, resolveApiUrl } from "@/lib/queryClient";
import type { EffectiveBranding } from "@/lib/branding-style";
import { normalizeHex, readRecentColors, rememberColor } from "@/lib/color-input";
import { cn } from "@/lib/utils";

/** EVERY COLOR IN THE APP IS SET HERE (Scott, 2026-11-20: "wherever there is a place to add color
 *  ... make there be a space to add colors, to change colors or to input colors, and the little
 *  inkblot thing where i can click on an image and capture that color").
 *
 *  A box to type or paste a color ("#003262", "003262", "#036"), the color wheel, the eyedropper
 *  (ImageColorPicker: the program's logo, a picture the coach chooses, the video frame where there
 *  is one, and the browser's own screen eyedropper where it exists), and a row of quick colors: the
 *  program's own and the ones used lately on this device. `color-fields-everywhere.test.ts` holds
 *  every color the app lets a person set to this component. */
export function ColorField({
  label,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "Forge's color",
  extraSources,
  hideLabel = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** The color may be left unset (Forge's own is used). Shows a button that clears it. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** More pictures to take a color from, read when the eyedropper opens (a video's current frame). */
  extraSources?: () => ColorSource[];
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [sources, setSources] = useState<ColorSource[]>([]);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => setRecent(readRecentColors()), []);

  // The program's own colors and logo, from the same query (and cache) the app re-skins itself with.
  const { data: branding } = useQuery<EffectiveBranding>({
    queryKey: ["/api/branding/me"],
    queryFn: () => getJson("/api/branding/me"),
    staleTime: Infinity,
  });

  const current = normalizeHex(value);
  const valid = normalizeHex(draft);

  function choose(hex: string) {
    setDraft(hex);
    onChange(hex);
    rememberColor(hex);
    setRecent(readRecentColors());
  }

  function commitDraft() {
    if (valid) {
      if (valid !== current) choose(valid);
      else setDraft(valid);
      return;
    }
    if (allowEmpty && draft.trim() === "") {
      onChange("");
      return;
    }
    // Not a color: put back what was there rather than leave a broken value on screen.
    setDraft(value);
  }

  function openPicker() {
    const own: ColorSource[] = branding?.brandLogoUrl ? [{ label: "Your logo", src: resolveApiUrl(branding.brandLogoUrl) }] : [];
    setSources([...(extraSources?.() ?? []), ...own]);
    setPicking(true);
  }

  const quick = [branding?.brandPrimaryColor, branding?.brandSecondaryColor, ...recent]
    .map((c) => (c ? normalizeHex(c) : null))
    .filter((c, i, all): c is string => !!c && all.indexOf(c) === i);

  return (
    <div className="space-y-1.5">
      {!hideLabel && <Label>{label}</Label>}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDraft();
          }}
          placeholder={allowEmpty ? emptyLabel : "#003262"}
          aria-label={`${label} color code`}
          aria-invalid={draft.trim() !== "" && !valid}
          className={cn("min-w-0 font-mono uppercase", draft.trim() !== "" && !valid && "border-destructive")}
          maxLength={7}
          disabled={disabled}
        />
        <input
          type="color"
          aria-label={`${label} color wheel`}
          value={(valid ?? current ?? "#000000").toLowerCase()}
          onChange={(e) => choose(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Take ${label} from a picture`}
          title="Take a color from a picture"
          data-testid="color-field-eyedropper"
          onClick={openPicker}
          disabled={disabled}
        >
          <Pipette className="h-4 w-4" />
        </Button>
      </div>
      {draft.trim() !== "" && !valid && (
        <p className="text-xs text-destructive">Type a color code like #003262 or 036.</p>
      )}
      {(quick.length > 0 || (allowEmpty && current)) && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="color-field-quick">
          {quick.map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              aria-label={`Use ${c}`}
              title={c}
              onClick={() => choose(c)}
              className={cn(
                "h-6 w-6 rounded-full border shadow-sm transition-transform hover:scale-110",
                c === current ? "border-foreground ring-2 ring-foreground/30" : "border-border",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          {allowEmpty && current && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setDraft("");
                onChange("");
              }}
              className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Use {emptyLabel}
            </button>
          )}
        </div>
      )}
      <ImageColorPicker open={picking} onOpenChange={setPicking} sources={sources} label={label} onPick={choose} />
    </div>
  );
}
