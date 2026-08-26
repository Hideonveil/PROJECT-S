import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Matching V2 · Interactive Prototype",
  description: "隔离的 Matching V2 交互原型，仅使用本地 mock 状态。",
};

export default function MatchingV2Layout({ children }: { children: React.ReactNode }) {
  return children;
}
