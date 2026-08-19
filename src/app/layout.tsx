import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "机缘 · 此刻，一起玩",
  description: "机缘实时游戏活动匹配平台：此刻想怎么玩，就此刻找到一起玩的人。",
  icons: {
    icon: "/assets/jiyuan-mark.svg?v=4",
    shortcut: "/assets/jiyuan-mark.svg?v=4",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
