# The vaultspec application runtime

`vaultspec` is one binary that is both a CLI and the application. This page
documents the application side: launching, the single-instance rule, the
lifecycle verbs, and what lives where on disk.

## Opening the app

Run `vaultspec` with no arguments (or `vaultspec open`, or double-click the
binary). It does one of two things:

- **An app is already running** — it attaches: your current project is
  registered and selected on the running app, and your browser opens on it.
- **Nothing is running** — it starts the app in the background (no console
  window stays open), waits for it to come up, and opens your browser.

Run it from inside a project to open that project. Run it from anywhere else
and it reopens the project you used last. On a fresh machine with no known
projects it opens a first-run page where you connect your first project by
entering its folder path.

`vaultspec serve` remains the foreground way to run the engine — it stays
attached to your terminal and prints logs. Use it when you want to watch what
the engine is doing.

## One app per machine

Only one vaultspec app runs per machine (the OS enforces this with a lock
that is always released when the process dies, however it dies). A second
launch attaches to the running app instead of starting another. Switching
projects happens inside the app — the project switcher in the left rail —
not by running more copies.

Escape hatches for development and testing only: `vaultspec serve --no-seat`
(or `--port 0`, which implies it) skips the single-instance rule and the
machine-level discovery entirely.

## Lifecycle verbs

| Verb                | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `vaultspec`         | Open the app (attach or start), then open the browser.               |
| `vaultspec open`    | Same as bare `vaultspec`.                                            |
| `vaultspec stop`    | Gracefully stop the running app. Safe to run when nothing is up.     |
| `vaultspec restart` | Stop (if running), then relaunch detached in your last project.      |
| `vaultspec update`  | Self-update (stop → update → relaunch). Only for copies installed by the shell/PowerShell installer; package-manager installs (scoop, cargo-binstall) are refused with the right command for that manager. |
| `vaultspec status`  | Everything `status` reported before, plus a `seat` block: whether the app is running, its pid/port/uptime, and the projects it knows. |

`vaultspec provision status` / `install` / `upgrade` / `migrate` / `acquire`
manage framework provisioning for the current project from the terminal —
the same provisioning engine the dashboard's GUI uses, so the two never
disagree about what is installed or missing.

## What lives where

- `~/.vaultspec/` — the machine-global app home:
  - `service.json` — discovery for the running app (port, auth token, pid,
    heartbeat). Removed on clean shutdown; owner-restricted.
  - `seat.lock` — the single-instance lock anchor.
  - `workspaces.json` — the projects the launcher knows and which one was
    last active (bounded; prunes moved/deleted paths).
  - `bootstrap/` — an empty engine-owned scratch corpus used only to serve
    the first-run page before any project is connected. Deletable.
- `<project>/.vault/data/engine-data/` — per-project engine cache and, for
  `--no-seat` dev/test serves, the workspace-local `service.json`
  (unchanged from previous releases).

**Uninstalling:** remove the binary (or use your package manager), then
delete `~/.vaultspec/` if you want no trace left. Per-project caches live
under each project's `.vault/data/` and are always safe to delete.

## Windows notes

The binary is a console program so the CLI works everywhere. Double-clicking
it flashes a console window for well under a second while it hands off to
the background app and opens your browser. To get a Start-Menu entry, pin
the binary (or a shortcut to it) after install; the zip/installer channels
do not create shortcuts today (an MSI channel that does is on the packaging
roadmap, dashboard-packaging ADR v2).

If the app fails to launch twice in under a minute, the launcher stops
retrying and points you at the crash log instead of thrashing — run
`vaultspec serve` in a terminal to see the error live.
