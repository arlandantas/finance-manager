import { Suspense } from "react";
import { TagsScreen } from "./tags-screen";

export const metadata = { title: "Tags · Finance Manager" };

export default function TagsPage() {
  return (
    <Suspense fallback={null}>
      <TagsScreen />
    </Suspense>
  );
}
