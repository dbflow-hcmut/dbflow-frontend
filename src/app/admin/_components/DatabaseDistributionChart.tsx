import { Database } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
} from "recharts";
import { AdminDbEngineBreakdown } from "@/api/admin/client";

interface DatabaseDistributionChartProps {
  breakdown?: AdminDbEngineBreakdown[];
}

const COLOR_MAP: Record<string, string> = {
  postgres: "#42A5F5",
  postgresql: "#42A5F5",
  mysql: "#00758F",
  sqlite: "#60A5FA",
  sqlserver: "#F43F5E",
  oracle: "#F80000",
  mongodb: "#10B981",
};

export default function DatabaseDistributionChart({
  breakdown,
}: DatabaseDistributionChartProps) {
  const items = (breakdown && breakdown.length > 0 ? breakdown : []).map(
    (item) => {
      const key = item.name.toLowerCase();
      const color = COLOR_MAP[key] ?? "#A1A1AA";
      return {
        name: item.name,
        count: item.count,
        color,
      };
    },
  );

  const totalConnections = items.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold text-gray-200">
            Connected DB Engines
          </h3>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Distribution of connected database management systems
        </p>

        <div className="relative h-44 w-full">
          {items.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={({ active, payload }: TooltipContentProps) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as {
                      name: string;
                      count: number;
                      color: string;
                    };
                    const pct =
                      totalConnections > 0
                        ? Math.round((data.count / totalConnections) * 100)
                        : 0;
                    return (
                      <div className="rounded-lg bg-[#272A36] px-3 py-2 text-xs text-white shadow-xl">
                        <span
                          className="font-semibold"
                          style={{ color: data.color }}
                        >
                          {data.name}
                        </span>
                        <div className="text-gray-300 mt-0.5">
                          {data.count} connections ({pct}%)
                        </div>
                      </div>
                    );
                  }}
                />
                <Pie
                  data={items}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={3}
                  isAnimationActive={false}
                >
                  {items.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div>
                <p className="text-xl font-bold leading-none text-white">0</p>
                <p className="mt-1 text-xs text-gray-400">
                  Total active connections
                </p>
              </div>
            </div>
          )}
          {items.length > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-gray-400">Total Active</span>
              <span className="text-xl font-bold text-white">
                {totalConnections}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {items.map((engine) => {
          const pct =
            totalConnections > 0
              ? Math.round((engine.count / totalConnections) * 100)
              : 0;
          return (
            <div
              key={engine.name}
              className="flex items-center justify-between rounded-lg bg-[#000000]/60 px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: engine.color }}
                />
                <span className="text-gray-200 font-medium capitalize">
                  {engine.name}
                </span>
              </div>
              <span className="text-gray-400 font-semibold">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
