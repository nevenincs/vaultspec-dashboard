// Central command-provider registration (command-palette-providers ADR W01.P02).
// Each provider module self-registers on import; importing them all here once - and
// importing THIS module once from the app shell - guarantees the Cmd+K command plane
// is fully populated regardless of which surface is mounted, mirroring `registerAll`
// for the context-menu resolvers. Side-effect imports only.

import "../../stores/view/commandProviders/windowCommandProvider";
import "../../stores/view/commandProviders/leftRailCommandProvider";
import "../../stores/view/commandProviders/projectCommandProvider";
import "../../stores/view/commandProviders/graphCommandProvider";
import "../../stores/view/commandProviders/timelineCommandProvider";
import "../../stores/view/commandProviders/editorCommandProvider";
import "../../stores/view/commandProviders/documentCommandProvider";
import "../../stores/view/commandProviders/settingsCommandProvider";
import "../../stores/view/commandProviders/opsCommandProvider";
import "../../stores/view/commandProviders/reloadCommandProvider";
import "../../stores/view/commandProviders/controlPanelsCommandProvider";
