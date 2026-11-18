import { AdminScrollbarMode } from "@/features/admin/AdminScrollbarMode";
import { AdminDesignSystem } from "@/features/admin/AdminDesignSystem";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminDesignSystem data-admin-design-system>
      <AdminScrollbarMode />
      {children}
    </AdminDesignSystem>
  );
}
