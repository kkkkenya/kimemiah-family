// Tables copied to every phone. Order matters only for readability.
export const SYNC_TABLES = [
  "members",
  "devices",
  "settings",
  "shops",
  "stock_items",
  "stock_movements",
  "shopping_trips",
  "shopping_extras",
  "trip_lines",
  "jobs",
  "thanks",
  "budget_categories",
  "money_entries",
  "budgets",
  "meetings",
  "agenda_items",
  "decisions",
  "meals",
  "meal_ingredients",
  "meal_slots",
  "contacts",
  "activity",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

// Tables whose rows can't be changed or removed once written (matches the server allowlist).
export const INSERT_ONLY: ReadonlySet<SyncTable> = new Set<SyncTable>([
  "stock_movements",
  "thanks",
  "money_entries",
  "activity",
]);

export type Row = {
  id: string;
  updated_at?: string;
  deleted_at?: string | null;
  [key: string]: unknown;
};
