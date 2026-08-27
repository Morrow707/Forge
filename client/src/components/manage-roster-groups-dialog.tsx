import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { DEFAULT_ROSTER_GROUPS, resolveRosterGroups, type RosterGroup } from "@shared/roster-groups";

type RosterGroupsResponse = { rosterGroups: RosterGroup[] | null };

/** Lets a coach rename, add, or remove the small set of groups their Roster
 * page filters by and files athletes into -- position groups, training
 * pods, grade levels, whatever fits their own program. Ships with a
 * neutral "Group A/B/C" default (see DEFAULT_ROSTER_GROUPS) until touched
 * here; nothing sport-specific is ever hardcoded, the coach types whatever
 * they want. Deliberately not the same thing as a Team (see the Teams tab
 * on this same page) -- a group has no join code and no branding, it's
 * just a label an existing roster athlete is filed under. Modeled closely
 * on NavCustomizeDialog's rename-in-place shape. */
export function ManageRosterGroupsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [groups, setGroups] = useState<RosterGroup[]>(DEFAULT_ROSTER_GROUPS);
  const [newLabel, setNewLabel] = useState("");

  const { data } = useQuery<RosterGroupsResponse>({
    queryKey: ["/api/coach/roster-groups"],
    queryFn: () => getJson("/api/coach/roster-groups"),
    enabled: open,
  });

  useEffect(() => {
    if (data) setGroups(resolveRosterGroups(data.rosterGroups));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (next: RosterGroup[]) => {
      await apiRequest("PATCH", "/api/coach/roster-groups", { rosterGroups: next });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster-groups"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save"),
  });

  function commit(next: RosterGroup[]) {
    setGroups(next);
    saveMutation.mutate(next);
  }

  function renameGroup(id: string, label: string) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, label } : g)));
  }

  function commitRename() {
    saveMutation.mutate(groups);
  }

  function removeGroup(id: string) {
    commit(groups.filter((g) => g.id !== id));
  }

  function addGroup() {
    const label = newLabel.trim();
    if (!label) return;
    commit([...groups, { id: crypto.randomUUID(), label }]);
    setNewLabel("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Manage roster groups</DialogTitle>
          <DialogDescription>
            Organize your roster however fits your program. Renaming a group keeps every athlete
            already assigned to it; removing one just leaves those athletes Unassigned.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <Input
                value={g.label}
                onChange={(e) => renameGroup(g.id, e.target.value)}
                onBlur={commitRename}
                maxLength={40}
                className="h-8 text-sm"
                aria-label="Group name"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeGroup(g.id)}
                aria-label={`Remove ${g.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No groups left -- add one below, or close this and the default Group A/B/C split
              comes back.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGroup();
              }
            }}
            placeholder="New group name..."
            maxLength={40}
            className="h-8 text-sm"
            aria-label="New group name"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addGroup}
            disabled={!newLabel.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
