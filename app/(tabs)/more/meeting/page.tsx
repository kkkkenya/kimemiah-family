import { Empty, Screen } from "@/components/Screen";

export default function Page() {
  return (
    <Screen title="Meeting" back="/more">
      <Empty>The next family meeting will show here.</Empty>
    </Screen>
  );
}
