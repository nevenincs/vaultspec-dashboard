// The ONE connected mount of the universal activity indicator
// (universal-data-loading ADR D1/D2). App chrome renders the stores-owned
// interpreted view — it derives nothing and fetches nothing
// (dashboard-layer-ownership); the kit primitive stays dumb. Mounted once per
// shell branch in AppShell; no other surface re-derives activity.

import { useDataActivityView } from "../../stores/server/dataActivity";
import { ActivityIndicator } from "../kit/ActivityIndicator";

export function DataActivityIndicator() {
  const activity = useDataActivityView();
  return (
    <ActivityIndicator
      visible={activity.visible}
      rowsLoaded={activity.determinate?.rowsLoaded ?? null}
    />
  );
}
