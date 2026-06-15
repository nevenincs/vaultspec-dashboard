/**
 * DOM layout extractor for editable Figma recreation (plan W03).
 *
 * Injected into a rendered Storybook story via Playwright `browser_evaluate` (the function
 * body is passed verbatim). Walks the story root and returns an absolutely-positioned tree
 * — each visible element as a box with geometry, fills, border, radius, and direct text,
 * relative to the root — which the Figma builder turns into editable frames + text nodes
 * bound to the design-system variables. Pruning keeps the node count tractable.
 *
 * Usage: read this file, pass `EXTRACTOR` as the browser_evaluate function.
 */
export const EXTRACTOR = () => {
  document.querySelectorAll("vite-error-overlay").forEach((e) => e.remove());
  const root =
    document.querySelector("#storybook-root")?.firstElementChild ||
    document.querySelector("#storybook-root");
  if (!root) return { error: "no root" };
  const rb = root.getBoundingClientRect();
  const toHex = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    if (p.length >= 4 && p[3] === 0) return null;
    return "#" + p.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
  };
  const out = [];
  const walk = (el, depth) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const tag = el.tagName.toLowerCase();
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    out.push({
      d: depth,
      t: tag,
      x: Math.round(r.left - rb.left),
      y: Math.round(r.top - rb.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
      bg: toHex(cs.backgroundColor),
      bc: parseFloat(cs.borderTopWidth) > 0 ? toHex(cs.borderTopColor) : null,
      bw: Math.round(parseFloat(cs.borderTopWidth)) || 0,
      r: Math.round(parseFloat(cs.borderTopLeftRadius)) || 0,
      col: toHex(cs.color),
      fz: Math.round(parseFloat(cs.fontSize)) || 0,
      fw: cs.fontWeight,
      txt: directText || null,
      svg: tag === "svg",
    });
    if (tag === "svg") return; // icons handled separately (createNodeFromSvg)
    for (const c of el.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return { rootW: Math.round(rb.width), rootH: Math.round(rb.height), count: out.length, nodes: out };
};
