import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProfileFieldsValue = {
  age: string;
  heightIn: string;
  bodyWeightLbs: string;
  sport: string;
  position: string;
};

export const emptyProfileFields: ProfileFieldsValue = {
  age: "",
  heightIn: "",
  bodyWeightLbs: "",
  sport: "",
  position: "",
};

export function ProfileFieldsForm({
  value,
  onChange,
  idPrefix,
}: {
  value: ProfileFieldsValue;
  onChange: (next: ProfileFieldsValue) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
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
  );
}

export function formatHeight(heightIn: number | null | undefined) {
  if (heightIn == null) return null;
  const feet = Math.floor(heightIn / 12);
  const inches = heightIn % 12;
  return `${feet}'${inches}"`;
}
