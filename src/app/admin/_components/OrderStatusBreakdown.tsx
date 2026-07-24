import { AdminOrderStatusBreakdown } from "@/api/admin/client";

const STATUS_META: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: "#42A5F5" },
  pending: { label: "Pending", color: "#F59E0B" },
  failed: { label: "Failed", color: "#EF4444" },
  canceled: { label: "Canceled", color: "#71717A" },
  expired: { label: "Expired", color: "#52525B" },
};

export default function OrderStatusBreakdown({ breakdown }: { breakdown: AdminOrderStatusBreakdown[] }) {
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {breakdown.map((item) => {
          const meta = STATUS_META[item.status] ?? { label: item.status, color: "#71717A" };
          return (
            <div key={item.status} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
              <span className="text-sm text-gray-400">{meta.label}</span>
              <span className="text-sm font-semibold text-white">{item.count}</span>
            </div>
          );
        })}
        {breakdown.length === 0 && <p className="text-sm text-gray-400">No orders recorded in this period.</p>}
      </div>
      {total > 0 && (
        <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-[#27272A]">
          {breakdown.map((item) => {
            const meta = STATUS_META[item.status] ?? { label: item.status, color: "#71717A" };
            const width = (item.count / total) * 100;
            return <div key={item.status} style={{ width: `${width}%`, backgroundColor: meta.color }} />;
          })}
        </div>
      )}
    </div>
  );
}
