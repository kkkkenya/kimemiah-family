// A small Sankey layout: columns of nodes sized by value, ribbons between them, drawn to one
// scale so every band's height is its share of the money. Pure, so it's tested.

export type SNode = { id: string; label: string; value: number; tone?: string };
export type SLink = { from: string; to: string; value: number };
export type PlacedNode = SNode & { x: number; y: number; h: number; col: number };
export type PlacedLink = SLink & { path: string; h: number; tone?: string };

export function sankeyLayout(columns: SNode[][], links: SLink[], width: number, height: number, nodeW = 10, gap = 8) {
  const cols = columns.map((c) => c.filter((n) => n.value > 0));
  // One scale for all columns: the fullest column fits the height exactly.
  const scale = Math.min(...cols.map((c) => (height - gap * Math.max(0, c.length - 1)) / Math.max(1, c.reduce((s, n) => s + n.value, 0))));
  const step = cols.length > 1 ? (width - nodeW) / (cols.length - 1) : 0;
  const nodes = new Map<string, PlacedNode>();
  cols.forEach((c, ci) => {
    let y = 0;
    for (const n of c) {
      const h = n.value * scale;
      nodes.set(n.id, { ...n, x: ci * step, y, h, col: ci });
      y += h + gap;
    }
  });
  // Ribbons leave and arrive in order, so they stack inside each node without crossing over it.
  const outOff = new Map<string, number>();
  const inOff = new Map<string, number>();
  const placed: PlacedLink[] = [];
  for (const l of links) {
    const a = nodes.get(l.from);
    const b = nodes.get(l.to);
    if (!a || !b || l.value <= 0) continue;
    const h = l.value * scale;
    const y0 = a.y + (outOff.get(a.id) ?? 0);
    const y1 = b.y + (inOff.get(b.id) ?? 0);
    outOff.set(a.id, (outOff.get(a.id) ?? 0) + h);
    inOff.set(b.id, (inOff.get(b.id) ?? 0) + h);
    const x0 = a.x + nodeW;
    const x1 = b.x;
    const mx = (x0 + x1) / 2;
    const r = (v: number) => Math.round(v * 10) / 10;
    placed.push({
      ...l,
      h,
      tone: b.tone ?? a.tone,
      path: `M${r(x0)} ${r(y0)} C${r(mx)} ${r(y0)} ${r(mx)} ${r(y1)} ${r(x1)} ${r(y1)} L${r(x1)} ${r(y1 + h)} C${r(mx)} ${r(y1 + h)} ${r(mx)} ${r(y0 + h)} ${r(x0)} ${r(y0 + h)} Z`,
    });
  }
  return { nodes: [...nodes.values()], links: placed, nodeW };
}
