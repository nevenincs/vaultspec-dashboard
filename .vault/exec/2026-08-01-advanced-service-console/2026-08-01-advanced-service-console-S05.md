---
tags:
  - '#exec'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:701f699a49c7a37ef6d489cf3db76ae11b1f5f32a51dac89b048b7b0bf2c096a'
step_id: 'S05'
related:
  - "[[2026-08-01-advanced-service-console-plan]]"
---

# Update guards, desk specimens for the moved surfaces, and run the full frontend gate plus touched-scope vitest green

## Scope

- `frontend/dev/visual-review/specimens`
- `frontend/src`

## Description

- Re-point the action-coverage guard at the one Advanced verb and assert the four retired panel ids are absent from the palette.
- Re-point the rail guard to assert the rail hosts none of the console ids.
- Add the Advanced section guard proving collapsed folds mount and read nothing, one console expands at a time, and a retired id normalizes to nothing.
- Rewrite the retired job dashboard's desk cell as authored-prop cells over the new console header and log tail, dropping the seeded query cache the old container cell needed.
- Split the system-status and project-health panels into a container and a wire-free body, and add the two desk cells they never had, so every surface this plan moved is reviewable.
- Restore the behavioural coverage the retired dashboard's render test carried, and add unit coverage for the identity projection and the log tail.
- Run the full frontend gate and the test suites.

## Outcome

Every moved surface is reviewable from authored props on the hermetic desk, and no production component gained a harness affordance to make that true - the two panels that had no reviewable seam grew the ordinary container-and-view split instead. The guards that prove the cutover can still go red.

## Notes

The closing audit found the system-status and project-health panels had NEVER had desk cells, before or after this plan. That gap was pre-existing rather than introduced here, but both are surfaces this plan moved, so closing it belongs to this Step.

This Step was executed against a working tree shared with three other active campaigns. Two gate failures present partway through belonged to other lanes - an unused variable in a context-menu test, and six plural catalog keys added without their non-English leaves - and both were cleared by their own lanes rather than by this one. One further collision was real: a parallel session was editing two of this plan's own source files at the same time, removing the served package identifier from the identity projection. That change was correct and this Step's fixtures were adapted to it rather than fighting it.
