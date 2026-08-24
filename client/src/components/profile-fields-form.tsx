import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ProfileFieldsValue = {
  name: string;
  age: string;
  gender: string;
  heightIn: string;
  bodyWeightLbs: string;
  sport: string;
  position: string;
  // "" means unset; otherwise one of the seasonPhaseEnum values (snake_case,
  // matching the DB) -- fed straight to the AI so it doesn't have to guess
  // or ask where in the season this athlete currently is.
  seasonPhase: string;
  // "" means no preference; otherwise one of trainingStylePreferenceEnum's
  // values -- fed to the AI program builder as a standing instruction (see
  // COMBINATION_EXERCISE_TRAINING_PRINCIPLES in storage.ts) so it doesn't
  // have to be re-asked for on every single program request.
  trainingStylePreference: string;
  fortyYardDash: string;
  verticalJumpIn: string;
  broadJumpIn: string;
  proAgilitySeconds: string;
  benchMaxLbs: string;
  squatMaxLbs: string;
  deadliftMaxLbs: string;
  bio: string;
};

export const emptyProfileFields: ProfileFieldsValue = {
  name: "",
  age: "",
  gender: "",
  heightIn: "",
  bodyWeightLbs: "",
  sport: "",
  position: "",
  seasonPhase: "",
  trainingStylePreference: "",
  fortyYardDash: "",
  verticalJumpIn: "",
  broadJumpIn: "",
  proAgilitySeconds: "",
  benchMaxLbs: "",
  squatMaxLbs: "",
  deadliftMaxLbs: "",
  bio: "",
};

const SEASON_PHASE_OPTIONS = [
  { value: "off_season", label: "Off-season" },
  { value: "pre_season", label: "Pre-season" },
  { value: "in_season", label: "In-season" },
  { value: "taper", label: "Taper / playoffs" },
];

const TRAINING_STYLE_OPTIONS = [
  { value: "traditional", label: "Traditional (compound + isolation)" },
  { value: "combination_circuit", label: "Combination / circuit-style" },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export function ProfileFieldsForm({
  value,
  onChange,
  idPrefix,
  showName = true,
  showBio = false,
  dateOfBirth,
}: {
  value: ProfileFieldsValue;
  onChange: (next: ProfileFieldsValue) => void;
  idPrefix: string;
  /** Hide the name field when a caller already shows it elsewhere (e.g. as
   * the dialog title). Defaults to shown. */
  showName?: boolean;
  /** Self-authored "about me/goals" text -- only shown when an athlete is
   * editing their own profile (EditMyProfileDialog), never when a coach
   * edits an athlete's profile (athlete-profile-dialog.tsx uses the same
   * shared form for the performance fields below, but a coach writing an
   * athlete's own bio for them defeats the point of it). Defaults off. */
  showBio?: boolean;
  /** Read-only for now -- collected once at signup (see signup.tsx/claim.tsx)
   * for age-tier purposes (shared/privacy-tiers.ts), not yet editable here.
   * Deliberately not reconciled with the Age field above, which stays its
   * own separately-entered value; unifying them is a follow-up, not this
   * change. Omitted entirely (not even an empty row) when the account
   * predates this field. */
  dateOfBirth?: string | null;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {showName && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-name`}>Name</Label>
            <Input
              id={`${idPrefix}-name`}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </div>
        )}
        {showBio && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-bio`}>About me / goals</Label>
            <Textarea
              id={`${idPrefix}-bio`}
              value={value.bio}
              onChange={(e) => onChange({ ...value, bio: e.target.value })}
              placeholder="What you're training for, in your own words"
              maxLength={300}
              className="min-h-20"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-sport`}>Sport</Label>
          <Input
            id={`${idPrefix}-sport`}
            value={value.sport}
            onChange={(e) => onChange({ ...value, sport: e.target.value })}
            placeholder="e.g. Football"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-position`}>Position</Label>
          <Input
            id={`${idPrefix}-position`}
            value={value.position}
            onChange={(e) => onChange({ ...value, position: e.target.value })}
            placeholder="e.g. Linebacker"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-season`}>Season phase</Label>
          <Select
            value={value.seasonPhase || "unset"}
            onValueChange={(v) =>
              onChange({ ...value, seasonPhase: v === "unset" ? "" : v })
            }
          >
            <SelectTrigger id={`${idPrefix}-season`}>
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              {SEASON_PHASE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-training-style`}>Training style preference</Label>
          <Select
            value={value.trainingStylePreference || "unset"}
            onValueChange={(v) =>
              onChange({ ...value, trainingStylePreference: v === "unset" ? "" : v })
            }
          >
            <SelectTrigger id={`${idPrefix}-training-style`}>
              <SelectValue placeholder="No preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">No preference</SelectItem>
              {TRAINING_STYLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Tells the AI program builder whether to lean on standard compound lifts and isolation
            accessories, or prioritize combination/circuit-style exercises that chain multiple
            movements together to keep the heart rate up in less time.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-age`}>Age</Label>
          <Input
            id={`${idPrefix}-age`}
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            value={value.age}
            onChange={(e) => onChange({ ...value, age: e.target.value })}
          />
        </div>
        {dateOfBirth && (
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <p className="flex h-9 items-center rounded-md border border-transparent px-3 text-sm text-muted-foreground">
              {new Date(`${dateOfBirth}T00:00:00`).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-gender`}>Gender</Label>
          <Select
            value={value.gender || "unset"}
            onValueChange={(v) => onChange({ ...value, gender: v === "unset" ? "" : v })}
          >
            <SelectTrigger id={`${idPrefix}-gender`}>
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              {GENDER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-height`}>Height (inches)</Label>
          <Input
            id={`${idPrefix}-height`}
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            value={value.heightIn}
            onChange={(e) => onChange({ ...value, heightIn: e.target.value })}
            placeholder="e.g. 72"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-weight`}>Body weight (lbs)</Label>
          <Input
            id={`${idPrefix}-weight`}
            type="number"
            inputMode="decimal"
            min={0}
            max={1500}
            value={value.bodyWeightLbs}
            onChange={(e) => onChange({ ...value, bodyWeightLbs: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Testing / Combine
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-forty`}>40-Yard Dash (sec)</Label>
            <Input
              id={`${idPrefix}-forty`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              max={20}
              value={value.fortyYardDash}
              onChange={(e) => onChange({ ...value, fortyYardDash: e.target.value })}
              placeholder="e.g. 4.85"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-agility`}>Pro Agility (sec)</Label>
            <Input
              id={`${idPrefix}-agility`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              max={20}
              value={value.proAgilitySeconds}
              onChange={(e) => onChange({ ...value, proAgilitySeconds: e.target.value })}
              placeholder="e.g. 4.5"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-vertical`}>Vertical Jump (in)</Label>
            <Input
              id={`${idPrefix}-vertical`}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={60}
              value={value.verticalJumpIn}
              onChange={(e) => onChange({ ...value, verticalJumpIn: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-broad`}>Broad Jump (in)</Label>
            <Input
              id={`${idPrefix}-broad`}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={200}
              value={value.broadJumpIn}
              onChange={(e) => onChange({ ...value, broadJumpIn: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-bench`}>Bench Max (lbs)</Label>
            <Input
              id={`${idPrefix}-bench`}
              type="number"
              inputMode="decimal"
              min={0}
              max={1500}
              value={value.benchMaxLbs}
              onChange={(e) => onChange({ ...value, benchMaxLbs: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-squat`}>Squat Max (lbs)</Label>
            <Input
              id={`${idPrefix}-squat`}
              type="number"
              inputMode="decimal"
              min={0}
              max={1500}
              value={value.squatMaxLbs}
              onChange={(e) => onChange({ ...value, squatMaxLbs: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-deadlift`}>Deadlift Max (lbs)</Label>
            <Input
              id={`${idPrefix}-deadlift`}
              type="number"
              inputMode="decimal"
              min={0}
              max={1500}
              value={value.deadliftMaxLbs}
              onChange={(e) => onChange({ ...value, deadliftMaxLbs: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatHeight(heightIn: number | null | undefined) {
  if (heightIn == null) return null;
  const feet = Math.floor(heightIn / 12);
  const inches = heightIn % 12;
  return `${feet}'${inches}"`;
}
