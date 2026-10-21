import { Empty, Screen } from "@/components/Screen";

export default function Page() {
  return (
    <Screen title="Meals" back="/more">
      <Empty>Plan this week, or copy last week.</Empty>
    </Screen>
  );
}
