"use client";

import { sankeyLayout, type SLink, type SNode } from "@/lib/money/sankey";
import { kes } from "@/lib/shopping/pricing";

const TONE: Record<string, string> = {
  in: "var(--ok-fg)",
  muted: "var(--line)",
  fixed: "var(--text-primary)",
  flexible: "var(--action)",
  non_monthly: "var(--low-fg)",
  kept: "var(--ok-fg)",
};
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));

// Where the money went, as a Sankey: who put it in, the three groups (and what was kept), then
// each kind of spending. One drawing serves both sizes: a phone gets a compact viewBox with short
// figures; a laptop gets room for full labels.
export function Sankey({ columns, links, wide = false }: { columns: SNode[][]; links: SLink[]; wide?: boolean }) {
  const W = wide ? 760 : 360;
  const H = wide ? 360 : 300;
  const labelRoom = wide ? 170 : 96;
  const layout = sankeyLayout(columns, links, W - labelRoom, H, 10, wide ? 10 : 7);
  const total = columns[0].reduce((s, n) => s + n.value, 0);
  if (!total) return <p className="text-sm text-muted">Nothing to show for this time yet.</p>;
  const summary = columns
    .flat()
    .filter((n) => n.value > 0)
    .map((n) => `${n.label} ${kes(n.value)}`)
    .join(", ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Where the money went: ${summary}`} className="overflow-visible">
      {layout.links.map((l, i) => (
        <path key={i} d={l.path} fill={TONE[l.tone ?? "muted"] ?? "var(--line)"} opacity={0.28} />
      ))}
      {layout.nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width={layout.nodeW} height={Math.max(1.5, n.h)} rx={2} fill={TONE[n.tone ?? "muted"] ?? "var(--text-primary)"} />
          {n.h >= (wide ? 12 : 14) && (
            <text x={n.x + layout.nodeW + 6} y={n.y + n.h / 2} dominantBaseline="middle" fontSize={wide ? 13 : 11} fill="var(--text-primary)" stroke="var(--surface-raised)" strokeWidth={3} paintOrder="stroke" className="tabular">
              {!wide && n.label.length > 14 ? `${n.label.slice(0, 13)}…` : n.label}
              <tspan fill="var(--text-muted)"> {wide ? kes(n.value) : short(n.value)}</tspan>
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
