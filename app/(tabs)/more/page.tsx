import Link from "next/link";
import { Screen } from "@/components/Screen";

const ITEMS = [
  { href: "/more/meals", label: "Meals", hint: "This week's meals and who's cooking" },
  { href: "/more/meeting", label: "Meeting", hint: "Agenda, notes and decisions" },
  { href: "/more/contacts", label: "Contacts", hint: "Fundi, gas, water, clinic" },
  { href: "/more/settings", label: "Settings", hint: "This phone, alerts, other phones" },
];

export default function MorePage() {
  return (
    <Screen title="More">
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl bg-raised">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-bold">{item.label}</span>
                <span className="block text-sm text-muted">{item.hint}</span>
              </span>
              <span aria-hidden="true" className="text-muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
