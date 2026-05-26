import { useMemo } from "react";

// AI-generated SVG is decorative and comes from the model, so sanitize before
// rendering: allowlist tags/attributes, drop anything scriptable. Returns null
// (caller shows a fallback) if the markup doesn't parse to a clean <svg>.

const ALLOWED_TAGS = new Set([
  "svg", "g", "defs", "lineargradient", "radialgradient", "stop", "path", "rect",
  "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title",
  "desc",
]);

const ALLOWED_ATTRS = new Set([
  "viewbox", "xmlns", "width", "height", "fill", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity",
  "fill-opacity", "stroke-opacity", "transform", "gradienttransform", "d",
  "points", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "offset", "stop-color", "stop-opacity", "gradientunits", "font-size",
  "font-family", "font-weight", "text-anchor", "dominant-baseline", "dx", "dy",
  "id",
]);

function clean(el: Element): void {
  for (const child of Array.from(el.children)) {
    if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
      child.remove();
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      const bad =
        name.startsWith("on") ||
        !ALLOWED_ATTRS.has(name) ||
        value.includes("javascript:") ||
        (value.includes("url(") && !value.includes("url(#"));
      if (bad) child.removeAttribute(attr.name);
    }
    clean(child);
  }
}

function sanitize(raw: string): string | null {
  if (!raw || !raw.trim().startsWith("<svg")) return null;
  try {
    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    if (doc.querySelector("parsererror")) return null;
    const svg = doc.documentElement;
    if (svg.tagName.toLowerCase() !== "svg") return null;
    // Strip attributes on the root, then walk the tree.
    for (const attr of Array.from(svg.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) svg.removeAttribute(attr.name);
    }
    clean(svg);
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return null;
  }
}

export default function SafeSvg({ svg, className }: { svg: string; className?: string }) {
  const clean = useMemo(() => sanitize(svg), [svg]);
  if (!clean) return null;
  return (
    <div
      className={className}
      // Sanitized above: tag/attribute allowlist, no scripts or event handlers.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
