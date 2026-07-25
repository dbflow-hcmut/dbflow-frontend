"use client";

import { AdminOverviewAnalytics, AdminSubscription, getAdminOverviewAnalytics, getAdminSubscriptions } from "@/api/admin/client";
import LoadingIndicator from "@/components/LoadingIndicator";
import { Avatar, DatePicker, Select, Table } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { DollarSign, Layers, ShoppingBag, Users } from "lucide-react";
import { useEffect, useState } from "react";
import PlanDistributionChart from "./_components/PlanDistributionChart";
import PaidRateGauge from "./_components/PaidRateGauge";
import StatCard from "./_components/StatCard";
import TotalSaleChart from "./_components/TotalSaleChart";
import AiUsageChart from "./_components/AiUsageChart";
import DatabaseDistributionChart from "./_components/DatabaseDistributionChart";
import ProjectAnalyticsCard from "./_components/ProjectAnalyticsCard";
import ModelUsageTrendChart from "./_components/ModelUsageTrendChart";
import { compactMoney } from "./_lib/format";
import { ADMIN_TABLE_CLASS } from "./_lib/styles";

const { RangePicker } = DatePicker;

const STAT_ICONS: Record<string, { icon: React.ReactNode; tone: string; formatValue: (value: number) => string }> = {
  revenue: { icon: <DollarSign className="h-5 w-5" />, tone: "bg-[#000000] text-primary-400", formatValue: (value) => `${compactMoney(value)} VND` },
  orders: { icon: <ShoppingBag className="h-5 w-5" />, tone: "bg-[#000000] text-orange-400", formatValue: (value) => value.toLocaleString() },
  newUsers: { icon: <Users className="h-5 w-5" />, tone: "bg-[#000000] text-violet-400", formatValue: (value) => value.toLocaleString() },
  newSubscriptions: { icon: <Layers className="h-5 w-5" />, tone: "bg-[#000000] text-emerald-400", formatValue: (value) => value.toLocaleString() },
};

export default function AdminOverviewPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, "day"), dayjs()]);
  const [bucketOverride, setBucketOverride] = useState<"day" | "week" | "month" | undefined>();
  const [analytics, setAnalytics] = useState<AdminOverviewAnalytics>();
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);

  useEffect(() => {
    void getAdminOverviewAnalytics(range[0].format("YYYY-MM-DD"), range[1].format("YYYY-MM-DD"), bucketOverride)
      .then(setAnalytics);
  }, [range, bucketOverride]);

  useEffect(() => {
    void getAdminSubscriptions().then(setSubscriptions);
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 text-gray-100">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Overview</h2>
          <p className="mt-1 text-sm text-gray-400">System performance, AI utilization, database assets and revenue metrics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker
            value={range}
            format="DD MMM YYYY"
            allowClear={false}
            className="!rounded-xl !border-0 !bg-[#1A1C24] !text-gray-200 [&_.ant-picker-input_input]:!text-gray-200 [&_.ant-picker-suffix]:!text-gray-400"
            onChange={(values) => {
              if (values && values[0] && values[1]) setRange([dayjs(values[0].toDate()), dayjs(values[1].toDate())]);
            }}
          />
          <Select
            value={bucketOverride ?? analytics?.range.bucket}
            className="w-32 [&_.ant-select-selector]:!rounded-xl [&_.ant-select-selector]:!border-0 [&_.ant-select-selector]:!bg-[#1A1C24] [&_.ant-select-selection-item]:!text-gray-200"
            options={[
              { value: "day", label: "Daily" },
              { value: "week", label: "Weekly" },
              { value: "month", label: "Monthly" },
            ]}
            onChange={(value) => setBucketOverride(value)}
          />
        </div>
      </div>

      {!analytics ? (
        <LoadingIndicator fullArea size="medium" label="Loading admin overview" />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Top 4 Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {analytics.stats.map((stat) => {
              const meta = STAT_ICONS[stat.key] ?? { icon: <Layers className="h-5 w-5" />, tone: "bg-[#000000] text-gray-400", formatValue: (value: number) => value.toLocaleString() };
              return <StatCard key={stat.key} stat={stat} icon={meta.icon} iconTone={meta.tone} formatValue={meta.formatValue} />;
            })}
          </div>

          {/* Plan Distribution & Paid Rate */}
          <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <PlanDistributionChart distribution={analytics.planDistribution} />
            <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm flex flex-col">
              <h3 className="text-base font-semibold text-gray-200">Paid Order Rate</h3>
              <div className="my-auto flex w-full items-center justify-center py-2">
                <PaidRateGauge rate={analytics.paidOrderRate} />
              </div>
            </div>
          </div>

          {/* Revenue & AI System Activity */}
          <div className="grid gap-6 xl:grid-cols-2">
            <TotalSaleChart series={analytics.stats.find((stat) => stat.key === "revenue")?.series ?? []} bucket={analytics.range.bucket} />
            <AiUsageChart data={analytics.aiAnalytics} />
          </div>

          <ModelUsageTrendChart data={analytics.aiAnalytics} />

          {/* Connected DB Engines & Projects / Document Hub */}
          <div className="grid gap-6 xl:grid-cols-2">
            <DatabaseDistributionChart breakdown={analytics.dbEngineBreakdown} />
            <ProjectAnalyticsCard analytics={analytics.projectAnalytics} />
          </div>

          {/* Recent Subscriptions Table */}
          <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-200 mb-4">Recent Subscriptions</h3>
            <div className="overflow-hidden rounded-lg">
              <Table
                size="small"
                rowKey="id"
                dataSource={subscriptions.filter((item) => !["free", "team_free"].includes(item.plan?.code ?? "")).slice(0, 5)}
                pagination={false}
                className={ADMIN_TABLE_CLASS}
                columns={[
                  {
                    title: "Subscriber",
                    render: (_: unknown, item: AdminSubscription) =>
                      item.owner ? (
                        <div className="flex items-center gap-2">
                          <Avatar src={item.owner.avatar} size={28} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-gray-100">{item.owner.fullName}</div>
                            <div className="truncate text-xs text-gray-400">{item.owner.email}</div>
                          </div>
                        </div>
                      ) : (
                        "-"
                      ),
                  },
                  { title: "Plan", render: (_: unknown, item: AdminSubscription) => item.plan?.name ?? "-" },
                  { title: "Cycle", dataIndex: "billingCycle" },
                  { title: "Seats", dataIndex: "quantity" },
                  { title: "Status", dataIndex: "status", render: (value: string) => <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400 capitalize">{value}</span> },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
