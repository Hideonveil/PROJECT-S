export const DEVICES = ["PC", "主机", "手机"];

export const GENRES = ["FPS", "MOBA", "RTS", "射击", "沙盒", "模拟", "生存", "竞速", "卡牌", "角色扮演"];

export const DEFAULT_NEED = {
  // The active game is selected from the installed public catalog after
  // /api/config loads; an empty store must not invent a hidden default.
  game: "",
  mode: "排位赛",
  goal: "打满今晚定级，目标铂金",
  current: 1,
  target: 5,
  time: "21:30",
  duration: "90",
  voice: true,
  playerType: "稳定沟通，认真上分",
};
export const HOME_CASUAL_TIMES = ["现在就玩", "15分钟内", "30分钟内", "1小时内", "自定义时间"];
export const HOME_RANK_TIMES = ["1局", "3局", "5局", "不限局数"];
