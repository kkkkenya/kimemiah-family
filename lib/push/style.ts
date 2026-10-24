// What each kind of notification looks like and does: its type, colour, icon, how the phone
// buzzes, whether it stays until it's seen, and its buttons. Shared by the server (the push it
// sends), the service worker (the phone's banner) and the app (in-app banners and the inbox).
import type { Alert } from "./plan";

export type NoticeType = "urgent" | "due" | "suggest" | "team" | "thanks" | "money" | "bill" | "question" | "swap" | "shop" | "meeting" | "group" | "test";
export type NoticeAction = { action: string; title: string; url: string };

export const NOTICE: Record<NoticeType, { label: string; emoji: string; color: string; vibrate: number[]; sticky: boolean; hint: string }> = {
  urgent: { label: "Urgent", emoji: "🚨", color: "#B42318", vibrate: [300, 120, 300, 120, 300], sticky: true, hint: "Water is back, or something that can't wait" },
  due: { label: "Your job", emoji: "⏰", color: "#E8590C", vibrate: [180, 100, 180], sticky: false, hint: "A job of yours is still open or past its time" },
  suggest: { label: "Suggested", emoji: "🙋", color: "#0C4A59", vibrate: [120], sticky: false, hint: "A job that suits you, or one that needs someone" },
  team: { label: "Team", emoji: "🤝", color: "#2F6B2A", vibrate: [120], sticky: false, hint: "Your team job is covered" },
  thanks: { label: "Thanks", emoji: "💛", color: "#B8577A", vibrate: [80], sticky: false, hint: "A thank-you, and an offer of a lighter week" },
  money: { label: "Money", emoji: "💰", color: "#A16207", vibrate: [150, 80, 150], sticky: false, hint: "Money is ready for a run, or a budget is nearly used" },
  bill: { label: "Bill", emoji: "🧾", color: "#6D28D9", vibrate: [150, 80, 150], sticky: false, hint: "A bill is due tomorrow" },
  question: { label: "Question", emoji: "❓", color: "#B45309", vibrate: [120, 80, 120], sticky: false, hint: "Someone has a question about a payment" },
  swap: { label: "Swap", emoji: "⇄", color: "#4338CA", vibrate: [200, 100, 200], sticky: true, hint: "Someone asks you to swap a job" },
  shop: { label: "Shopping", emoji: "🛒", color: "#15803D", vibrate: [100, 60, 100], sticky: false, hint: "Someone is at the shop: add what you need" },
  meeting: { label: "Meeting", emoji: "🗓️", color: "#0E7490", vibrate: [150, 80, 150], sticky: false, hint: "The family meeting is tomorrow, or starting soon" },
  group: { label: "Updates", emoji: "🏠", color: "#22201D", vibrate: [150], sticky: false, hint: "Several at once" },
  test: { label: "Test", emoji: "✅", color: "#2F6B2A", vibrate: [100], sticky: false, hint: "A test to check it works" },
};

/** The type of one alert, from its kind and (for money and house alerts) its key. */
export function typeOf(a: Pick<Alert, "kind" | "key">): NoticeType {
  const k = a.key ?? "";
  if (k.startsWith("budget:")) return "money";
  if (k.startsWith("review:")) return "question";
  if (k.startsWith("billdue:")) return "bill";
  if (k.startsWith("swap:")) return "swap";
  if (k.startsWith("trip:")) return "shop";
  if (k.startsWith("meet-")) return "meeting";
  switch (a.kind) {
    case "urgent":
      return "urgent";
    case "reminder":
    case "overdue":
      return "due";
    case "suggested":
    case "nudge":
    case "handover":
      return "suggest";
    case "covered":
      return "team";
    case "ease":
      return "thanks";
    case "funds":
      return "money";
  }
  return "group";
}

/** Up to two buttons on the banner, each opening the app where that action happens. */
export function actionsOf(a: Pick<Alert, "kind" | "key" | "jobId" | "url">): NoticeAction[] {
  const type = typeOf(a);
  const k = a.key ?? "";
  if (type === "due" && a.jobId) return [{ action: "done", title: "✓ Done", url: `/jobs?done=${a.jobId}&now=1` }];
  if ((type === "urgent" || a.kind === "suggested" || a.kind === "handover") && a.jobId) return [{ action: "join", title: "I'm on it", url: `/jobs?join=${a.jobId}` }];
  if (type === "swap") return [{ action: "accept", title: "Accept", url: `/jobs?swap=${k.slice(5)}&accept=1` }, { action: "open", title: "See it", url: "/jobs" }];
  if (type === "bill") return [{ action: "paid", title: "Paid it", url: a.url ?? "/money" }];
  if (type === "shop") return [{ action: "add", title: "Add to the list", url: "/shop" }];
  if (type === "question") return [{ action: "open", title: "Answer", url: "/money#entries" }];
  if (type === "meeting") return [{ action: "open", title: "See the agenda", url: "/more/meeting" }];
  return [];
}
