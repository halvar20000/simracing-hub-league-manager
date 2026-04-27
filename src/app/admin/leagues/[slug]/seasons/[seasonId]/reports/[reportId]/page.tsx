import { redirect } from "next/navigation";

// Reuse the shared report detail page; it already handles admin viewers.
export default async function AdminReportDetailRedirect({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; reportId: string }>;
}) {
  const { reportId } = await params;
  redirect(`/reports/${reportId}`);
}
