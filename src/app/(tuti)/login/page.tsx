import { Suspense } from "react";
import { AccountFlow } from "@/features/tuti/flows/AccountFlow";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AccountFlow />
    </Suspense>
  );
}
