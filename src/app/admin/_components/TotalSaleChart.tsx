import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, TooltipContentProps, XAxis, YAxis } from "recharts";
import { AnalyticsBucket } from "@/api/admin/client";
import { compactMoney, formatPeriodLabel, money } from "../_lib/format";

type TotalSaleChartProps = {
  series: { period: string; value: number }[];
  bucket: AnalyticsBucket;
};

function ChartTooltip({ active, payload, bucket }: TooltipContentProps & { bucket: AnalyticsBucket }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as { period: string; value: number };
  return (
    <div className="rounded-lg bg-[#272A36] px-3 py-2 text-xs font-medium text-white shadow-xl">
      {money(point.value)} on {formatPeriodLabel(point.period, bucket)}
    </div>
  );
}

export default function TotalSaleChart({ series, bucket }: TotalSaleChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = series.reduce((sum, point) => sum + point.value, 0);

  return (
    <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-gray-200">Total Sale</p>
          <p className="mt-1 text-2xl font-bold text-white">{money(total)}</p>
        </div>
      </div>
      <div className="mt-4 h-64">
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              onMouseMove={(state) =>
                setActiveIndex(state.isTooltipActive && state.activeTooltipIndex != null ? Number(state.activeTooltipIndex) : null)
              }
              onMouseLeave={() => setActiveIndex(null)}
              margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="period"
                tickFormatter={(period: string) => formatPeriodLabel(period, bucket)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#A1A1AA" }}
              />
              <YAxis tickFormatter={(value: number) => compactMoney(value)} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#A1A1AA" }} width={48} />
              <Tooltip cursor={{ fill: "rgba(66,165,245,0.12)" }} content={(props) => <ChartTooltip {...props} bucket={bucket} />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {series.map((_, index) => (
                  <Cell key={index} fill={index === activeIndex ? "#60A5FA" : "#42A5F5"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">No orders recorded in this period.</div>
        )}
      </div>
    </div>
  );
}
