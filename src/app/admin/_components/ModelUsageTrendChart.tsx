import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminAiAnalytics } from "@/api/admin/client";

interface ModelUsageTrendChartProps {
  data?: AdminAiAnalytics;
}

type Metric = "modelCalls" | "credits" | "totalTokens";

const METRICS: { key: Metric; label: string }[] = [
  { key: "modelCalls", label: "Calls" },
  { key: "credits", label: "Credits" },
  { key: "totalTokens", label: "Tokens" },
];

const COLORS = [
  "#42A5F5",
  "#A78BFA",
  "#F472B6",
  "#34D399",
  "#FBBF24",
  "#FB7185",
  "#22D3EE",
  "#C084FC",
];

export default function ModelUsageTrendChart({
  data,
}: ModelUsageTrendChartProps) {
  const [metric, setMetric] = useState<Metric>("modelCalls");
  const models = useMemo(() => data?.dailyModels ?? [], [data?.dailyModels]);
  const chartData = useMemo(() => {
    const periods = new Map<string, Record<string, string | number>>();
    for (const model of models) {
      for (const point of model.series) {
        const row = periods.get(point.period) ?? { period: point.period };
        row[model.modelName] = point[metric];
        periods.set(point.period, row);
      }
    }
    return [...periods.values()].sort((a, b) =>
      String(a.period).localeCompare(String(b.period)),
    );
  }, [metric, models]);

  return (
    <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-200">
            Model Usage Trend
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            Daily AI usage broken down by model
          </p>
        </div>
        <div className="flex rounded-lg bg-black/60 p-1 text-xs">
          {METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMetric(item.key)}
              className={`cursor-pointer rounded-md px-3 py-1 transition-colors ${
                metric === item.key
                  ? "bg-primary-500 font-medium text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {models.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-gray-500">
          No model usage recorded for this period.
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
            >
              <CartesianGrid
                stroke="#2A2D37"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#A1A1AA" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#A1A1AA" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  border: 0,
                  borderRadius: 8,
                  background: "#272A36",
                  color: "#fff",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#D1D5DB", fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              {models.map((model, index) => (
                <Line
                  key={model.modelName}
                  type="monotone"
                  dataKey={model.modelName}
                  name={model.modelName}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
