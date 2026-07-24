import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

export default function PaidRateGauge({ rate }: { rate: number }) {
  const tone = rate >= 70 ? "high" : rate >= 40 ? "moderate" : "low";
  const toneLabel = { high: "high", moderate: "moderate", low: "low" }[tone];
  const toneColor = { high: "#22C55E", moderate: "#F59E0B", low: "#EF4444" }[tone];

  return (
    <div className="relative flex h-56 w-full flex-col items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={[{ value: rate, fill: toneColor }]}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
          barSize={16}
          cx="50%"
          cy="70%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "#272A36" }} dataKey="value" cornerRadius={8} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[66%] flex -translate-y-1/2 flex-col items-center">
        <p className="text-3xl font-bold text-white">{rate}%</p>
      </div>
      <p className="text-xs font-medium text-gray-400">Rate is {toneLabel}</p>
    </div>
  );
}
