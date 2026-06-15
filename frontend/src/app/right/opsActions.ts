// Ops dispatch (dashboard-layer-ownership): the engine-calling terminal effect
// and its registration moved to the stores layer (the sole wire client) in
// `stores/server/opsActions`. This app-layer module is now a thin re-export of
// the dispatch entrypoint so existing importers (CommandPalette, OpsPanel) are
// unchanged; the app never imports the engine client directly. Importing this
// module still evaluates the stores module, registering the terminal effect.

export {
  OPS_ACTION,
  dispatchOps,
  type OpsPayload,
} from "../../stores/server/opsActions";
