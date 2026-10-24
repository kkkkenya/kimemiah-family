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
  | "laundry"
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
  { id: "laundry", label: "Laundry & ironing" },
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

// Ids are kept forever: "usually takes" times are learned per id.
export const TEMPLATES: Template[] = [
  // Quick ones on the Jobs strip (chip).
  { id: "water", chip: "💧 Water is back: fill tanks", title: "Water is back! Fill the storage and overhead tanks", category: "water_tanks", strain: "medium", duration_min: 45, people_needed: 1, urgent: true, dueInHours: 3 },
  { id: "rain", chip: "🌧️ Rain coming: bring in clothes", title: "Rain coming! Bring in the clothes from the line", category: "laundry", strain: "light", duration_min: 10, people_needed: 1, urgent: true, dueInHours: 1 },
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
  { id: "kiosk", chip: "🥛 Bread and milk from the kiosk", title: "Buy bread and milk from the kiosk", category: "shopping_errand", strain: "light", duration_min: 20, people_needed: 1, dueInHours: 2 },
  { id: "dog", chip: "🐕 Wash the dog", title: "Wash the dog", category: "dogs_pets", strain: "heavy", duration_min: 60, people_needed: 2 },
  { id: "funded", chip: "🛒 Plan a supermarket run (2–4 days)", title: "Supermarket run", category: "shopping_errand", strain: "medium", duration_min: 180, people_needed: 2, requires_funds: true, daysAhead: 3 },

  // Kitchen & dishes
  { id: "cooker", title: "Wipe down the cooker, oven and microwave", category: "kitchen_dishes", strain: "light", duration_min: 20, people_needed: 1, repeat: "weekly" },
  { id: "fridge", title: "Clean out the fridge and throw out old food", category: "kitchen_dishes", strain: "medium", duration_min: 40, people_needed: 1, repeat: "weekly" },
  { id: "bin", title: "Take out the kitchen rubbish and wash the bin", category: "kitchen_dishes", strain: "light", duration_min: 15, people_needed: 1 },
  { id: "kettle", title: "Descale the kettle and wash the flasks", category: "kitchen_dishes", strain: "light", duration_min: 15, people_needed: 1, repeat: "monthly" },
  { id: "cupboards", title: "Wipe the kitchen cupboards inside and out", category: "kitchen_dishes", strain: "medium", duration_min: 60, people_needed: 1, repeat: "monthly" },
  { id: "dry-store", title: "Sort the dry store: check dates, refill the containers", category: "kitchen_dishes", strain: "light", duration_min: 30, people_needed: 1, repeat: "monthly" },

  // Cooking for the house
  { id: "cook", title: "Cook supper for the house", category: "cooking_house", strain: "medium", duration_min: 90, people_needed: 1 },
  { id: "breakfast", title: "Make breakfast for the house", category: "cooking_house", strain: "light", duration_min: 30, people_needed: 1 },
  { id: "chapati", title: "Make chapati for the house", category: "cooking_house", strain: "medium", duration_min: 90, people_needed: 2 },
  { id: "githeri", title: "Cook githeri or beans for the week", category: "cooking_house", strain: "medium", duration_min: 120, people_needed: 1, repeat: "weekly" },
  { id: "prep-veg", title: "Prep vegetables for the week (sukuma, onions, tomatoes)", category: "cooking_house", strain: "medium", duration_min: 60, people_needed: 1, repeat: "weekly" },
  { id: "lunches", title: "Pack lunches for tomorrow", category: "cooking_house", strain: "light", duration_min: 20, people_needed: 1 },
  { id: "mandazi", title: "Make mandazi", category: "cooking_house", strain: "medium", duration_min: 90, people_needed: 1 },

  // Compound & garden
  { id: "fence", title: "Cut and trim the fence and hedges", category: "compound_garden", strain: "heavy", duration_min: 180, people_needed: 1, repeat: "monthly" },
  { id: "slash", title: "Slash grass and weed the compound", category: "compound_garden", strain: "heavy", duration_min: 240, people_needed: 2, repeat: "monthly" },
  { id: "water-plants", title: "Water the garden and the potted plants", category: "compound_garden", strain: "light", duration_min: 20, people_needed: 1 },
  { id: "weed-beds", title: "Weed the flower beds", category: "compound_garden", strain: "medium", duration_min: 60, people_needed: 1, repeat: "biweekly" },
  { id: "leaves", title: "Rake up leaves and bag or burn them", category: "compound_garden", strain: "medium", duration_min: 45, people_needed: 1, repeat: "weekly" },
  { id: "kitchen-garden", title: "Dig and plant the kitchen garden (sukuma, dhania, spinach)", category: "compound_garden", strain: "heavy", duration_min: 120, people_needed: 2 },
  { id: "gutters", title: "Clear the gutters", category: "compound_garden", strain: "heavy", duration_min: 90, people_needed: 2, repeat: "quarterly" },
  { id: "gate-walls", title: "Wash the gate and the outside walls", category: "compound_garden", strain: "heavy", duration_min: 120, people_needed: 2, repeat: "quarterly" },
  { id: "drains", title: "Unblock the drains outside", category: "compound_garden", strain: "medium", duration_min: 45, people_needed: 1 },
  { id: "litter", title: "Pick up litter along the fence and gate", category: "compound_garden", strain: "light", duration_min: 20, people_needed: 1, repeat: "weekly" },

  // Water & tanks
  { id: "tanks", title: "Wash the water tanks", category: "water_tanks", strain: "heavy", duration_min: 240, people_needed: 3, repeat: "quarterly" },
  { id: "leaks", title: "Check the tanks, pipes and taps for leaks", category: "water_tanks", strain: "light", duration_min: 15, people_needed: 1, repeat: "monthly" },
  { id: "drinking-water", title: "Boil and store drinking water", category: "water_tanks", strain: "light", duration_min: 20, people_needed: 1 },
  { id: "filter", title: "Clean the water filter or dispenser", category: "water_tanks", strain: "light", duration_min: 20, people_needed: 1, repeat: "monthly" },

  // Dog
  { id: "feed", title: "Feed the dog and clean the kennel area", category: "dogs_pets", strain: "light", duration_min: 15, people_needed: 1 },
  { id: "walk-dog", title: "Walk the dog", category: "dogs_pets", strain: "light", duration_min: 30, people_needed: 1 },
  { id: "dog-food", title: "Cook the dog's food (unga and meat)", category: "dogs_pets", strain: "medium", duration_min: 60, people_needed: 1, repeat: "weekly" },
  { id: "deworm", title: "Deworm the dog", category: "dogs_pets", strain: "light", duration_min: 15, people_needed: 1, repeat: "quarterly" },
  { id: "ticks", title: "Spray the dog for ticks and fleas (Pestigon)", category: "dogs_pets", strain: "light", duration_min: 20, people_needed: 1, repeat: "monthly" },
  { id: "kennel", title: "Wash the dog's bedding and the kennel", category: "dogs_pets", strain: "medium", duration_min: 45, people_needed: 1, repeat: "biweekly" },
  { id: "vet", title: "Take the dog to the vet", category: "dogs_pets", strain: "medium", duration_min: 120, people_needed: 2, requires_funds: true, daysAhead: 2 },

  // House cleaning
  { id: "bathroom", title: "Scrub the bathroom and toilet", category: "house_cleaning", strain: "medium", duration_min: 45, people_needed: 1, repeat: "weekly" },
  { id: "mop", title: "Mop the floors", category: "house_cleaning", strain: "medium", duration_min: 45, people_needed: 1 },
  { id: "sweep-house", title: "Sweep the house", category: "house_cleaning", strain: "light", duration_min: 25, people_needed: 1 },
  { id: "dust", title: "Dust the furniture and shelves", category: "house_cleaning", strain: "light", duration_min: 30, people_needed: 1, repeat: "weekly" },
  { id: "windows", title: "Clean the windows and window grills", category: "house_cleaning", strain: "medium", duration_min: 90, people_needed: 1, repeat: "monthly" },
  { id: "curtains", title: "Take down, wash and rehang the curtains", category: "house_cleaning", strain: "heavy", duration_min: 120, people_needed: 2, repeat: "quarterly" },
  { id: "sitting-room", title: "Deep clean the sitting room (cushions, under the seats)", category: "house_cleaning", strain: "medium", duration_min: 45, people_needed: 1, repeat: "weekly" },
  { id: "sheets", title: "Change the bedsheets", category: "house_cleaning", strain: "light", duration_min: 20, people_needed: 1, repeat: "weekly" },
  { id: "carpets", title: "Beat and air the carpets and rugs", category: "house_cleaning", strain: "heavy", duration_min: 60, people_needed: 2, repeat: "monthly" },
  { id: "store-room", title: "Clean and arrange the store room", category: "house_cleaning", strain: "medium", duration_min: 90, people_needed: 2, repeat: "quarterly" },
  { id: "pests", title: "Spray for cockroaches and mosquitoes", category: "house_cleaning", strain: "light", duration_min: 20, people_needed: 1, repeat: "monthly" },
  { id: "cobwebs", title: "Brush cobwebs off the ceilings and corners", category: "house_cleaning", strain: "medium", duration_min: 45, people_needed: 1, repeat: "monthly" },

  // Laundry & ironing
  { id: "hand-wash", title: "Hand-wash clothes", category: "laundry", strain: "medium", duration_min: 90, people_needed: 1 },
  { id: "machine", title: "Run a load in the washing machine", category: "laundry", strain: "light", duration_min: 15, people_needed: 1 },
  { id: "hang", title: "Hang the washing on the line", category: "laundry", strain: "light", duration_min: 20, people_needed: 1 },
  { id: "fold", title: "Bring in, fold and put away the dry clothes", category: "laundry", strain: "light", duration_min: 25, people_needed: 1 },
  { id: "iron", title: "Iron school and work clothes for the week", category: "laundry", strain: "medium", duration_min: 60, people_needed: 1, repeat: "weekly" },
  { id: "shoes", title: "Wash shoes and school uniforms", category: "laundry", strain: "medium", duration_min: 45, people_needed: 1, repeat: "weekly" },
  { id: "blankets", title: "Wash the blankets and duvets", category: "laundry", strain: "heavy", duration_min: 120, people_needed: 2, repeat: "quarterly" },

  // Shopping & errands
  { id: "market", title: "Market run", category: "shopping_errand", strain: "medium", duration_min: 120, people_needed: 2, requires_funds: true, daysAhead: 3 },
  { id: "gas", title: "Refill the cooking gas cylinder", category: "shopping_errand", strain: "heavy", duration_min: 60, people_needed: 2, requires_funds: true, daysAhead: 2 },
  { id: "dog-shop", title: "Buy dog unga and meat (vet shop and Kenchic)", category: "shopping_errand", strain: "medium", duration_min: 60, people_needed: 1, requires_funds: true, daysAhead: 2 },
  { id: "bundles", title: "Top up the house airtime and data bundles", category: "shopping_errand", strain: "light", duration_min: 10, people_needed: 1 },
  { id: "parcel", title: "Pick up a parcel or delivery", category: "shopping_errand", strain: "light", duration_min: 30, people_needed: 1 },
  { id: "repairs-drop", title: "Take things for repair (shoes, phone, iron)", category: "shopping_errand", strain: "light", duration_min: 45, people_needed: 1 },
  { id: "water-refill", title: "Buy a drinking water refill", category: "shopping_errand", strain: "light", duration_min: 20, people_needed: 1 },

  // Bills (Peter pays)
  { id: "water-bill", title: "Ask Peter to pay the water bill", category: "utilities_dad", strain: "light", duration_min: 10, people_needed: 1 },
  { id: "internet-bill", title: "Ask Peter to pay the internet bill", category: "utilities_dad", strain: "light", duration_min: 10, people_needed: 1, repeat: "monthly" },
  { id: "house-money", title: "Ask Peter for this month's house money", category: "utilities_dad", strain: "light", duration_min: 10, people_needed: 1, repeat: "monthly" },
  { id: "fees", title: "Ask Peter to pay school fees", category: "utilities_dad", strain: "light", duration_min: 10, people_needed: 1 },

  // Repairs
  { id: "tap", title: "Fix a leaking tap", category: "maintenance_fix", strain: "medium", duration_min: 45, people_needed: 1 },
  { id: "bulb", title: "Replace a blown bulb", category: "maintenance_fix", strain: "light", duration_min: 15, people_needed: 1 },
  { id: "lock", title: "Fix a door lock or hinge", category: "maintenance_fix", strain: "medium", duration_min: 45, people_needed: 1 },
  { id: "unblock", title: "Unblock a sink or toilet", category: "maintenance_fix", strain: "medium", duration_min: 45, people_needed: 1 },
  { id: "touch-up", title: "Touch up marks and scuffs on the walls", category: "maintenance_fix", strain: "medium", duration_min: 120, people_needed: 1 },
  { id: "gate-oil", title: "Oil the gate and door hinges", category: "maintenance_fix", strain: "light", duration_min: 20, people_needed: 1, repeat: "quarterly" },
  { id: "fence-fix", title: "Mend the broken part of the fence", category: "maintenance_fix", strain: "heavy", duration_min: 120, people_needed: 2 },
  { id: "pump", title: "Get the water pump serviced", category: "maintenance_fix", strain: "medium", duration_min: 60, people_needed: 1, requires_funds: true, daysAhead: 4, repeat: "quarterly" },
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
  laundry: ["Wash", "Rinse and hang", "Fold and put away"],
};

/** Tools each usual job needs (names of Stock tools), shown on the job with where they are. */
export const TOOLS_FOR: Record<string, string[]> = {
  fence: ["Hedge shears", "Panga"],
  slash: ["Slasher", "Panga", "Rake"],
  dog: ["Dog shampoo and brush", "Hosepipe"],
  sweep: ["Rake"],
  tanks: ["Hosepipe", "Ladder"],
  gutters: ["Ladder"],
  "gate-walls": ["Hosepipe"],
  "water-plants": ["Hosepipe"],
  "kitchen-garden": ["Jembe", "Rake"],
  leaves: ["Rake"],
  "weed-beds": ["Jembe"],
  bulb: ["Ladder"],
  cobwebs: ["Ladder"],
  curtains: ["Ladder"],
  "fence-fix": ["Panga"],
};
