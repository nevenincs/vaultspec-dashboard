import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../platform/localization/LocalizationProvider";
import type { AnyMessageDescriptor } from "../platform/localization/message";
import { createDashboardScene } from "../scene/field/fieldAssembly";
import type {
  SceneController,
  SceneEdgeData,
  SceneNodeData,
} from "../scene/sceneController";
import { sliceToScene } from "../scene/sceneMapping";
import type { D3ForceParams } from "../scene/three/d3ForceSolver";
import {
  FORCE_CONTROLS,
  FORCE_CONTROL_DEFAULTS,
  FORCE_CONTROL_GROUPS,
} from "../scene/three/forceControls";
import type { ThreeField } from "../scene/three/threeField";
import {
  FORCE_CONTROL_SECTION_MESSAGES,
  LAB_GRAPH_CONTROL_MESSAGES,
  THREE_LAB_MESSAGES,
  generatedTitleMessage,
  loadGeneratedMessage,
  presetFeedbackMessage,
  sampleTitleMessage,
} from "../stores/view/threeLabVocabulary";
import { AppearancePanel } from "./AppearancePanel";
import {
  DEFAULT_PRESET_NAME,
  type ForcePresets,
  buildShareUrl,
  deletePreset,
  initialForceParams,
  loadPreset,
  presetNames,
  readPresets,
  savePreset,
  writeStoredParams,
} from "./forcePresets";
import { createGraphLabSampleSlice, type GraphLabSampleTitles } from "./sampleGraph";

interface GeneratedGraph {
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
}

const DOCUMENT_TYPES = ["adr", "plan", "exec", "audit", "research", "reference"];
const EDGE_TIERS = ["declared", "structural", "temporal", "semantic"] as const;

function generateGraph(
  nodeCount: number,
  resolveMessage: (descriptor: AnyMessageDescriptor) => string,
): GeneratedGraph {
  const nodes: SceneNodeData[] = [];
  const edges: SceneEdgeData[] = [];
  const groupCount = Math.max(3, Math.round(Math.sqrt(nodeCount) / 2));
  const stableNumber = (seed: number) => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  };

  for (let group = 0; group < groupCount; group += 1) {
    nodes.push({
      id: `feature:${group}`,
      kind: "feature",
      title: resolveMessage(generatedTitleMessage("generatedGroup", group + 1)),
      featureTags: [`f${group}`],
      memberCount: 0,
    });
  }

  let item = 0;
  while (nodes.length < nodeCount) {
    const group = item % groupCount;
    const id = `doc:${item}`;
    nodes.push({
      id,
      kind: "document",
      docType: DOCUMENT_TYPES[item % DOCUMENT_TYPES.length],
      title: resolveMessage(generatedTitleMessage("generatedItem", item + 1)),
      featureTags: [`f${group}`],
      salience: stableNumber(item),
    });
    edges.push({
      id: `e-hub-${item}`,
      src: id,
      dst: `feature:${group}`,
      relation: "member",
      tier: "declared",
      confidence: 0.9,
    });
    if (item > groupCount) {
      const target = Math.floor(stableNumber(item * 7) * item);
      edges.push({
        id: `e-x-${item}`,
        src: id,
        dst: `doc:${target}`,
        relation: "relates",
        tier: EDGE_TIERS[item % EDGE_TIERS.length],
        confidence: 0.3 + stableNumber(item * 3) * 0.6,
      });
    }
    item += 1;
  }
  return { nodes, edges };
}

interface SimulationPanelProps {
  params: D3ForceParams;
  presets: ForcePresets;
  selectedPreset: string;
  presetDraft: string;
  feedback: AnyMessageDescriptor | null;
  onParamChange: (key: keyof D3ForceParams, value: number) => void;
  onReset: () => void;
  onLoadPreset: (name: string) => void;
  onDeletePreset: () => void;
  onPresetDraftChange: (value: string) => void;
  onSavePreset: () => void;
  onCopyLink: () => void;
}

export function SimulationPanel({
  params,
  presets,
  selectedPreset,
  presetDraft,
  feedback,
  onParamChange,
  onReset,
  onLoadPreset,
  onDeletePreset,
  onPresetDraftChange,
  onSavePreset,
  onCopyLink,
}: SimulationPanelProps) {
  const resolveMessageResult = useLocalizedMessageResolver();
  const resolveMessage = useCallback(
    (descriptor: AnyMessageDescriptor) => resolveMessageResult(descriptor).message,
    [resolveMessageResult],
  );
  const locale = useActiveLocale();
  const [open, setOpen] = useState(true);
  const options = presetNames(presets, locale);

  return (
    <section
      aria-label={resolveMessage(THREE_LAB_MESSAGES.accessibility.simulationPanel)}
      style={{
        position: "absolute",
        top: 46,
        right: 8,
        width: 252,
        maxHeight: "calc(100% - 54px)",
        display: "flex",
        flexDirection: "column",
        background: "rgba(253, 250, 246, 0.95)",
        border: "1px solid var(--color-border, #ddd)",
        borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.14)",
        font: "12px system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          borderBottom: open ? "1px solid var(--color-border, #eee)" : "none",
        }}
      >
        <button
          onClick={() => setOpen((current) => !current)}
          title={resolveMessage(
            open
              ? THREE_LAB_MESSAGES.actions.collapse
              : THREE_LAB_MESSAGES.actions.expand,
          )}
          style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRight: "1px solid currentColor",
              borderBottom: "1px solid currentColor",
              transform: open ? "rotate(45deg)" : "rotate(-45deg)",
            }}
          />
        </button>
        <strong style={{ flex: 1 }}>
          {resolveMessage(THREE_LAB_MESSAGES.panels.simulation)}
        </strong>
        <button onClick={onReset}>
          {resolveMessage(THREE_LAB_MESSAGES.actions.reset)}
        </button>
      </header>
      {open && (
        <div style={{ overflowY: "auto", padding: "2px 8px 8px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "4px 0 8px",
              borderBottom: "1px solid var(--color-border, #eee)",
            }}
          >
            <div style={{ display: "flex", gap: 4 }}>
              <select
                aria-label={resolveMessage(THREE_LAB_MESSAGES.accessibility.presetList)}
                value={selectedPreset}
                onChange={(event) => onLoadPreset(event.target.value)}
                title={resolveMessage(THREE_LAB_MESSAGES.presets.loadTitle)}
                style={{ flex: 1, font: "inherit" }}
              >
                {options.map((name) => (
                  <option key={name} value={name}>
                    {name === DEFAULT_PRESET_NAME
                      ? resolveMessage(THREE_LAB_MESSAGES.presets.defaultName)
                      : name}
                  </option>
                ))}
              </select>
              <button
                onClick={onDeletePreset}
                disabled={selectedPreset === DEFAULT_PRESET_NAME}
                title={resolveMessage(THREE_LAB_MESSAGES.presets.deleteTitle)}
              >
                {resolveMessage(THREE_LAB_MESSAGES.actions.deletePreset)}
              </button>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                value={presetDraft}
                onChange={(event) => onPresetDraftChange(event.target.value)}
                placeholder={resolveMessage(THREE_LAB_MESSAGES.presets.namePlaceholder)}
                style={{ flex: 1, font: "inherit", minWidth: 0 }}
              />
              <button onClick={onSavePreset}>
                {resolveMessage(THREE_LAB_MESSAGES.actions.savePreset)}
              </button>
            </div>
            <button onClick={onCopyLink}>
              {resolveMessage(THREE_LAB_MESSAGES.actions.copyLink)}
            </button>
            {feedback && (
              <div role="status" style={{ fontSize: 10, opacity: 0.7 }}>
                {resolveMessage(feedback)}
              </div>
            )}
          </div>
          {FORCE_CONTROL_GROUPS.map((group) => (
            <div key={group}>
              <div
                style={{
                  margin: "8px 0 1px",
                  fontSize: 10,
                  letterSpacing: 0.6,
                  opacity: 0.55,
                }}
              >
                {resolveMessage(FORCE_CONTROL_SECTION_MESSAGES[group])}
              </div>
              {FORCE_CONTROLS.filter((control) => control.group === group).map(
                (control) => {
                  const value = params[control.key];
                  const messages = LAB_GRAPH_CONTROL_MESSAGES[control.controlId];
                  const label = resolveMessage(messages.label);
                  return (
                    <div
                      key={control.key}
                      title={resolveMessage(messages.description)}
                      style={{ margin: "4px 0" }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ flex: 1 }}>{label}</span>
                        <input
                          type="number"
                          value={value}
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          onChange={(event) =>
                            onParamChange(control.key, Number(event.target.value))
                          }
                          style={{ width: 60, font: "inherit", textAlign: "right" }}
                        />
                      </label>
                      <input
                        aria-label={label}
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={value}
                        onChange={(event) =>
                          onParamChange(control.key, Number(event.target.value))
                        }
                        style={{ width: "100%", marginTop: 1 }}
                      />
                      {control.zeroIsAuto && value === 0 && (
                        <div style={{ fontSize: 10, opacity: 0.5, marginTop: -2 }}>
                          {resolveMessage(THREE_LAB_MESSAGES.values.automatic)}
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ThreeLab() {
  const resolveMessageResult = useLocalizedMessageResolver();
  const resolveMessage = useCallback(
    (descriptor: AnyMessageDescriptor) => resolveMessageResult(descriptor).message,
    [resolveMessageResult],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ controller: SceneController; field: ThreeField } | null>(
    null,
  );
  const [params, setParams] = useState<D3ForceParams>(() =>
    initialForceParams(window.location.search),
  );
  const paramsRef = useRef(params);
  const [presets, setPresets] = useState<ForcePresets>(() => readPresets());
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_PRESET_NAME);
  const [presetDraft, setPresetDraft] = useState("");
  const [feedback, setFeedback] = useState<AnyMessageDescriptor | null>(null);
  const showingSample = useRef(true);

  const sampleTitles = useMemo<GraphLabSampleTitles>(
    () => ({
      planning: resolveMessage(sampleTitleMessage("planning")),
      connections: resolveMessage(sampleTitleMessage("connections")),
      history: resolveMessage(sampleTitleMessage("history")),
      researchNote: resolveMessage(sampleTitleMessage("researchNote")),
      designNote: resolveMessage(sampleTitleMessage("designNote")),
      workPlan: resolveMessage(sampleTitleMessage("workPlan")),
      progressNote: resolveMessage(sampleTitleMessage("progressNote")),
      qualitySummary: resolveMessage(sampleTitleMessage("qualitySummary")),
      projectGuidance: resolveMessage(sampleTitleMessage("projectGuidance")),
      workGroup: resolveMessage(sampleTitleMessage("workGroup")),
    }),
    [resolveMessage],
  );
  const sampleScene = useMemo(
    () => sliceToScene(createGraphLabSampleSlice(sampleTitles)),
    [sampleTitles],
  );
  const sampleSceneRef = useRef(sampleScene);

  useEffect(() => {
    paramsRef.current = params;
    writeStoredParams(params);
  }, [params]);

  useEffect(() => {
    sampleSceneRef.current = sampleScene;
    if (showingSample.current) {
      sceneRef.current?.controller.command({
        kind: "set-data",
        nodes: sampleScene.nodes,
        edges: sampleScene.edges,
      });
    }
  }, [sampleScene]);

  const applyParams = useCallback((next: D3ForceParams) => {
    setParams(next);
    sceneRef.current?.field.setForceParams(next);
  }, []);

  const setParam = useCallback((key: keyof D3ForceParams, value: number) => {
    setParams((previous) => ({ ...previous, [key]: value }));
    sceneRef.current?.field.setForceParams({ [key]: value });
  }, []);

  const resetParams = useCallback(() => {
    applyParams({ ...FORCE_CONTROL_DEFAULTS });
    setSelectedPreset(DEFAULT_PRESET_NAME);
    setFeedback(THREE_LAB_MESSAGES.feedback.defaultsRestored);
  }, [applyParams]);

  const onLoadPreset = useCallback(
    (name: string) => {
      setSelectedPreset(name);
      applyParams(loadPreset(presets, name));
      const displayName =
        name === DEFAULT_PRESET_NAME
          ? resolveMessage(THREE_LAB_MESSAGES.presets.defaultName)
          : name;
      setFeedback(presetFeedbackMessage("presetLoaded", displayName));
    },
    [applyParams, presets, resolveMessage],
  );

  const onSavePreset = useCallback(() => {
    const name = presetDraft.trim();
    if (!name || name === DEFAULT_PRESET_NAME || Object.hasOwn(presets, name)) {
      setFeedback(THREE_LAB_MESSAGES.feedback.presetNameRequired);
      return;
    }
    setPresets((previous) => savePreset(previous, name, params));
    setSelectedPreset(name);
    setPresetDraft("");
    setFeedback(presetFeedbackMessage("presetSaved", name));
  }, [params, presetDraft, presets]);

  const onDeletePreset = useCallback(() => {
    if (selectedPreset === DEFAULT_PRESET_NAME) {
      setFeedback(THREE_LAB_MESSAGES.feedback.defaultPresetProtected);
      return;
    }
    const name = selectedPreset;
    setPresets((previous) => deletePreset(previous, name));
    setSelectedPreset(DEFAULT_PRESET_NAME);
    setFeedback(presetFeedbackMessage("presetDeleted", name));
  }, [selectedPreset]);

  const onCopyLink = useCallback(() => {
    const link = buildShareUrl(params);
    if (link === null) {
      setFeedback(THREE_LAB_MESSAGES.feedback.linkCreationFailed);
      return;
    }
    const pending = navigator.clipboard?.writeText(link);
    if (!pending) {
      setFeedback(THREE_LAB_MESSAGES.feedback.linkUnavailable);
      return;
    }
    void pending.then(
      () => setFeedback(THREE_LAB_MESSAGES.feedback.linkCopied),
      () => setFeedback(THREE_LAB_MESSAGES.feedback.linkUnavailable),
    );
  }, [params]);

  const loadSample = useCallback(() => {
    showingSample.current = true;
    const current = sampleSceneRef.current;
    sceneRef.current?.controller.command({
      kind: "set-data",
      nodes: current.nodes,
      edges: current.edges,
    });
  }, []);

  const loadGenerated = useCallback(
    (count: number) => {
      showingSample.current = false;
      const graph = generateGraph(count, resolveMessage);
      sceneRef.current?.controller.command({
        kind: "set-data",
        nodes: graph.nodes,
        edges: graph.edges,
      });
    },
    [resolveMessage],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = createDashboardScene();
    sceneRef.current = scene;
    scene.controller.mount(host);
    scene.field.setForceParams(paramsRef.current);
    const unsubscribe = scene.controller.on((event) => {
      if (event.kind === "select") {
        scene.controller.command({
          kind: "set-selected",
          ids: new Set(event.id ? [event.id] : []),
        });
      }
    });
    const resizeObserver = new ResizeObserver(() => {
      const bounds = host.getBoundingClientRect();
      scene.controller.resize(bounds.width, bounds.height);
    });
    resizeObserver.observe(host);
    const current = sampleSceneRef.current;
    scene.controller.command({
      kind: "set-data",
      nodes: current.nodes,
      edges: current.edges,
    });
    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      scene.controller.destroy();
      sceneRef.current = null;
    };
  }, []);

  const command = (value: Parameters<SceneController["command"]>[0]) =>
    sceneRef.current?.controller.command(value);

  return (
    <div
      style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}
    >
      <header
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid var(--color-border, #ddd)",
          font: "13px system-ui, sans-serif",
        }}
      >
        <strong>{resolveMessage(THREE_LAB_MESSAGES.title)}</strong>
        <button onClick={loadSample}>
          {resolveMessage(THREE_LAB_MESSAGES.actions.loadSample)}
        </button>
        {[500, 2000, 5000].map((count) => (
          <button key={count} onClick={() => loadGenerated(count)}>
            {resolveMessage(loadGeneratedMessage(count))}
          </button>
        ))}
        <button onClick={() => command({ kind: "fit-to-view" })}>
          {resolveMessage(THREE_LAB_MESSAGES.actions.fitToView)}
        </button>
        <button
          onClick={() => command({ kind: "set-simulation-active", active: true })}
        >
          {resolveMessage(THREE_LAB_MESSAGES.actions.restartMovement)}
        </button>
      </header>
      <div ref={hostRef} style={{ position: "relative", flex: 1, minHeight: 0 }} />
      <SimulationPanel
        params={params}
        presets={presets}
        selectedPreset={selectedPreset}
        presetDraft={presetDraft}
        feedback={feedback}
        onParamChange={setParam}
        onReset={resetParams}
        onLoadPreset={onLoadPreset}
        onDeletePreset={onDeletePreset}
        onPresetDraftChange={setPresetDraft}
        onSavePreset={onSavePreset}
        onCopyLink={onCopyLink}
      />
      <AppearancePanel getField={() => sceneRef.current?.field ?? null} />
    </div>
  );
}
