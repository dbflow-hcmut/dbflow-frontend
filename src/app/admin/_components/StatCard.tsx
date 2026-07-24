import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { AdminAnalyticsStat } from "@/api/admin/client";

type StatCardProps = {
  stat: AdminAnalyticsStat;
  icon: React.ReactNode;
  iconTone: string;
  formatValue: (value: number) => string;
};

export default function StatCard({ stat, icon, iconTone, formatValue }: StatCardProps) {
  const isUp = stat.changePct >= 0;
  const primaryColor = "#42A5F5";
  const chartData = stat.series.length > 0 ? stat.series : [{ period: "", value: 0 }];

  return (
    <div className="flex flex-col rounded-xl bg-[#1A1C24] p-5 shadow-sm transition-all hover:bg-[#222530]">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>{icon}</span>
        <span className="text-base font-semibold text-gray-200">{stat.label}</span>
      </div>
      <p className="pt-2! text-2xl font-bold text-white">{formatValue(stat.value)}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className={`flex items-center gap-1 text-xs font-medium ${isUp ? "text-emerald-400" : "text-rose-400"}`}>
          {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          <span>{Math.abs(stat.changePct)}% vs previous period</span>
        </p>
        <div className="h-9 w-24 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${stat.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={primaryColor}
                strokeWidth={2}
                fill={`url(#spark-${stat.key})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
