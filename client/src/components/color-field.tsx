import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageColorPicker, type ColorSource } from "@/components/image-color-picker";
import { getJson, resolveApiUrl } from "@/lib/queryClient";
import type { EffectiveBranding } from "@/lib/branding-style";
import { TEAM_COLORS, normalizeHex, readRecentColors, rememberColor, shadesOf } from "@/lib/color-input";
import { cn } from "@/lib/utils";
import { msg, useT } from "@/i18n";

/** EVERY COLOR IN THE APP IS SET HERE (Scott, 2026-11-20: "wherever there is a place to add color
 *  ... make there be a space to add colors, to change colors or to input colors, and the little
 *  inkblot thing where i can click on an image and capture that color").
 *
 *  A box to type or paste a color ("#0B3D91", "0B3D91", "#036"), the color wheel, the eyedropper
 *  (ImageColorPicker: the program's logo, a picture the coach chooses, the video frame where there
 *  is one, and the browser's own screen eyedropper where it exists), and a row of quick colors: the
 *  program's own and the ones used lately on this device. `color-fields-everywhere.test.ts` holds
 *  every color the app lets a person set to this component. */
export function ColorField({
  label,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = msg("Forge's color"),
  extraSources,
  hideLabel = false,
  disabled = false,
  suggested = [],
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
  /** Named rows of colors to offer, e.g. "From your logo" and "Your saved palette". */
  suggested?: { label: string; colors: string[] }[];
}) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [sources, setSources] = useState<ColorSource[]>([]);
  const [more, setMore] = useState(false);
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
    const own: ColorSource[] = branding?.brandLogoUrl ? [{ label: t("Your logo"), src: resolveApiUrl(branding.brandLogoUrl) }] : [];
    setSources([...(extraSources?.() ?? []), ...own]);
    setPicking(true);
  }

  // A color already shown in a named row below is not shown again here.
  const inRows = new Set(suggested.flatMap((row) => row.colors.map((c) => normalizeHex(c))));
  const quick = [branding?.brandPrimaryColor, branding?.brandSecondaryColor, ...recent]
    .map((c) => (c ? normalizeHex(c) : null))
    .filter((c, i, all): c is string => !!c && all.indexOf(c) === i && !inRows.has(c));

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
          placeholder={allowEmpty ? t(emptyLabel) : "#0B3D91"}
          aria-label={t("{label} color code", { label })}
          aria-invalid={draft.trim() !== "" && !valid}
          className={cn("min-w-0 font-mono uppercase", draft.trim() !== "" && !valid && "border-destructive")}
          maxLength={7}
          disabled={disabled}
        />
        <input
          type="color"
          aria-label={t("{label} color wheel", { label })}
          value={(valid ?? current ?? "#000000").toLowerCase()}
          onChange={(e) => choose(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("Take {label} from a picture", { label })}
          title={t("Take a color from a picture")}
          data-testid="color-field-eyedropper"
          onClick={openPicker}
          disabled={disabled}
        >
          <Pipette className="h-4 w-4" />
        </Button>
      </div>
      {draft.trim() !== "" && !valid && (
        <p className="text-xs text-destructive">{t("Type a color code like #0B3D91 or 036.")}</p>
      )}
      {(quick.length > 0 || (allowEmpty && current)) && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="color-field-quick">
          {quick.map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              aria-label={t("Use {color}", { color: c })}
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
              {t("Use {label}", { label: t(emptyLabel) })}
            </button>
          )}
        </div>
      )}
      {suggested
        .map((row) => ({ ...row, colors: row.colors.map((c) => normalizeHex(c)).filter((c): c is string => !!c) }))
        .filter((row) => row.colors.length > 0)
        .map((row) => (
          <div key={row.label} className="space-y-1">
            <p className="text-[11px] text-muted-foreground">{row.label}</p>
            <SwatchRow colors={row.colors.map((hex) => ({ hex, name: hex }))} current={current} disabled={disabled} onPick={choose} />
          </div>
        ))}
      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        data-testid="color-field-more"
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", more && "rotate-180")} />
        {more ? t("Fewer colors") : t("More colors ({count} team colors and shades)", { count: TEAM_COLORS.length })}
      </button>
      {more && (
        <div className="space-y-2 rounded-md border border-border p-2.5" data-testid="color-field-more-panel">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">{t("Team colors")}</p>
            <SwatchRow colors={TEAM_COLORS} current={current} disabled={disabled} onPick={choose} />
          </div>
          {current && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">{t("Lighter and darker {color}", { color: current })}</p>
              <SwatchRow colors={shadesOf(current).map((hex) => ({ hex, name: hex }))} current={current} disabled={disabled} onPick={choose} />
            </div>
          )}
        </div>
      )}
      <ImageColorPicker open={picking} onOpenChange={setPicking} sources={sources} label={label} onPick={choose} />
    </div>
  );
}

/** A row of round swatches; the color in use is ringed. Each says its name on hover and to a
 *  screen reader. */
function SwatchRow({
  colors,
  current,
  disabled,
  onPick,
}: {
  colors: readonly { hex: string; name: string }[];
  current: string | null;
  disabled: boolean;
  onPick: (hex: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => {
        const hex = normalizeHex(c.hex) ?? c.hex;
        return (
          <button
            key={hex}
            type="button"
            disabled={disabled}
            aria-label={c.name === hex ? t("Use {color}", { color: hex }) : t("Use {name}, {color}", { name: c.name, color: hex })}
            title={c.name === hex ? hex : `${c.name} ${hex}`}
            onClick={() => onPick(hex)}
            className={cn(
              "h-6 w-6 rounded-full border shadow-sm transition-transform hover:scale-110",
              hex === current ? "border-foreground ring-2 ring-foreground/30" : "border-border",
            )}
            style={{ backgroundColor: hex }}
          />
        );
      })}
    </div>
  );
}
