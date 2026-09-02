import { AdminScrollbarMode } from "@/features/admin/AdminScrollbarMode";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminScrollbarMode />
      {children}
    </>
  );
}
