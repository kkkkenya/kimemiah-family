import { Empty, Screen } from "@/components/Screen";

export default function Page() {
  return (
    <Screen title="Contacts" back="/more">
      <Empty>The house phone book will show here.</Empty>
    </Screen>
  );
}
