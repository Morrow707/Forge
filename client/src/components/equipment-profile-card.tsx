/* eslint-disable ts-patterns/no-magic-numbers -- written in this repo's own style; the behaviour is pinned by equipment-profile.itest.ts */
/**
 * THE "EQUIPMENT" SETTINGS CARD (2026-11-21). A checklist of what a weight room has. A coach sees
 * their program's default room and one per team (the head coach edits, staff read); everybody who
 * trains on their own sees their own room. No checklist saved means "everything is available", so
 * a card that was never touched changes nothing. See shared/equipment-profile.ts.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { EQUIPMENT_ITEMS, type EquipmentId, type EquipmentRoom } from "@shared/equipment-profile";
import { msg, translate, useT } from "@/i18n";

const ALL_IDS = EQUIPMENT_ITEMS.map((i) => i.id) as EquipmentId[];

function EquipmentChecklistEditor({
  room,
  canEdit,
  saving,
  onSave,
  onClear,
  testIdPrefix,
  fallback = null,
  unsetNote = msg("Not set yet, so Forge assumes everything is here."),
}: {
  room: EquipmentRoom | null;
  /** What applies while this room is unset (a team inherits the program default). */
  fallback?: EquipmentRoom | null;
  unsetNote?: string;
  canEdit: boolean;
  saving: boolean;
  onSave: (room: EquipmentRoom) => void;
  onClear?: () => void;
  testIdPrefix: string;
}) {
  const t = useT();
  // A room with no profile starts with everything ticked: the honest starting point for "untick
  // what you don't have".
  const start = room ?? fallback;
  const [items, setItems] = useState<Set<EquipmentId>>(new Set(start ? start.items : ALL_IDS));
  const [dumbbellMax, setDumbbellMax] = useState<string>(start?.dumbbellMaxLbs ? String(start.dumbbellMaxLbs) : "");
  useEffect(() => {
    setItems(new Set(start ? start.items : ALL_IDS));
    setDumbbellMax(start?.dumbbellMaxLbs ? String(start.dumbbellMaxLbs) : "");
  }, [start]);

  const toggle = (id: EquipmentId, on: boolean) =>
    setItems((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const bodyweightOnly = items.size === 0;

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-editor`}>
      {!room && <p className="text-xs text-muted-foreground">{t(unsetNote)}</p>}
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={bodyweightOnly}
          disabled={!canEdit}
          onCheckedChange={(c) => setItems(c === true ? new Set() : new Set(ALL_IDS))}
          data-testid={`${testIdPrefix}-none`}
        />
        {t("None (bodyweight only)")}
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EQUIPMENT_ITEMS.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={items.has(item.id)}
              disabled={!canEdit}
              onCheckedChange={(c) => toggle(item.id, c === true)}
              data-testid={`${testIdPrefix}-item-${item.id}`}
            />
            {item.label}
          </label>
        ))}
      </div>
      {items.has("dumbbells") && (
        <div className="flex items-center gap-2">
          <Label htmlFor={`${testIdPrefix}-db-max`} className="text-sm">
            {t("Heaviest dumbbell (lb, optional)")}
          </Label>
          <Input
            id={`${testIdPrefix}-db-max`}
            className="w-24"
            inputMode="numeric"
            value={dumbbellMax}
            disabled={!canEdit}
            onChange={(e) => setDumbbellMax(Array.from(e.target.value).filter((ch) => ch >= "0" && ch <= "9").join(""))}
          />
        </div>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={saving}
            onClick={() =>
              onSave({ items: ALL_IDS.filter((id) => items.has(id)), dumbbellMaxLbs: dumbbellMax ? Number(dumbbellMax) : null })
            }
            data-testid={`${testIdPrefix}-save`}
          >
            {t("Save equipment")}
          </Button>
          {room && onClear && (
            <Button size="sm" variant="outline" disabled={saving} onClick={onClear}>
              {t("Clear (everything available)")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

type ProgramRooms = {
  canEdit: boolean;
  defaultRoom: EquipmentRoom | null;
  teams: { id: number; name: string; room: EquipmentRoom | null }[];
};

function useRoomMutation(url: string, invalidate: string[]) {
  const t = useT();
  const qc = useQueryClient();
  const done = () => {
    invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    qc.invalidateQueries({ queryKey: ["/api/equipment/my-room"] });
  };
  const save = useMutation({
    mutationFn: (room: EquipmentRoom) => apiRequest("PUT", url, room),
    onSuccess: () => {
      done();
      toast.success(t("Equipment saved. The AI plans for this room from now on."));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't save that")),
  });
  const clear = useMutation({
    mutationFn: () => apiRequest("DELETE", url),
    onSuccess: () => {
      done();
      toast.success(t("Cleared. Forge assumes everything is available."));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't clear that")),
  });
  return { save, clear };
}

function roomSummary(room: EquipmentRoom | null, unsetLabel: string): string {
  if (!room) return translate(unsetLabel);
  return room.items.length ? translate("{count} items", { count: room.items.length }) : translate("Bodyweight only");
}

function ProgramRoomRow({
  label,
  url,
  room,
  canEdit,
  testIdPrefix,
  fallback = null,
}: {
  label: string;
  url: string;
  room: EquipmentRoom | null;
  canEdit: boolean;
  testIdPrefix: string;
  /** Set for a team: the program default it uses until it has its own list. */
  fallback?: EquipmentRoom | null;
}) {
  const inherits = label !== "Program default";
  const [open, setOpen] = useState(false);
  const { save, clear } = useRoomMutation(url, ["/api/coach/equipment-profiles"]);
  return (
    <div className="rounded-md border border-border p-3">
      <button type="button" className="flex w-full items-center justify-between text-left text-sm font-medium" onClick={() => setOpen((o) => !o)} data-testid={`${testIdPrefix}-toggle`}>
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">
          {roomSummary(room, inherits ? msg("Uses the program default") : msg("Everything available"))}
        </span>
      </button>
      {open && (
        <div className="pt-3">
          <EquipmentChecklistEditor
            room={room}
            canEdit={canEdit}
            saving={save.isPending || clear.isPending}
            onSave={(r) => save.mutate(r)}
            onClear={() => clear.mutate()}
            testIdPrefix={testIdPrefix}
            fallback={fallback}
            unsetNote={
              inherits
                ? msg("No list of its own yet, so this team uses the program default (shown). Save to give it its own.")
                : msg("Not set yet, so Forge assumes everything is here.")
            }
          />
        </div>
      )}
    </div>
  );
}

/** The coach program's rooms: the default and one per team. */
export function ProgramEquipmentCard() {
  const t = useT();
  const { data, isError, refetch } = useQuery<ProgramRooms>({
    queryKey: ["/api/coach/equipment-profiles"],
    queryFn: () => getJson("/api/coach/equipment-profiles"),
  });
  if (isError) return <ReadFailed what={t("your weight room equipment")} onRetry={() => refetch()} />;
  if (!data) return null;
  return (
    <div className="space-y-2" data-testid="program-equipment-card">
      <Label>{t("Weight room equipment")}</Label>
      <p className="text-xs text-muted-foreground">
        {t(
          "What your weight room has. The AI builds, swaps and suggests only what these rooms can do, and the builder marks an exercise you add that needs something you haven't listed. A team with its own list uses it; every other team uses the program default.",
        )}
        {!data.canEdit && ` ${t("Only the head coach can change these.")}`}
      </p>
      <ProgramRoomRow label={t("Program default")} url="/api/coach/equipment-profiles/default" room={data.defaultRoom} canEdit={data.canEdit} testIdPrefix="equipment-default" />
      {data.teams.map((t) => (
        <ProgramRoomRow
          key={t.id}
          label={t.name}
          fallback={data.defaultRoom}
          url={`/api/coach/equipment-profiles/teams/${t.id}`}
          room={t.room}
          canEdit={data.canEdit}
          testIdPrefix={`equipment-team-${t.id}`}
        />
      ))}
    </div>
  );
}

/** A person's own room, for their own training. Read-only for a coached athlete. */
export function PersonalEquipmentCard({ title = msg("My equipment") }: { title?: string }) {
  const t = useT();
  const { data, isError, refetch } = useQuery<{ room: EquipmentRoom | null; canEdit: boolean; message?: string }>({
    queryKey: ["/api/account/equipment-profile"],
    queryFn: () => getJson("/api/account/equipment-profile"),
  });
  const { save, clear } = useRoomMutation("/api/account/equipment-profile", ["/api/account/equipment-profile"]);
  if (isError) return <ReadFailed what={t("your equipment")} onRetry={() => refetch()} />;
  if (!data) return null;
  return (
    <div className="space-y-2" data-testid="personal-equipment-card">
      <Label>{t(title)}</Label>
      <p className="text-xs text-muted-foreground">
        {data.canEdit
          ? t("What you have to train with. The AI plans, swaps and suggests only what you can do with it.")
          : (data.message ?? t("Your coach sets your weight room's equipment."))}
      </p>
      <EquipmentChecklistEditor
        room={data.room}
        canEdit={data.canEdit}
        saving={save.isPending || clear.isPending}
        onSave={(r) => save.mutate(r)}
        onClear={() => clear.mutate()}
        testIdPrefix="equipment-personal"
      />
    </div>
  );
}
