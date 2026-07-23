import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, TooltipContentProps, XAxis, YAxis } from "recharts";
import { Sparkles, Cpu, Zap } from "lucide-react";
import { AdminAiAnalytics } from "@/api/admin/client";

interface AiUsageChartProps {
  data?: AdminAiAnalytics;
}

const fallbackSeries = [
  { period: "Day 1", credits: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  { period: "Day 2", credits: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
];

function AiChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as AdminAiAnalytics["series"][number];
  return (
    <div className="rounded-lg bg-[#272A36] px-3.5 py-2.5 text-xs text-white shadow-xl">
      <div className="font-semibold text-gray-300 mb-1">{item.period}</div>
      <div className="flex items-center gap-2 text-primary-400">
        <Sparkles className="h-3.5 w-3.5" />
        <span>{item.credits.toLocaleString()} AI Credits</span>
      </div>
      <div className="flex items-center gap-2 text-violet-400 mt-0.5">
        <Zap className="h-3.5 w-3.5" />
        <span>{item.inputTokens.toLocaleString()} input tokens</span>
      </div>
      <div className="flex items-center gap-2 text-fuchsia-400 mt-0.5">
        <Zap className="h-3.5 w-3.5" />
        <span>{item.outputTokens.toLocaleString()} output tokens</span>
      </div>
    </div>
  );
}

export default function AiUsageChart({ data }: AiUsageChartProps) {
  const [metric, setMetric] = useState<"credits" | "inputTokens" | "outputTokens">("credits");
  const chartSeries = data?.series && data.series.length > 0 ? data.series : fallbackSeries;
  const totalCredits = data?.totalCredits ?? chartSeries.reduce((acc, curr) => acc + curr.credits, 0);
  const totalInputTokens = data?.totalInputTokens ?? chartSeries.reduce((acc, curr) => acc + curr.inputTokens, 0);
  const totalOutputTokens = data?.totalOutputTokens ?? chartSeries.reduce((acc, curr) => acc + curr.outputTokens, 0);

  return (
    <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-200">AI Assistant Activity</h3>
          </div>
          <p className="mt-1 text-xs text-gray-400">System-wide AI query volume & LLM token consumption</p>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-[#000000]/60 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMetric("credits")}
            className={`cursor-pointer rounded-md px-2.5 py-1 transition-colors ${
              metric === "credits" ? "bg-primary-500 text-white font-medium" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Credits
          </button>
          <button
            type="button"
            onClick={() => setMetric("inputTokens")}
            className={`cursor-pointer rounded-md px-2.5 py-1 transition-colors ${
              metric === "inputTokens" ? "bg-violet-500 text-white font-medium" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Input
          </button>
          <button
            type="button"
            onClick={() => setMetric("outputTokens")}
            className={`cursor-pointer rounded-md px-2.5 py-1 transition-colors ${
              metric === "outputTokens" ? "bg-fuchsia-500 text-white font-medium" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Output
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="rounded-lg bg-[#000000]/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 pb-1">
            <Cpu className="h-3.5 w-3.5 text-primary-400" />
            <span>AI Credits Used</span>
          </div>
          <p className="mt-1 text-xl font-bold text-white">{totalCredits.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-[#000000]/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 pb-1">
            <Zap className="h-3.5 w-3.5 text-violet-400" />
            <span>Input Tokens</span>
          </div>
          <p className="mt-1 text-xl font-bold text-white">{totalInputTokens.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-[#000000]/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 pb-1">
            <Zap className="h-3.5 w-3.5 text-fuchsia-400" />
            <span>Output Tokens</span>
          </div>
          <p className="mt-1 text-xl font-bold text-white">{totalOutputTokens.toLocaleString()}</p>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartSeries} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={metric === "credits" ? "#42A5F5" : metric === "inputTokens" ? "#8B5CF6" : "#D946EF"}
                  stopOpacity={0.4}
                />
                <stop
                  offset="100%"
                  stopColor={metric === "credits" ? "#42A5F5" : metric === "inputTokens" ? "#8B5CF6" : "#D946EF"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#A1A1AA" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#A1A1AA" }} />
            <Tooltip content={(props) => <AiChartTooltip {...props} />} />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={metric === "credits" ? "#42A5F5" : metric === "inputTokens" ? "#8B5CF6" : "#D946EF"}
              strokeWidth={2.5}
              fill="url(#aiGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
