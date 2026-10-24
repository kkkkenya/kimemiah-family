import type { IconId } from "@/lib/shopping/market";

// Line icons for things in the list and the basket, each on its own soft colour so a list reads
// at a glance. Colours work on light and dark (the tint sits under a 15% wash of the colour).
const ICON: Record<IconId, { color: string; path: string; label: string }> = {
  produce: { color: "#2F8F3A", label: "Fruit and vegetables", path: '<path d="M12 21c-4.4 0-7-3-7-7 0-3.3 2.2-5.6 5-6.2"/><path d="M12 21c4.4 0 7-3 7-7 0-3.3-2.2-5.6-5-6.2"/><path d="M12 8c0-2.5 1.5-4.5 4-5M12 8c-1-1.8-3-2.6-5-2"/>' },
  meat: { color: "#B42318", label: "Meat, fish, eggs", path: '<path d="M15.5 4.5a5 5 0 0 1 4 6.5c-.8 2.5-3.3 3.7-5.5 4.5l-5 5a2.1 2.1 0 1 1-3-3l5-5c.8-2.2 2-4.7 4.5-5.5"/><circle cx="7" cy="17" r="1"/>' },
  dairy: { color: "#2563EB", label: "Milk and dairy", path: '<path d="M8 3h8M9 3v3l-2 3v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9l-2-3V3"/><path d="M7 13h10"/>' },
  bakery: { color: "#B45309", label: "Bread and bakery", path: '<path d="M5 11a4 4 0 0 1 2-7.5c1.6 0 2.8.7 3.5 1.5.7-.8 1.9-1.5 3.5-1.5A4 4 0 0 1 19 11v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="M9 11v5M15 11v5"/>' },
  grains: { color: "#A16207", label: "Flour, rice, beans, sugar", path: '<path d="M6 8h12l-1 12H7Z"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/><path d="M9 13h6"/>' },
  oil: { color: "#CA8A04", label: "Cooking oil and fats", path: '<path d="M10 3h4v3l2 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-2Z"/><path d="M8 12h8"/>' },
  spices: { color: "#C2410C", label: "Spices, tea, coffee", path: '<path d="M7 9h10l-1 11H8Z"/><path d="M9 9V6h6v3M10 4h4"/><circle cx="12" cy="14" r="1.4"/>' },
  cleaning: { color: "#0891B2", label: "Cleaning", path: '<path d="M9 21h6a2 2 0 0 0 2-2v-7a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4v7a2 2 0 0 0 2 2Z"/><path d="M10 8V5h4v3M14 5h3l1 2"/>' },
  toiletries: { color: "#9333EA", label: "Toiletries", path: '<rect x="5" y="9" width="14" height="10" rx="3"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M9 14h6"/>' },
  pet: { color: "#7C5E3C", label: "Dog", path: '<circle cx="7" cy="10" r="1.6"/><circle cx="17" cy="10" r="1.6"/><circle cx="10" cy="6" r="1.6"/><circle cx="14" cy="6" r="1.6"/><path d="M8.5 17c0-2.2 1.6-4 3.5-4s3.5 1.8 3.5 4c0 1.4-1.2 2.3-2.5 2-.7-.2-1.3-.2-2 0-1.3.3-2.5-.6-2.5-2Z"/>' },
  drinks: { color: "#DB2777", label: "Drinks", path: '<path d="M7 4h10l-1.5 15a1.5 1.5 0 0 1-1.5 1.5h-4.6A1.5 1.5 0 0 1 8 19Z"/><path d="M7.5 9h9"/>' },
  household: { color: "#4B5563", label: "Household", path: '<path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>' },
  gas: { color: "#DC2626", label: "Gas and charcoal", path: '<path d="M12 21c3.3 0 6-2.4 6-6 0-4-3.5-6.5-4-10-2.5 2-3.5 4-3.5 6-1-.8-1.5-2-1.5-3-2 1.5-3 4-3 7 0 3.6 2.7 6 6 6Z"/>' },
  water: { color: "#0284C7", label: "Water", path: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>' },
  other: { color: "#6B7280", label: "Other", path: '<path d="M5 8l7-4 7 4v8l-7 4-7-4Z"/><path d="M5 8l7 4 7-4M12 12v8"/>' },
};

export function ItemIcon({ id, size = 40 }: { id: IconId; size?: number }) {
  const i = ICON[id] ?? ICON.other;
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, color: i.color, background: `color-mix(in srgb, ${i.color} 15%, transparent)` }}>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: i.path }} />
    </span>
  );
}

export const iconLabel = (id: IconId) => ICON[id]?.label ?? "Other";
