export const GAMES = [
  {
    id: "minecraft",
    name: "我的世界",
    tag: "沙盒",
    modes: ["生存", "建筑", "红石", "整合包", "探索", "开荒", "随便玩"],
    roles: ["生存玩家", "建筑师", "红石工程师"],
    devices: ["PC", "主机", "手机"],
  },
  {
    id: "stardew",
    name: "星露谷物语",
    tag: "模拟",
    modes: ["多人农场", "矿洞探索", "钓鱼", "种田", "节日活动", "随便玩"],
    roles: ["农场主", "矿工", "渔夫"],
    devices: ["PC", "主机", "手机"],
  },
  {
    id: "pubg",
    name: "PUBG",
    tag: "射击",
    modes: ["四排", "双排", "单人", "娱乐"],
    roles: ["突击手", "狙击手", "侦察"],
    devices: ["PC", "主机", "手机"],
  },
  {
    id: "valorant",
    name: "无畏契约",
    tag: "FPS",
    modes: ["排位 / 上分", "极速模式", "自定义训练", "娱乐"],
    roles: ["决斗者", "先锋", "控场者", "哨兵"],
    devices: ["PC"],
  },
  {
    id: "hok",
    name: "王者荣耀",
    tag: "MOBA",
    modes: ["排位 / 上分", "巅峰赛", "娱乐模式"],
    roles: ["对抗路", "打野", "中路", "发育路", "游走"],
    devices: ["手机"],
  },
  {
    id: "league",
    name: "英雄联盟",
    tag: "MOBA",
    modes: ["排位 / 上分", "灵活组排", "大乱斗", "娱乐"],
    roles: ["上单", "打野", "中单", "下路", "辅助"],
    devices: ["PC"],
  },
  {
    id: "genshin",
    name: "原神",
    tag: "开放世界",
    modes: ["刷材料", "跑图", "解谜", "带新人", "长期相伴", "随便玩"],
    roles: ["输出", "辅助", "探索", "带人"],
    devices: ["PC", "主机", "手机"],
  },
  {
    id: "deadlock",
    name: "Deadlock",
    tag: "MOBA FPS",
    modes: ["排位 / 上分", "普通对局", "娱乐", "练英雄", "固定队", "开黑"],
    roles: ["Carry", "Support", "Flex", "Solo", "Duo"],
    devices: ["PC"],
  },
];

export const DEVICES = ["PC", "主机", "手机"];

export const GENRES = ["FPS", "MOBA", "RTS", "射击", "沙盒", "模拟", "生存", "竞速", "卡牌", "角色扮演"];

export const DEFAULT_NEED = {
  game: "valorant",
  mode: "排位赛",
  goal: "打满今晚定级，目标铂金",
  current: 1,
  target: 5,
  time: "21:30",
  duration: "90",
  voice: true,
  playerType: "稳定沟通，认真上分",
};

export const DEFAULT_USER = {
  id: "me",
  nickname: "夜航",
  handle: "NIGHTRUN#0420",
  avatarKey: "me-1",
  friendCode: "NODE-DEMO-0001",
  device: "PC",
  gender: "保密",
  games: [
    {
      gameId: "valorant",
      role: "决斗者",
      level: 42,
      winRate: "53%",
      note: "稳定沟通，认真上分",
    },
  ],
  playStyle: "稳定沟通，认真上分",
  voice: true,
  online: true,
};

export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));