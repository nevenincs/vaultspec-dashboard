// The add-project OS folder picker's wire seam (single-app-runtime ADR O6): a
// stores-layer hook over `GET /fs/list`, consumed only by `AddProjectDialog`'s
// Browse affordance so app/ chrome never fetches the engine directly
// (dashboard-layer-ownership). Omitted `path` reads the filesystem roots; an
// absolute `path` reads that directory's immediate subdirectories. Each level is
// its own bounded cache entry, mirroring `useFileTree`'s per-directory grain.

import { engineClient, type FsListResponse } from "../engine";
import { useQuery } from "@tanstack/react-query";
import { engineKeys, withManualRetry } from "./internal";

export function useFsList(path?: string) {
  const query = useQuery({
    queryKey: engineKeys.fsList(path),
    queryFn: () => engineClient.fsList(path),
  });
  return withManualRetry(query);
}

export type { FsListResponse };
