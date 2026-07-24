import { Layers } from "lucide-react";
import { AdminPlanDistribution } from "@/api/admin/client";

interface PlanDistributionChartProps {
  distribution?: AdminPlanDistribution[];
}

const PLAN_COLORS: Record<string, string> = {
  Free: "#9CA3AF",
  Personal: "#60A5FA",
  Pro: "#10B981",
  Team: "#8B5CF6",
  Enterprise: "#F59E0B",
};

export default function PlanDistributionChart({ distribution }: PlanDistributionChartProps) {
  const items = (distribution && distribution.length > 0 ? distribution : []).map((item) => {
    const key = item.planName;
    const color = PLAN_COLORS[key] ?? "#42A5F5";
    return {
      name: item.planName,
      count: item.count,
      color,
    };
  });

  const totalSubs = items.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-200">Active Subscriptions by Plan</h3>
          </div>
          <span className="text-xs font-semibold text-gray-400">{totalSubs} Total Active</span>
        </div>
        <p className="text-xs text-gray-400 mb-5">Distribution of active subscriptions across pricing tiers</p>

        {items.length > 0 ? (
          <div className="space-y-4">
            {items.map((item) => {
              const pct = totalSubs > 0 ? Math.round((item.count / totalSubs) * 100) : 0;
              return (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-medium text-gray-200">{item.name} Plan</span>
                    </div>
                    <span className="text-gray-400 font-semibold">{item.count} subs ({pct}%)</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#000000]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-gray-400">
            No active subscriptions registered yet.
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-neutral-800/80 pt-4 flex items-center justify-between text-xs text-gray-400">
        <span>Subscription Tier Health</span>
      </div>
    </div>
  );
}
