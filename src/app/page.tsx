import { Suspense } from "react";
import { AdminPortal } from "@/components/admin-portal";

export default function Home() {
  return (
    <Suspense>
      <AdminPortal />
    </Suspense>
  );
}
