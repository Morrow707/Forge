import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import type { EquipmentRoom } from "@shared/equipment-profile";

/** A room changes when somebody edits a checklist; a minute is fresh enough. */
const ROOM_STALE_MS = 60_000;

/** The weight room the signed-in person is planning for (server/equipment-room.ts decides whose):
 * `room` is null with no profile, which means everything is available. `undefined` while loading
 * or after a failed read, which every caller treats as "no narrowing" -- a room never hides
 * anything it has not been told about. */
export function useEquipmentRoom(teamId?: number | null): { room: EquipmentRoom | null | undefined; hasProfile: boolean } {
  const path = teamId ? `/api/equipment/my-room?teamId=${teamId}` : "/api/equipment/my-room";
  const { data } = useQuery<{ room: EquipmentRoom | null }>({
    queryKey: ["/api/equipment/my-room", teamId ?? null],
    queryFn: () => getJson(path),
    staleTime: ROOM_STALE_MS,
  });
  return { room: data?.room, hasProfile: data?.room != null };
}
