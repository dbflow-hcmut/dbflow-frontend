import dayjs from "dayjs";
import { AnalyticsBucket } from "@/api/admin/client";

export const money = (value: string | number) => `${Number(value).toLocaleString("vi-VN")} VND`;

export const compactMoney = (value: string | number) => {
  const number = Number(value);
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return `${number}`;
};

export const formatPeriodLabel = (period: string, bucket: AnalyticsBucket) => {
  if (bucket === "month") return dayjs(`${period}-01`).format("MMM YYYY");
  return dayjs(period).format("D MMM");
};

export const formatDate = (value?: string | null) => (value ? dayjs(value).format("D MMM YYYY") : "-");
