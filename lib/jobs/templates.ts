// One-tap jobs for the house in Kiambu. Duration and people are starting guesses; the person
// posting can change them. Size (time x people) and the Light / Medium / Heavy tag follow.

import type { Strain } from "./logic";

export type Category =
  | "kitchen_dishes"
  | "cooking_house"
  | "compound_garden"
  | "water_tanks"
  | "dogs_pets"
  | "house_cleaning"
  | "shopping_errand"
  | "utilities_dad"
  | "maintenance_fix";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "kitchen_dishes", label: "Kitchen & dishes" },
  { id: "cooking_house", label: "Cooking for the house" },
  { id: "compound_garden", label: "Compound & garden" },
  { id: "water_tanks", label: "Water & tanks" },
  { id: "dogs_pets", label: "Dog" },
  { id: "house_cleaning", label: "House cleaning" },
  { id: "shopping_errand", label: "Shopping & errands" },
  { id: "utilities_dad", label: "Bills (Peter pays)" },
  { id: "maintenance_fix", label: "Repairs" },
];

export type NextStage = { title: string; strain: Strain; duration_min: number; people_needed: number; category: Category };

export type Template = {
  id: string;
  chip?: string; // shown in the quick-post strip
  title: string;
  category: Category;
  strain: Strain;
  duration_min: number;
  people_needed: number;
  urgent?: boolean;
  dueInHours?: number; // default: end of today
  requires_funds?: boolean;
  daysAhead?: number; // funded runs are planned 2-4 days out
  repeat?: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly";
  next_stage?: NextStage;
};

export const TEMPLATES: Template[] = [
  { id: "water", chip: "💧 Water is back: fill tanks", title: "Water is back! Fill the storage and overhead tanks", category: "water_tanks", strain: "medium", duration_min: 45, people_needed: 1, urgent: true, dueInHours: 3 },
  {
    id: "arrange",
    chip: "🍲 Arrange kitchen (light)",
    title: "Clean kitchen counters and arrange dishes for washing",
    category: "kitchen_dishes",
    strain: "light",
    duration_min: 20,
    people_needed: 1,
    next_stage: { title: "Wash the arranged dishes and pots (counters clean, dishes sorted)", strain: "medium", duration_min: 40, people_needed: 1, category: "kitchen_dishes" },
  },
  { id: "dishes", chip: "🍽️ Wash dishes", title: "Wash dishes and pots", category: "kitchen_dishes", strain: "medium", duration_min: 40, people_needed: 1 },
  { id: "sweep", chip: "🧹 Sweep the drive", title: "Sweep the driveway and compound paths", category: "compound_garden", strain: "medium", duration_min: 45, people_needed: 1 },
  { id: "dog", chip: "🐕 Wash the dog", title: "Wash the dog", category: "dogs_pets", strain: "heavy", duration_min: 60, people_needed: 2 },
  { id: "funded", chip: "🛒 Plan a supermarket run (2–4 days)", title: "Supermarket run", category: "shopping_errand", strain: "medium", duration_min: 180, people_needed: 2, requires_funds: true, daysAhead: 3 },
  { id: "cook", title: "Cook supper for the house", category: "cooking_house", strain: "medium", duration_min: 90, people_needed: 1 },
  { id: "fence", title: "Cut and trim the fence and hedges", category: "compound_garden", strain: "heavy", duration_min: 180, people_needed: 1, repeat: "monthly" },
  { id: "slash", title: "Slash grass and weed the compound", category: "compound_garden", strain: "heavy", duration_min: 240, people_needed: 2, repeat: "monthly" },
  { id: "feed", title: "Feed the dog and clean the kennel area", category: "dogs_pets", strain: "light", duration_min: 15, people_needed: 1 },
  { id: "market", title: "Market run", category: "shopping_errand", strain: "medium", duration_min: 120, people_needed: 2, requires_funds: true, daysAhead: 3 },
  { id: "gas", title: "Refill the cooking gas cylinder", category: "shopping_errand", strain: "heavy", duration_min: 60, people_needed: 2, requires_funds: true, daysAhead: 2 },
  { id: "water-bill", title: "Ask Peter to pay the water bill", category: "utilities_dad", strain: "light", duration_min: 10, people_needed: 1 },
  { id: "bathroom", title: "Scrub the bathroom and toilet", category: "house_cleaning", strain: "medium", duration_min: 45, people_needed: 1, repeat: "weekly" },
  { id: "tanks", title: "Wash the water tanks", category: "water_tanks", strain: "heavy", duration_min: 240, people_needed: 3, repeat: "quarterly" },
];

/** Quick notes for "my part" when joining, by kind of job. */
export const PART_NOTES: Partial<Record<Category, string[]>> = {
  kitchen_dishes: ["Clean and arrange", "Wash pots", "Wash plates and cups", "Dry and put away"],
  dogs_pets: ["Hold and soap", "Fetch water and rinse", "Dry and brush"],
  shopping_errand: ["Co-shopper, check prices", "Carry and log the receipt"],
  compound_garden: ["Cutting", "Raking and clearing", "Carrying waste"],
  water_tanks: ["Fetch and pour", "Scrub inside", "Rinse and drain"],
  cooking_house: ["Prep and chop", "Cook", "Serve and clean up"],
  house_cleaning: ["Bathroom", "Toilet", "Mop the floor"],
};

/** Tools each usual job needs (names of Stock tools), shown on the job with where they are. */
export const TOOLS_FOR: Record<string, string[]> = {
  fence: ["Hedge shears", "Panga"],
  slash: ["Slasher", "Panga", "Rake"],
  dog: ["Dog shampoo and brush", "Hosepipe"],
  sweep: ["Rake"],
  tanks: ["Hosepipe", "Ladder"],
};
