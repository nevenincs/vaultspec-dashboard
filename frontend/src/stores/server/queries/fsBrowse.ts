// Cached read for one project-picker folder level. Filtering and hidden-folder
// inclusion happen before the server applies its row limit. Held data avoids a
// blank list while the next level loads.

import { engineClient, type FsListParams, type FsListResponse } from "../engine";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { engineKeys, withManualRetry } from "./internal";

export function useFsList(params: FsListParams = {}) {
  const query = useQuery({
    queryKey: engineKeys.fsList(params.path, params.q, params.hidden),
    queryFn: () => engineClient.fsList(params),
    placeholderData: keepPreviousData,
  });
  return withManualRetry(query);
}

export type { FsListParams, FsListResponse };
