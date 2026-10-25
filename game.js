const CONFIG = {
  maxRounds: 30,
  startCash: 1600,
  startBonus: 300,
  startStopBonus: 160,
};

const DEFAULT_MAP_ID = "classic";

const CLASSIC_ROUTE_POSITIONS = [
  { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 },
  { x: 6, y: 1 }, { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 7, y: 3 },
  { x: 7, y: 4 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 6, y: 6 },
  { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 6 },
  { x: 1, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 3 }, { x: 1, y: 2 },
];

const CLASSIC_TILE_NAMES = [
  "市政府", "晨曦街", "花园里", "曦园", "银行金库",
  "环城商会", "环城商会", "皇家大酒店", "皇家大酒店",
  "命运转盘", "百味町", "湖畔街", "瀚海阁", "道具商店",
  "温泉庄园", "温泉庄园", "枫叶路", "城建局",
  "中央区", "艺文里", "翻牌驿站", "日落湾",
];

const CLASSIC_LARGE_LOT_LINKS = { 6: 5, 8: 7, 15: 14 };

const LOT_THEMES = [
  { key: "villa", label: "住宅区", color: "#86efac" },
  { key: "shop", label: "商业街", color: "#fde68a" },
  { key: "hotel", label: "度假区", color: "#fbcfe8" },
  { key: "tower", label: "商务区", color: "#bfdbfe" },
];

const PLAYER_DEFS = [
  { id: "human", name: "玩家", color: "#318d88", isAi: false },
  { id: "ai", name: "AI 对手", color: "#d67c59", isAi: true },
];

const CLASSIC_DISTRICT_CONFIG = {
  1: "晨曦街区", 2: "晨曦街区", 3: "晨曦街区",
  5: "金融街区", 6: "金融街区", 7: "金融街区", 8: "金融街区",
  10: "湖畔街区", 11: "湖畔街区", 12: "湖畔街区",
  14: "温泉街区", 15: "温泉街区", 16: "温泉街区",
  18: "中央街区", 19: "中央街区", 21: "中央街区",
};

const CLASSIC_DISTRICT_COLORS = {
  "晨曦街区": "#86efac",
  "金融街区": "#93c5fd",
  "湖畔街区": "#fde68a",
  "温泉街区": "#f9a8d4",
  "中央街区": "#c4b5fd",
};

const CLASSIC_SPECIAL_TILES = {
  4:  { type: "bank", label: "金库", color: "#bfdbfe", description: "存钱或提款！" },
  9:  { type: "card_draw", label: "翻牌格", color: "#e9d5ff", description: "三选一存入背包，掷骰前可选用" },
  13: { type: "chance", label: "道具商店", color: "#fbcfe8", description: "花金币选购一张道具卡，存入背包择机使用" },
  17: { type: "construction", label: "城建局", color: "#fef08a", description: "建造或拆除！" },
  20: { type: "card_draw", label: "翻牌格", color: "#e9d5ff", description: "三选一存入背包，掷骰前可选用" },
};

const CLASSIC_LOT_CONFIGS = {
  1:  { price: 80,  buildCosts: [0, 40, 70, 110],  tolls: [20, 60, 130, 220],  themeIdx: 0 },
  2:  { price: 90,  buildCosts: [0, 42, 75, 115],  tolls: [22, 65, 140, 235],  themeIdx: 0 },
  3:  { price: 95,  buildCosts: [0, 44, 78, 120],  tolls: [24, 68, 148, 246],  themeIdx: 0 },
  5:  { price: 240, buildCosts: [0, 80, 130, 185], tolls: [55, 140, 280, 460], themeIdx: 3, effectId: "finance_bonus", landmarkKey: "finance" },
  7:  { price: 210, buildCosts: [0, 72, 118, 172], tolls: [48, 125, 250, 415], themeIdx: 3, effectId: "tower_bonus", landmarkKey: "skyscraper" },
  10: { price: 140, buildCosts: [0, 55, 95, 140],  tolls: [34, 90, 180, 300],  themeIdx: 1 },
  11: { price: 150, buildCosts: [0, 58, 100, 145], tolls: [36, 95, 190, 315],  themeIdx: 1 },
  12: { price: 170, buildCosts: [0, 62, 105, 155], tolls: [40, 105, 210, 345], themeIdx: 1 },
  14: { price: 280, buildCosts: [0, 90, 145, 210], tolls: [65, 160, 320, 530], themeIdx: 2, effectId: "hot_spring_rest", landmarkKey: "onsen" },
  16: { price: 180, buildCosts: [0, 65, 110, 160], tolls: [42, 110, 220, 360], themeIdx: 2 },
  18: { price: 70,  buildCosts: [0, 35, 65, 100],  tolls: [18, 55, 120, 200],  themeIdx: 0 },
  19: { price: 80,  buildCosts: [0, 40, 70, 110],  tolls: [20, 60, 130, 220],  themeIdx: 0 },
  21: { price: 90,  buildCosts: [0, 42, 75, 115],  tolls: [22, 65, 140, 235],  themeIdx: 0 },
};

const COMPACT_ROUTE_POSITIONS = [
  { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 6, y: 1 },
  { x: 6, y: 2 }, { x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 },
  { x: 3, y: 5 }, { x: 2, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 3 }, { x: 1, y: 2 },
];

const COMPACT_TILE_NAMES = [
  "市政府", "河畔小筑", "林间公馆", "林间公馆", "晨曦街", "城建局",
  "翻牌驿站", "道具商店", "冲刺站", "中央金库", "港风小筑", "潮畔温泉",
  "潮畔温泉", "传送港", "艺文里", "命运转盘", "艺文里南", "艺文里北",
];

const COMPACT_LARGE_LOT_LINKS = { 3: 2, 12: 11 };
const COMPACT_DISTRICT_CONFIG = {
  1: "河畔街区", 2: "河畔街区", 3: "河畔街区", 4: "河畔街区",
  10: "海湾街区", 11: "海湾街区", 12: "海湾街区",
  14: "艺文街区", 16: "艺文街区", 17: "艺文街区",
};
const COMPACT_DISTRICT_COLORS = {
  "河畔街区": "#86efac",
  "海湾街区": "#93c5fd",
  "艺文街区": "#c4b5fd",
};
const COMPACT_SPECIAL_TILES = {
  5:  { type: "construction", label: "城建局", color: "#fef08a", description: "建造或拆除！" },
  6:  { type: "card_draw", label: "翻牌格", color: "#e9d5ff", description: "三选一存入背包，掷骰前可选用" },
  7:  { type: "chance", label: "道具商店", color: "#fbcfe8", description: "花金币选购一张道具卡，存入背包择机使用" },
  8:  { type: "rush", label: "冲刺站", color: "#fdba74", rushMin: 2, rushMax: 8, description: "随机冲刺 2–8 格，到达后立即结算。" },
  9:  { type: "bank", label: "金库", color: "#bfdbfe", description: "存钱或提款！" },
  13: { type: "teleport", label: "传送港", color: "#a7f3d0", settleArrival: true, description: "随机传送到一块地产，到达后立即结算。" },
  15: { type: "card_draw", label: "命运轮盘", color: "#e9d5ff", description: "三选一存入背包，掷骰前可选用" },
};
const COMPACT_LOT_CONFIGS = {
  1:  { price: 100, buildCosts: [0, 44, 76, 118], tolls: [24, 68, 146, 238], themeIdx: 0 },
  2:  { price: 220, buildCosts: [0, 78, 128, 180], tolls: [48, 128, 266, 430], themeIdx: 2, effectId: "finance_bonus", landmarkKey: "finance" },
  4:  { price: 110, buildCosts: [0, 48, 80, 125], tolls: [26, 72, 154, 250], themeIdx: 0 },
  10: { price: 130, buildCosts: [0, 52, 88, 136], tolls: [30, 82, 172, 280], themeIdx: 1 },
  11: { price: 240, buildCosts: [0, 82, 132, 188], tolls: [52, 138, 284, 458], themeIdx: 2, effectId: "hot_spring_rest", landmarkKey: "onsen" },
  14: { price: 90,  buildCosts: [0, 40, 70, 108], tolls: [22, 62, 132, 220], themeIdx: 0 },
  16: { price: 95,  buildCosts: [0, 42, 74, 112], tolls: [23, 64, 136, 226], themeIdx: 0 },
  17: { price: 105, buildCosts: [0, 46, 78, 120], tolls: [25, 68, 144, 236], themeIdx: 0 },
};

const EXPANSION_ROUTE_POSITIONS = [
  { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 },
  { x: 6, y: 1 }, { x: 7, y: 1 }, { x: 8, y: 1 }, { x: 9, y: 1 }, { x: 10, y: 1 },
  { x: 10, y: 2 }, { x: 10, y: 3 }, { x: 10, y: 4 }, { x: 10, y: 5 }, { x: 10, y: 6 },
  { x: 9, y: 6 }, { x: 8, y: 6 }, { x: 7, y: 6 }, { x: 6, y: 6 }, { x: 5, y: 6 },
  { x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 6 },
  { x: 1, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 3 }, { x: 1, y: 2 },
];

const EXPANSION_TILE_NAMES = [
  "市政府", "晶藤街", "花园里", "清贝里", "银行金库", "开发局",
  "新月里", "都会大酒店", "都会大酒店", "望月庭", "翻牌驿站", "百味町",
  "城市快线",
  "烟火巷", "街角道具商店", "食光里", "传送港", "暮岚街", "港湾路", "命运转盘",
  "潮畔街", "云栖区", "星湾道具商店", "星港里", "星河庭", "天际里", "新月温泉", "新月温泉",
];

const EXPANSION_LARGE_LOT_LINKS = { 8: 7, 27: 26 };
const EXPANSION_DISTRICT_CONFIG = {
  1: "晶藤街区", 2: "晶藤街区", 3: "晶藤街区",
  6: "新月街区", 7: "新月街区", 8: "新月街区", 9: "新月街区",
  11: "百味街区", 13: "百味街区", 15: "百味街区",
  17: "海港街区", 18: "海港街区", 20: "海港街区",
  21: "星湾街区", 23: "星湾街区", 24: "星湾街区",
  25: "天际街区", 26: "天际街区", 27: "天际街区",
};
const EXPANSION_DISTRICT_COLORS = {
  "晶藤街区": "#86efac",
  "新月街区": "#f9a8d4",
  "百味街区": "#fde68a",
  "海港街区": "#93c5fd",
  "星湾街区": "#c4b5fd",
  "天际街区": "#67e8f9",
};
const EXPANSION_SPECIAL_TILES = {
  4:  { type: "bank", label: "金库", color: "#bfdbfe", description: "存钱或提款！" },
  5:  { type: "construction", label: "开发局", color: "#fef08a", description: "强化建设节奏。" },
  10: { type: "card_draw", label: "翻牌格", color: "#e9d5ff", description: "三选一存入背包，掷骰前可选用" },
  12: { type: "rush", label: "城市快线", color: "#fdba74", rushMin: 3, rushMax: 5, description: "随机冲刺 3–5 格，到达后立即结算。" },
  14: { type: "chance", label: "道具商店", color: "#fbcfe8", description: "花金币选购一张道具卡，存入背包择机使用" },
  16: { type: "teleport", label: "传送港", color: "#a7f3d0", settleArrival: true, description: "随机传送到一块地产，到达后立即结算。" },
  19: { type: "card_draw", label: "命运转盘", color: "#e9d5ff", description: "三选一存入背包，掷骰前可选用" },
  22: { type: "chance", label: "道具商店", color: "#fbcfe8", description: "花金币选购一张道具卡，存入背包择机使用" },
};
const EXPANSION_LOT_CONFIGS = {
  1:  { price: 80,  buildCosts: [0, 38, 66, 100], tolls: [18, 52, 112, 188], themeIdx: 0 },
  2:  { price: 90,  buildCosts: [0, 40, 70, 106], tolls: [20, 58, 122, 202], themeIdx: 0 },
  3:  { price: 105, buildCosts: [0, 46, 78, 118], tolls: [24, 66, 138, 228], themeIdx: 0 },
  6:  { price: 110, buildCosts: [0, 48, 82, 124], tolls: [26, 72, 148, 242], themeIdx: 0 },
  7:  { price: 280, buildCosts: [0, 90, 144, 206], tolls: [62, 158, 318, 516], themeIdx: 3, effectId: "tower_bonus", landmarkKey: "skyscraper" },
  9:  { price: 125, buildCosts: [0, 50, 84, 128], tolls: [28, 76, 156, 256], themeIdx: 1 },
  11: { price: 95,  buildCosts: [0, 42, 74, 112], tolls: [22, 60, 130, 216], themeIdx: 0 },
  13: { price: 120, buildCosts: [0, 50, 86, 130], tolls: [28, 76, 158, 258], themeIdx: 1 },
  15: { price: 115, buildCosts: [0, 48, 82, 124], tolls: [26, 72, 150, 246], themeIdx: 0 },
  17: { price: 135, buildCosts: [0, 54, 90, 136], tolls: [30, 82, 168, 276], themeIdx: 1 },
  18: { price: 145, buildCosts: [0, 56, 92, 142], tolls: [34, 88, 182, 298], themeIdx: 1 },
  20: { price: 110, buildCosts: [0, 48, 82, 124], tolls: [26, 72, 148, 242], themeIdx: 0 },
  21: { price: 120, buildCosts: [0, 50, 84, 130], tolls: [28, 76, 158, 258], themeIdx: 1 },
  23: { price: 130, buildCosts: [0, 52, 88, 136], tolls: [30, 82, 174, 286], themeIdx: 1 },
  24: { price: 140, buildCosts: [0, 54, 90, 138], tolls: [32, 86, 176, 290], themeIdx: 1 },
  25: { price: 150, buildCosts: [0, 58, 96, 146], tolls: [36, 94, 188, 306], themeIdx: 1 },
  26: { price: 210, buildCosts: [0, 74, 122, 176], tolls: [46, 124, 256, 424], themeIdx: 2, effectId: "hot_spring_rest", landmarkKey: "onsen" },
};


// The central port is shared; each side excursion adds eight distinct spaces.
const HARBOR_ROUTE_POSITIONS = [
  {x:6,y:9},{x:7,y:9},{x:7,y:8},{x:7,y:7},{x:6,y:6},{x:5,y:6},
  {x:4,y:6},{x:4,y:5},{x:4,y:4},{x:5,y:3},{x:6,y:3},{x:7,y:3},
  {x:3,y:1},{x:1,y:3},{x:1,y:5},{x:1,y:7},{x:1,y:9},{x:1,y:11},{x:3,y:13},{x:4,y:14},
  {x:9,y:3},{x:11,y:4},{x:12,y:6},{x:12,y:8},{x:12,y:10},{x:11,y:12},{x:9,y:14},{x:8,y:14},
  {x:6,y:14},{x:6,y:13},{x:5,y:12},{x:5,y:11},{x:5,y:10},{x:5,y:9},
];
const HARBOR_TILE_NAMES = [
  "港务大厅","贝壳巷","港湾观景楼","港湾观景楼","归帆旅舍","主港建设局","港务办公楼","海崖温泉","海崖温泉","蓝窗公馆","主港补给站","双桥口",
  "商港道具商店","船坞工坊","商港金库","帆布商街","航海集市","造船局","商港邮局","渔火旅馆",
  "漂流邮局","海岸快线","珊瑚小筑","潮汐道具商店","海岸工坊","旅人驿站","归航快线","白沙旅馆",
  "归航广场","航海事务所","海港商会","海港商会","水手街","主港道具商店",
];
const HARBOR_LARGE_LOT_LINKS = { 3:2, 8:7, 31:30 };
const HARBOR_DISTRICT_CONFIG = {
  1:"主港街区",2:"主港街区",3:"主港街区",4:"主港街区",
  6:"海崖街区",7:"海崖街区",8:"海崖街区",
  9:"归帆街区",29:"归帆街区",
  30:"灯塔街区",31:"灯塔街区",32:"灯塔街区",
  15:"商贸街区",19:"商贸街区",22:"珊瑚街区",27:"珊瑚街区",
};
const HARBOR_DISTRICT_COLORS = {
  "主港街区":"#9edac8","灯塔街区":"#a7c8ed","商贸街区":"#efc891",
  "海崖街区":"#e7b5c6","归帆街区":"#b9c4e5","珊瑚街区":"#f6c7a8",
};
const HARBOR_SPECIAL_TILES = {
  5:{...CLASSIC_SPECIAL_TILES[17],label:"主港建设局"},
  10:{...CLASSIC_SPECIAL_TILES[9],label:"主港补给站",guaranteedCardId:"boost"},
  11:{type:"junction",label:"双桥口",color:"#91d6d7",description:"红黄航线轮换"},
  12:{...CLASSIC_SPECIAL_TILES[13],label:"商港道具商店"},
  13:{...CLASSIC_SPECIAL_TILES[17],label:"船坞工坊"},
  14:{...CLASSIC_SPECIAL_TILES[4],label:"商港金库"},
  16:{...CLASSIC_SPECIAL_TILES[13],label:"航海集市"},
  17:{...CLASSIC_SPECIAL_TILES[17],label:"造船局"},
  18:{...CLASSIC_SPECIAL_TILES[9],label:"商港邮局"},
  20:{...CLASSIC_SPECIAL_TILES[9],label:"漂流邮局"},
  21:{type:"rush",label:"海岸快线",color:"#fdba74",rushMin:2,rushMax:3,description:"前进 2–3 格"},
  23:{...CLASSIC_SPECIAL_TILES[13],label:"潮汐道具商店"},
  24:{...CLASSIC_SPECIAL_TILES[17],label:"海岸工坊"},
  25:{...CLASSIC_SPECIAL_TILES[9],label:"旅人驿站"},
  26:{type:"rush",label:"归航快线",color:"#fdba74",rushMin:2,rushMax:3,description:"前进 2–3 格"},
  28:{type:"junction",label:"归航广场",color:"#91d6d7",description:"两岛航线合流"},
  33:{...CLASSIC_SPECIAL_TILES[13],label:"主港道具商店"},
};
const HARBOR_LOT_CONFIGS = {
  1:{price:100,buildCosts:[0,42,72,112],tolls:[24,64,135,225],themeIdx:0},
  2:{price:220,buildCosts:[0,72,118,172],tolls:[48,128,255,420],themeIdx:3,effectId:"tower_bonus",landmarkKey:"skyscraper"},
  4:{price:160,buildCosts:[0,58,98,148],tolls:[38,100,200,325],themeIdx:2},
  6:{price:175,buildCosts:[0,62,104,156],tolls:[42,110,220,355],themeIdx:3},
  7:{price:270,buildCosts:[0,88,140,205],tolls:[60,155,310,510],themeIdx:2,effectId:"hot_spring_rest",landmarkKey:"onsen"},
  9:{price:105,buildCosts:[0,44,76,116],tolls:[24,68,144,235],themeIdx:0},
  15:{price:90,buildCosts:[0,38,66,102],tolls:[20,58,124,210],themeIdx:1},
  19:{price:125,buildCosts:[0,50,85,130],tolls:[28,80,166,275],themeIdx:2},
  22:{price:85,buildCosts:[0,38,66,102],tolls:[20,56,120,200],themeIdx:0},
  27:{price:145,buildCosts:[0,55,94,142],tolls:[34,92,190,310],themeIdx:2},
  29:{price:180,buildCosts:[0,65,108,160],tolls:[42,112,225,365],themeIdx:3},
  30:{price:230,buildCosts:[0,75,125,180],tolls:[52,135,270,450],themeIdx:3,effectId:"finance_bonus",landmarkKey:"finance"},
  32:{price:130,buildCosts:[0,50,85,130],tolls:[30,84,172,280],themeIdx:1},
};
const ALPINE_ROUTE_POSITIONS = [
  { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 6, y: 1 },
  { x: 6, y: 2 }, { x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 },
  { x: 6, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 8 },
  { x: 1, y: 7 }, { x: 1, y: 6 }, { x: 1, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 3 }, { x: 1, y: 2 },
];
const ALPINE_TILE_NAMES = [
  "山城会馆", "松风径", "山间邮局", "杉影台", "雪松集", "匠人山房",
  "映湖里", "山岚商会", "山岚商会", "山城金库", "云顶酒店", "云顶酒店",
  "雾岚街", "山泉道具商店", "云岭温泉", "云岭温泉", "枫叶馆", "木屋巷",
  "钟声里", "山麓集", "旅人驿站", "暖泉街", "归林里", "山间缆车",
];
const ALPINE_LARGE_LOT_LINKS = { 8: 7, 11: 10, 15: 14 };
const ALPINE_DISTRICT_CONFIG = {
  1: "松风街区", 3: "松风街区", 4: "松风街区",
  6: "风车街区", 7: "风车街区", 8: "风车街区",
  10: "云顶街区", 11: "云顶街区", 12: "云顶街区",
  14: "温泉街区", 15: "温泉街区", 16: "温泉街区",
  17: "山麓街区", 18: "山麓街区", 19: "山麓街区",
  21: "归林街区", 22: "归林街区",
};
const ALPINE_DISTRICT_COLORS = {
  "松风街区": "#b0d4bc", "风车街区": "#e2cbaa", "云顶街区": "#afcddd",
  "温泉街区": "#e5b7c2", "山麓街区": "#c3bfdc", "归林街区": "#d0d3a4",
};
const ALPINE_SPECIAL_TILES = {
  2: { type: "card_draw", label: "山间邮局", color: "#e9d5ff", description: "三选一存入背包，掷骰前可选用" },
  5: { type: "construction", label: "匠人山房", color: "#fef08a", description: "免费升级自己或拆除对手一层建筑。" },
  9: { type: "bank", label: "山城金库", color: "#bfdbfe", description: "存钱或提款！" },
  13: { type: "chance", label: "道具商店", color: "#fbcfe8", description: "花金币选购一张道具卡，存入背包择机使用" },
  20: { type: "card_draw", label: "旅人驿站", color: "#e9d5ff", description: "三选一存入背包，掷骰前可选用" },
  23: { type: "rush", label: "山间缆车", color: "#c5dbc9", rushMin: 2, rushMax: 4, description: "乘缆车随机前进 2–4 格，抵达后立即结算。" },
};
const ALPINE_LOT_CONFIGS = {
  1: { price: 95, buildCosts: [0, 42, 75, 115], tolls: [22, 62, 135, 225], themeIdx: 0 },
  3: { price: 115, buildCosts: [0, 48, 82, 128], tolls: [26, 72, 152, 250], themeIdx: 0 },
  4: { price: 155, buildCosts: [0, 60, 98, 150], tolls: [36, 96, 192, 320], themeIdx: 1 },
  6: { price: 135, buildCosts: [0, 52, 90, 138], tolls: [30, 82, 170, 280], themeIdx: 0 },
  7: { price: 260, buildCosts: [0, 85, 140, 200], tolls: [58, 145, 292, 480], themeIdx: 3, effectId: "finance_bonus", landmarkKey: "finance" },
  10: { price: 285, buildCosts: [0, 95, 150, 215], tolls: [62, 158, 316, 520], themeIdx: 2, effectId: "tower_bonus", landmarkKey: "skyscraper" },
  12: { price: 175, buildCosts: [0, 65, 105, 160], tolls: [40, 108, 215, 350], themeIdx: 1 },
  14: { price: 330, buildCosts: [0, 105, 165, 235], tolls: [72, 182, 360, 580], themeIdx: 2, effectId: "hot_spring_rest", landmarkKey: "onsen" },
  16: { price: 210, buildCosts: [0, 75, 120, 180], tolls: [46, 124, 245, 395], themeIdx: 2 },
  17: { price: 145, buildCosts: [0, 55, 92, 142], tolls: [32, 86, 178, 292], themeIdx: 0 },
  18: { price: 165, buildCosts: [0, 62, 102, 155], tolls: [38, 100, 205, 335], themeIdx: 3 },
  19: { price: 180, buildCosts: [0, 66, 110, 165], tolls: [42, 112, 224, 365], themeIdx: 1 },
  21: { price: 130, buildCosts: [0, 52, 88, 135], tolls: [28, 78, 164, 270], themeIdx: 0 },
  22: { price: 195, buildCosts: [0, 70, 115, 175], tolls: [44, 118, 235, 380], themeIdx: 2 },
};

function makeLoopNavigation(length) {
  const next = {};
  const prev = {};
  for (let i = 0; i < length; i++) {
    next[i] = (i + 1) % length;
    prev[i] = (i - 1 + length) % length;
  }
  return { next, prev, junctions: {} };
}

function makeHarborNavigation() {
  const next = {}, prev = {}, edges = [];
  const shared = [28,29,30,31,32,33,0,1,2,3,4,5,6,7,8,9,10,11];
  const branches = {
    merchant: [28,19,18,17,16,15,14,13,12,11],
    resort: [11,20,21,22,23,24,25,26,27,28],
  };
  const connect = (path, branch) => path.slice(1).forEach((to, i) => {
    const from = path[i];
    next[from] ??= to; prev[to] ??= from;
    edges.push({ from, to, branch });
  });
  connect(shared, "shared");
  Object.entries(branches).forEach(([id, path]) => connect(path, id));
  // A physical junction appears several times in the itinerary. A cursor, not
  // the tile number, determines which exit is next and makes reversal exact.
  const red = [...shared, ...branches.resort.slice(1), ...branches.merchant.slice(1)];
  const yellow = [...shared].reverse().concat(branches.merchant.slice(1), branches.resort.slice(1));
  const cycle = [...red.slice(0,-1), ...yellow.slice(0,-1)];
  const salaryStops = cycle.flatMap((tile,index) => tile === 0 ? [index] : []);
  const salaryGapMin = Math.min(...salaryStops.map((index,i) =>
    (salaryStops[(i+1)%salaryStops.length]-index+cycle.length)%cycle.length || cycle.length));
  return { next, prev, edges, shared, branches, fork: 11, merge: 28,
    cycle, phases: {red,yellow}, phaseLength:35, lapLength:35, cycleLength:70,salaryGapMin,
    junctions: {}, automatic:true };
}

const MAP_PRESETS = {
  classic: {
    id: "classic",
    maxRounds: 30,
    economy: { secondPlayerBonus: 500 },
    name: "经典环线",
    boardTitle: "环形线路 · 22 格",
    startDescription: "经典 22 格环形线路，节奏均衡。起始 ¥1600，后手额外补给 ¥500。",
    modeLabel: "环形地图休闲对战",
    grid: { columns: 7, rows: 6, cellMin: 90, cellMinTablet: 56, cellMinMobile: 44, height: "min(90vh, 1080px)", heightTablet: "min(85vh, 660px)", heightMobile: "min(80vh, 520px)", centerWidth: "min(340px, calc(100% - 160px))", centerWidthTablet: "min(280px, calc(100% - 60px))", centerWidthMobile: "min(240px, calc(100% - 40px))" },
    routePositions: CLASSIC_ROUTE_POSITIONS,
    tileNames: CLASSIC_TILE_NAMES,
    largeLotLinks: CLASSIC_LARGE_LOT_LINKS,
    districtConfig: CLASSIC_DISTRICT_CONFIG,
    districtColors: CLASSIC_DISTRICT_COLORS,
    specialTiles: CLASSIC_SPECIAL_TILES,
    lotConfigs: CLASSIC_LOT_CONFIGS,
    navigation: makeLoopNavigation(CLASSIC_ROUTE_POSITIONS.length),
  },
  compact: {
    id: "compact",
    maxRounds: 26,
    economy: { secondPlayerBonus: 500 },
    reliefShield: true,
    reliefRest: false,
    name: "紧凑冲突",
    boardTitle: "紧凑冲突 · 18 格",
    startDescription: "18 格短环线，冲刺与传送加快连锁收租。起始 ¥1600，后手额外补给 ¥500。",
    modeLabel: "高冲突短局",
    grid: { columns: 6, rows: 5, cellMin: 104, cellMinTablet: 64, cellMinMobile: 48, height: "min(82vh, 900px)", heightTablet: "min(76vh, 620px)", heightMobile: "min(72vh, 480px)", centerWidth: "min(300px, calc(100% - 120px))", centerWidthTablet: "min(260px, calc(100% - 56px))", centerWidthMobile: "min(220px, calc(100% - 32px))" },
    routePositions: COMPACT_ROUTE_POSITIONS,
    tileNames: COMPACT_TILE_NAMES,
    largeLotLinks: COMPACT_LARGE_LOT_LINKS,
    districtConfig: COMPACT_DISTRICT_CONFIG,
    districtColors: COMPACT_DISTRICT_COLORS,
    specialTiles: COMPACT_SPECIAL_TILES,
    lotConfigs: COMPACT_LOT_CONFIGS,
    navigation: makeLoopNavigation(COMPACT_ROUTE_POSITIONS.length),
  },
  expansion: {
    id: "expansion",
    maxRounds: 40,
    economy: { startCash: 2000, startBonus: 450, secondPlayerBonus: 300 },
    openingBuildings: true,
    reliefShield: true,
    name: "都市大环线",
    boardTitle: "都市大环线 · 28 格",
    startDescription: "28 格大环线，六街区各有一处 Lv.1 地产开业。起始 ¥2000，后手额外 ¥300，每圈补给 ¥450。",
    modeLabel: "六街区都市大环线",
    grid: { columns: 10, rows: 6, cellMin: 78, cellMinTablet: 50, cellMinMobile: 38, height: "min(84vh, 820px)", heightTablet: "min(76vh, 650px)", heightMobile: "min(68vh, 500px)", centerWidth: "min(420px, calc(100% - 160px))", centerWidthTablet: "min(330px, calc(100% - 80px))", centerWidthMobile: "min(250px, calc(100% - 45px))" },
    routePositions: EXPANSION_ROUTE_POSITIONS,
    tileNames: EXPANSION_TILE_NAMES,
    largeLotLinks: EXPANSION_LARGE_LOT_LINKS,
    districtConfig: EXPANSION_DISTRICT_CONFIG,
    districtColors: EXPANSION_DISTRICT_COLORS,
    specialTiles: EXPANSION_SPECIAL_TILES,
    lotConfigs: EXPANSION_LOT_CONFIGS,
    navigation: makeLoopNavigation(EXPANSION_ROUTE_POSITIONS.length),
  },
  harbor: {
    id: "harbor",
    maxRounds: 40,
    economy: { startCash: 1700, startBonus: 320, secondPlayerBonus: 400, bankThreshold: 240 },
    ticketPrice: 250, collectionId: "harbor_shell", collectionName: "潮汐海螺",
    name: "潮汐港湾",
    boardTitle: "三岛港湾 · 34 格",
    startDescription: "红黄航线自动轮换，每圈经过两岛。",
    modeLabel: "三岛双向航线",
    grid: { columns: 12, rows: 14, cellMin: 68, cellMinTablet: 44, cellMinMobile: 30, height: "min(96vh, 1160px)", heightTablet: "min(90vh, 880px)", heightMobile: "min(82vh, 660px)", centerWidth: "min(250px, calc(100% - 160px))", centerWidthTablet: "min(220px, calc(100% - 60px))", centerWidthMobile: "min(180px, calc(100% - 40px))" },
    routePositions: HARBOR_ROUTE_POSITIONS,
    tileNames: HARBOR_TILE_NAMES,
    largeLotLinks: HARBOR_LARGE_LOT_LINKS,
    districtConfig: HARBOR_DISTRICT_CONFIG,
    districtColors: HARBOR_DISTRICT_COLORS,
    specialTiles: HARBOR_SPECIAL_TILES,
    lotConfigs: HARBOR_LOT_CONFIGS,
    navigation: makeHarborNavigation(),
  },
  alpine: {
    id: "alpine",
    maxRounds: 30,
    economy: { startCash: 1900, startBonus: 350, secondPlayerBonus: 450, bankThreshold: 250 },
    ticketPrice: 350, collectionId: "alpine_crystal", collectionName: "山泉晶石",
    name: "云岭温泉",
    boardTitle: "云岭温泉 · 24 格",
    startDescription: "24 格山城环线，缆车前进 2–4 格，温泉与观景地标更丰厚。起始 ¥1900，每圈补给 ¥350。",
    modeLabel: "山城温泉环线",
    grid: { columns: 6, rows: 8, cellMin: 88, cellMinTablet: 56, cellMinMobile: 40, height: "min(96vh, 1140px)", heightTablet: "min(90vh, 860px)", heightMobile: "min(82vh, 650px)", centerWidth: "min(280px, calc(100% - 160px))", centerWidthTablet: "min(240px, calc(100% - 60px))", centerWidthMobile: "min(200px, calc(100% - 40px))" },
    routePositions: ALPINE_ROUTE_POSITIONS,
    tileNames: ALPINE_TILE_NAMES,
    largeLotLinks: ALPINE_LARGE_LOT_LINKS,
    districtConfig: ALPINE_DISTRICT_CONFIG,
    districtColors: ALPINE_DISTRICT_COLORS,
    specialTiles: ALPINE_SPECIAL_TILES,
    lotConfigs: ALPINE_LOT_CONFIGS,
    navigation: makeLoopNavigation(ALPINE_ROUTE_POSITIONS.length),
  },
};

let selectedMapId = DEFAULT_MAP_ID;

const CARD_POOL = [
  { id: "teleport", name: "传送术", icon: "🌀", description: "传送自己或对手到随机地产格，不结算落点" },
  { id: "boost", name: "双骰卡", icon: "🎲", description: "选择一方，下次同时掷两颗骰子" },
  { id: "slow", name: "减速陷阱", icon: "🐌", description: "选择一方，下次掷骰结果减半" },
  { id: "launch", name: "命定骰", icon: "🎯", description: "额外前进1~6步并结算地块，之后仍可掷骰" },
  { id: "rewind", name: "时光回溯", icon: "⏪", description: "选择一方后退3步，不结算落点" },
  { id: "swap", name: "换位魔法", icon: "🔄", description: "和对手交换位置，不结算落点" },
  { id: "freeze", name: "绊脚术", icon: "🪤", description: "对手下回合停步并结算地块；温泉休息期间不追加结算" },
  { id: "combo", name: "连击鼓", icon: "🥁", description: "获得额外一回合" },
  { id: "shield", name: "护盾术", icon: "🛡️", description: "免疫下一次过路费" },
  { id: "doubleRent", name: "收租翻倍", icon: "💎", description: "地产下次被踩收费×2" },
  { id: "propertySwap", name: "地产互换", icon: "🔀", description: "交出你的一块地产，随机获得对手一块" },
  { id: "reverse", name: "逆行术", icon: "🔃", description: "选择一方，反转其前进方向" },
];

const ITEM_SHOP_PRICES = Object.freeze({
  teleport: 100, boost: 120, slow: 100, launch: 200,
  rewind: 80, swap: 100, freeze: 160, combo: 240,
  shield: 140, doubleRent: 180, propertySwap: 220, reverse: 80,
});

const boardEl = document.getElementById("board");
const scoreboardEl = document.getElementById("scoreboard");
const logListEl = document.getElementById("log-list");
const turnTitleEl = document.getElementById("turn-title");
const turnDescriptionEl = document.getElementById("turn-description");
const roundChipEl = document.getElementById("round-chip");
const boardMapTitleEl = document.getElementById("board-map-title");
const diceBoxEl = document.getElementById("dice-box");
const rollBtn = document.getElementById("roll-btn");
const restartBtn = document.getElementById("restart-btn");
const soundToggleBtn = document.getElementById("sound-toggle-btn");
const musicToggleBtn = document.getElementById("music-toggle-btn");
const centerDiceEl = document.getElementById("center-dice");
const centerDiceValueEl = document.getElementById("center-dice-value");
const centerTitleEl = document.getElementById("center-title");
const centerDescriptionEl = document.getElementById("center-description");
const centerPlayerBadgeEl = document.getElementById("center-player-badge");
const centerPhaseBadgeEl = document.getElementById("center-phase-badge");
const centerConsoleEl = document.getElementById("center-console");
const eventOverlayEl = document.getElementById("event-overlay");
const eventLabelEl = document.getElementById("event-label");
const eventTitleEl = document.getElementById("event-title");
const eventMessageEl = document.getElementById("event-message");
const eventActionsEl = document.getElementById("event-actions");
const eventIconWrapEl = document.getElementById("event-icon-wrap");
const roundProgressBarEl = document.getElementById("round-progress-bar");
const tileTooltipEl = document.getElementById("tile-tooltip");

const EVENT_ICON_MAP = {
  "购买提示": { emoji: "🏠", cls: "event-buy" },
  "升级提示": { emoji: "🔧", cls: "event-build" },
  "过路费提示": { emoji: "💰", cls: "event-toll" },
  "功能地块": { emoji: "✨", cls: "event-special" },
  "市政府补给": { emoji: "🏛️", cls: "event-start" },
  "市政府征用": { emoji: "📜", cls: "event-start" },
  "AI 行动": { emoji: "🤖", cls: "event-info" },
  "翻牌事件": { emoji: "🎴", cls: "event-card" },
  "翻牌奖励": { emoji: "🎴", cls: "event-card" },
  "道具商店": { emoji: "🛍️", cls: "event-card" },
  "使用卡牌": { emoji: "🃏", cls: "event-card" },
  "传送门": { emoji: "🌀", cls: "event-special" },
  "城建局": { emoji: "🏗️", cls: "event-build" },
  "骰6再动": { emoji: "🎲", cls: "event-special" },
  "绊脚效果": { emoji: "🪤", cls: "event-info" },
  "卡牌效果": { emoji: "🃏", cls: "event-card" },
  "路线选择": { emoji: "🧭", cls: "event-special" },
  "冲刺站": { emoji: "🚀", cls: "event-special" },
  "商会收益": { emoji: "📈", cls: "event-special" },
  "酒店收益": { emoji: "🏨", cls: "event-special" },
  "温泉休息": { emoji: "♨️", cls: "event-info" },
  "温泉庄园": { emoji: "♨️", cls: "event-info" },
  "破产救助": { emoji: "🆘", cls: "event-toll" },
  "等待救援": { emoji: "🆘", cls: "event-info" },
  "破产淘汰": { emoji: "💸", cls: "event-toll" },
  "先手决定": { emoji: "🪙", cls: "event-special" },
};

const SOUND_PREF_KEY = "monopoly-sfx-enabled";
const MUSIC_PREF_KEY = "monopoly-bgm-enabled";
const HISTORY_KEY = "monopoly_history";
const SOUND_LIBRARY = {
  dice: { src: "assets/sfx/dice.wav", volume: 0.6, voices: 3 },
  step: { src: "assets/sfx/step.wav", volume: 0.22, voices: 4 },
  land: { src: "assets/sfx/land.wav", volume: 0.4, voices: 2 },
  buy: { src: "assets/sfx/buy.wav", volume: 0.5, voices: 2 },
  build: { src: "assets/sfx/build.wav", volume: 0.48, voices: 2 },
  toll: { src: "assets/sfx/toll.wav", volume: 0.5, voices: 2 },
  card: { src: "assets/sfx/card.wav", volume: 0.42, voices: 2 },
  special: { src: "assets/sfx/special.wav", volume: 0.44, voices: 2 },
  win: { src: "assets/sfx/win.wav", volume: 0.55, voices: 1 },
};
const BGM_CONFIG = {
  fallbackSrc: "assets/bgm/The_Plaza_Suite.mp3",
  volume: 0.42,
  bpm: 108,
  beatsPerBar: 4,
  loopBars: 8,
  scheduleAheadTime: 1.1,
  schedulerIntervalMs: 160,
};
const BGM_LIBRARY = {
  piano: "_tone_0000_JCLive_sf2_file",
  bell: "_tone_0100_JCLive_sf2_file",
  vibes: "_tone_0110_JCLive_sf2_file",
  bass: "_tone_0320_JCLive_sf2_file",
  strings: "_tone_0480_JCLive_sf2_file",
  kick: "_drum_36_6_JCLive_sf2_file",
  snare: "_drum_38_6_JCLive_sf2_file",
  hatClosed: "_drum_42_6_JCLive_sf2_file",
  hatOpen: "_drum_46_6_JCLive_sf2_file",
};
const NOTE_OFFSETS = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};
const BGM_PROGRESSION = [
  ["C4", "E4", "G4", "B4"],
  ["G3", "B3", "D4", "G4"],
  ["A3", "C4", "E4", "G4"],
  ["E3", "G3", "B3", "E4"],
  ["F3", "A3", "C4", "F4"],
  ["C4", "E4", "G4", "C5"],
  ["D3", "F3", "A3", "D4"],
  ["G3", "B3", "D4", "F4"],
];
const BGM_BASS = ["C2", "G1", "A1", "E1", "F1", "C2", "D1", "G1"];
const BGM_LEAD = [
  ["E5", "G5", "A5", "G5", "E5", "D5", "C5", "D5"],
  ["D5", "B4", "D5", "G5", "F5", "D5", "B4", "G4"],
  ["C5", "E5", "A5", "C6", "A5", "E5", "C5", "B4"],
  ["B4", "D5", "G5", "B5", "G5", "D5", "B4", "A4"],
  ["A4", "C5", "F5", "A5", "G5", "F5", "E5", "C5"],
  ["G4", "C5", "E5", "G5", "E5", "D5", "C5", "G4"],
  ["A4", "D5", "F5", "A5", "F5", "D5", "C5", "A4"],
  ["B4", "D5", "G5", "A5", "G5", "F5", "D5", "B4"],
];
const BGM_SPARKLE = [
  [null, "G5", null, "E5", null, "G5", null, "B5"],
  [null, "D5", null, "B4", null, "D5", null, "A5"],
  [null, "E5", null, "C5", null, "E5", null, "A5"],
  [null, "B4", null, "G4", null, "B4", null, "D5"],
  [null, "C5", null, "A4", null, "C5", null, "F5"],
  [null, "E5", null, "C5", null, "E5", null, "G5"],
  [null, "F5", null, "D5", null, "F5", null, "A5"],
  [null, "G5", null, "D5", null, "G5", null, "B5"],
];

let state = {};
let sessionCounter = 0;
let modalResolver = null;
let openingCoinJob = null;
let departureJob = null;
let homeConfirmationPending = false;
const soundState = { enabled: loadSoundPreference(), pools: {} };
const bgmState = {
  enabled: loadMusicPreference(),
  unlocked: false,
  usingSampleEngine: false,
  fallbackAudio: null,
  audioContext: null,
  player: null,
  gainNode: null,
  schedulerId: null,
  nextLoopTime: 0,
};

function loadBooleanPreference(key, defaultValue = true) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value !== "off";
  } catch {
    return defaultValue;
  }
}

function loadSoundPreference() {
  return loadBooleanPreference(SOUND_PREF_KEY);
}

function loadMusicPreference() {
  return loadBooleanPreference(MUSIC_PREF_KEY);
}

function ensureSoundPool(key) {
  if (soundState.pools[key]) return soundState.pools[key];
  const cfg = SOUND_LIBRARY[key];
  if (!cfg) return [];
  const pool = Array.from({ length: cfg.voices || 1 }, () => {
    const audio = new Audio(cfg.src);
    audio.preload = "auto";
    audio.volume = cfg.volume;
    return audio;
  });
  soundState.pools[key] = pool;
  return pool;
}

function warmSoundCache() {
  Object.keys(SOUND_LIBRARY).forEach((key) => { ensureSoundPool(key); });
}

function ensureFallbackBgmAudio() {
  if (bgmState.fallbackAudio) return bgmState.fallbackAudio;
  const audio = new Audio(BGM_CONFIG.fallbackSrc);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = BGM_CONFIG.volume;
  bgmState.fallbackAudio = audio;
  return audio;
}

function stopAllSounds() {
  Object.values(soundState.pools).flat().forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function playManagedAudio(audio) {
  const promise = audio.play();
  if (promise?.catch) promise.catch(() => {});
}

function updateSoundToggleButton() {
  if (!soundToggleBtn) return;
  soundToggleBtn.textContent = `音效：${soundState.enabled ? "开" : "关"}`;
  soundToggleBtn.setAttribute("aria-pressed", String(soundState.enabled));
}

function updateMusicToggleButton() {
  if (!musicToggleBtn) return;
  musicToggleBtn.textContent = `音乐：${bgmState.enabled ? "开" : "关"}`;
  musicToggleBtn.setAttribute("aria-pressed", String(bgmState.enabled));
}

function noteToMidi(note) {
  if (note === null) return null;
  const match = /^([A-G](?:#|b)?)(-?\d)$/.exec(note);
  if (!match) return null;
  const [, key, octaveText] = match;
  return (parseInt(octaveText, 10) + 1) * 12 + NOTE_OFFSETS[key];
}

function barTime(barIndex, beatOffset = 0) {
  return (barIndex * BGM_CONFIG.beatsPerBar + beatOffset) * (60 / BGM_CONFIG.bpm);
}

function canUseSampleBgm() {
  return typeof WebAudioFontPlayer === "function"
    && typeof window[BGM_LIBRARY.piano] !== "undefined"
    && typeof window[BGM_LIBRARY.bass] !== "undefined"
    && typeof window[BGM_LIBRARY.strings] !== "undefined"
    && typeof window[BGM_LIBRARY.kick] !== "undefined";
}

function ensureBgmEngine() {
  if (!canUseSampleBgm()) return null;
  if (bgmState.player && bgmState.audioContext && bgmState.gainNode) return bgmState;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  const audioContext = bgmState.audioContext || new AudioContextCtor();
  const player = bgmState.player || new WebAudioFontPlayer();
  const gainNode = bgmState.gainNode || audioContext.createGain();
  gainNode.gain.value = BGM_CONFIG.volume;
  gainNode.connect(audioContext.destination);
  Object.values(BGM_LIBRARY).forEach((name) => {
    player.loader.decodeAfterLoading(audioContext, name);
  });
  bgmState.audioContext = audioContext;
  bgmState.player = player;
  bgmState.gainNode = gainNode;
  bgmState.usingSampleEngine = true;
  return bgmState;
}

function queuePresetNote(presetName, when, pitch, duration, volume = 0.5) {
  const engine = ensureBgmEngine();
  if (!engine || pitch === null) return;
  engine.player.queueWaveTable(
    engine.audioContext,
    engine.gainNode,
    window[presetName],
    when,
    pitch,
    duration,
    volume,
  );
}

function scheduleBgmLoop(startTime) {
  const beat = 60 / BGM_CONFIG.bpm;
  for (let bar = 0; bar < BGM_CONFIG.loopBars; bar++) {
    const chord = BGM_PROGRESSION[bar];
    const lead = BGM_LEAD[bar];
    const sparkle = BGM_SPARKLE[bar];
    const bassRoot = noteToMidi(BGM_BASS[bar]);
    const barStart = startTime + barTime(bar);

    queuePresetNote(BGM_LIBRARY.strings, barStart, noteToMidi(chord[0]), beat * 3.8, 0.17);
    queuePresetNote(BGM_LIBRARY.strings, barStart, noteToMidi(chord[2]), beat * 3.6, 0.13);
    queuePresetNote(BGM_LIBRARY.strings, barStart, noteToMidi(chord[3]), beat * 3.6, 0.12);

    queuePresetNote(BGM_LIBRARY.piano, barStart, noteToMidi(chord[0]), beat * 1.55, 0.34);
    queuePresetNote(BGM_LIBRARY.piano, barStart, noteToMidi(chord[1]), beat * 1.45, 0.28);
    queuePresetNote(BGM_LIBRARY.piano, barStart + beat * 2, noteToMidi(chord[1]), beat * 1.4, 0.26);
    queuePresetNote(BGM_LIBRARY.piano, barStart + beat * 2, noteToMidi(chord[2]), beat * 1.4, 0.22);
    queuePresetNote(BGM_LIBRARY.piano, barStart + beat * 3.5, noteToMidi(chord[0]), beat * 0.3, 0.15);

    queuePresetNote(BGM_LIBRARY.bass, barStart, bassRoot, beat * 0.9, 0.42);
    queuePresetNote(BGM_LIBRARY.bass, barStart + beat, bassRoot, beat * 0.65, 0.28);
    queuePresetNote(BGM_LIBRARY.bass, barStart + beat * 2, bassRoot + 7, beat * 0.85, 0.35);
    queuePresetNote(BGM_LIBRARY.bass, barStart + beat * 3, bassRoot, beat * 0.8, 0.3);

    for (let step = 0; step < 8; step++) {
      const when = barStart + step * (beat * 0.5);
      queuePresetNote(BGM_LIBRARY.hatClosed, when, 42, 0.05, 0.11);
      if (step % 2 === 1) {
        queuePresetNote(BGM_LIBRARY.bell, when, noteToMidi(sparkle[step]), beat * 0.28, 0.12);
      }
    }

    queuePresetNote(BGM_LIBRARY.kick, barStart, 36, 0.18, 0.5);
    queuePresetNote(BGM_LIBRARY.snare, barStart + beat, 38, 0.16, 0.22);
    queuePresetNote(BGM_LIBRARY.kick, barStart + beat * 2, 36, 0.18, 0.44);
    queuePresetNote(BGM_LIBRARY.snare, barStart + beat * 3, 38, 0.16, 0.24);
    queuePresetNote(BGM_LIBRARY.hatOpen, barStart + beat * 3.5, 46, 0.12, 0.12);

    for (let step = 0; step < lead.length; step++) {
      queuePresetNote(
        BGM_LIBRARY.vibes,
        barStart + step * (beat * 0.5),
        noteToMidi(lead[step]),
        beat * (step % 2 === 0 ? 0.42 : 0.34),
        0.24,
      );
    }
  }
}

function setSoundEnabled(enabled) {
  soundState.enabled = enabled;
  window.GameDrama?.setMuted(!enabled);
  if (!enabled) stopAllSounds();
  try {
    localStorage.setItem(SOUND_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // 忽略本地存储不可用的情况。
  }
  updateSoundToggleButton();
}

function syncBgmPlayback() {
  if (bgmState.gainNode) bgmState.gainNode.gain.value = BGM_CONFIG.volume;
  if (!bgmState.enabled || !bgmState.unlocked || document.hidden) {
    stopBgmPlayback();
    return;
  }
  startBgmPlayback();
}

function unlockBgmPlayback() {
  if (bgmState.unlocked) return;
  bgmState.unlocked = true;
  const engine = ensureBgmEngine();
  if (engine?.audioContext?.state === "suspended") {
    engine.audioContext.resume().catch(() => {});
  }
  syncBgmPlayback();
}

function setMusicEnabled(enabled) {
  bgmState.enabled = enabled;
  try {
    localStorage.setItem(MUSIC_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // 忽略本地存储不可用的情况。
  }
  updateMusicToggleButton();
  syncBgmPlayback();
}

function startBgmPlayback() {
  const audio = ensureFallbackBgmAudio();
  audio.volume = BGM_CONFIG.volume;
  playManagedAudio(audio);
}

function stopBgmPlayback() {
  if (bgmState.schedulerId) {
    window.clearInterval(bgmState.schedulerId);
    bgmState.schedulerId = null;
  }
  if (bgmState.player && bgmState.audioContext) {
    bgmState.player.cancelQueue(bgmState.audioContext);
    bgmState.nextLoopTime = bgmState.audioContext.currentTime + 0.12;
  }
  if (bgmState.fallbackAudio) {
    bgmState.fallbackAudio.pause();
  }
}

function playSound(key, options = {}) {
  if (!soundState.enabled) return;
  const cfg = SOUND_LIBRARY[key];
  if (!cfg) return;
  const pool = ensureSoundPool(key);
  if (!pool.length) return;
  const audio = pool.find((item) => item.paused || item.ended) || pool[0];
  const volumeMultiplier = options.volumeMultiplier ?? 1;
  audio.pause();
  audio.currentTime = 0;
  audio.playbackRate = options.rate ?? 1;
  audio.volume = Math.max(0, Math.min(1, cfg.volume * volumeMultiplier));
  playManagedAudio(audio);
}

function defaultEffects() {
  return { speedBoost: false, speedSlow: false, shield: false, doubleRent: false, frozen: false, extraTurn: false, reversed: false, hotSpringRest: false, bankruptcyRelief: false };
}

function getMapConfig(mapId = state?.currentMapId ?? selectedMapId) {
  return MAP_PRESETS[mapId] || MAP_PRESETS[DEFAULT_MAP_ID];
}

function getMaxRounds(mapId = state?.currentMapId ?? selectedMapId) {
  return getMapConfig(mapId).maxRounds || CONFIG.maxRounds;
}

function getMapEconomy(mapId = state?.currentMapId ?? selectedMapId) {
  return { startCash: CONFIG.startCash, startBonus: CONFIG.startBonus, bankThreshold: 200,
    secondPlayerBonus: 0, ...getMapConfig(mapId).economy };
}

function getBoardLength() {
  return state.board?.length || getMapConfig().routePositions.length;
}

function getDistrictColors() {
  return getMapConfig().districtColors || {};
}

function applyMapLayout(mapCfg = getMapConfig()) {
  if (!boardEl) return;
  boardEl.style.setProperty("--board-cols", String(mapCfg.grid.columns));
  boardEl.style.setProperty("--board-rows", String(mapCfg.grid.rows));
  boardEl.style.setProperty("--board-cell-min", `${mapCfg.grid.cellMin}px`);
  boardEl.style.setProperty("--board-cell-min-tablet", `${mapCfg.grid.cellMinTablet}px`);
  boardEl.style.setProperty("--board-cell-min-mobile", `${mapCfg.grid.cellMinMobile}px`);
  boardEl.style.setProperty("--board-height", mapCfg.grid.height);
  boardEl.style.setProperty("--board-height-tablet", mapCfg.grid.heightTablet);
  boardEl.style.setProperty("--board-height-mobile", mapCfg.grid.heightMobile);
  centerConsoleEl?.style.setProperty("--board-center-width", mapCfg.grid.centerWidth);
  centerConsoleEl?.style.setProperty("--board-center-width-tablet", mapCfg.grid.centerWidthTablet);
  centerConsoleEl?.style.setProperty("--board-center-width-mobile", mapCfg.grid.centerWidthMobile);
  centerConsoleEl?.style.setProperty("--board-center-top", mapCfg.grid.centerTop || "50%");
  centerConsoleEl?.style.setProperty("--board-center-left", mapCfg.grid.centerLeft || "50%");
  if (boardMapTitleEl) boardMapTitleEl.textContent = mapCfg.boardTitle;
}

function renderStartMapOptions() {
  if (!startMapOptionsEl) return;
  const mapCfg = getMapConfig(selectedMapId);
  startMapOptionsEl.querySelectorAll("[data-map-id]").forEach((btn) => {
    const active = btn.dataset.mapId === selectedMapId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (startMapDescriptionEl) startMapDescriptionEl.textContent = "";
  if (startPlayBtn) {
    startPlayBtn.textContent = `出发 · ¥${getMapTicket(mapCfg)}`;
    startPlayBtn.disabled = Boolean(departureJob);
  }
}

function getMapTicket(map = getMapConfig()) {
  return map.ticketPrice ?? (map.id === "expansion" ? 200 : 100);
}

function setSelectedMap(mapId) {
  if (departureJob) return;
  selectedMapId = MAP_PRESETS[mapId] ? mapId : DEFAULT_MAP_ID;
  setEntryError();
  renderStartMapOptions();
}

function initializeGame(mapId = selectedMapId, paidRunId = null) {
  cancelOpeningCoinToss();
  window.GameDrama?.reset();
  window.GameProgression?.resetResult();
  window.GamePresentation?.onReset();
  if (modalResolver) { modalResolver("cancel"); modalResolver = null; }
  const mapCfg = getMapConfig(mapId);
  const economy = getMapEconomy(mapCfg.id);
  selectedMapId = mapCfg.id;
  state = {
    sessionId: ++sessionCounter,
    runId: paidRunId || window.GameProgression?.createRunId(),
    isFormalRun: false,
    round: 1,
    currentPlayerIndex: 0,
    firstPlayerIndex: 0,
    initiativeResolved: false,
    openingCompensation: null,
    phase: "await_roll",
    currentMapId: mapCfg.id,
    board: createBoard(mapCfg),
    openingLots: [],
    harborCollection: { milestones: [], cards: [] },
    harborProjects: Object.fromEntries(HARBOR_PROJECT_DEFS.map(project => [project.id, { stage: 0 }])),
    harborRouteChoice: null, harborMovement: null, harborRouteSequence: 0,
    players: PLAYER_DEFS.map((p) => ({
      ...p,
      cash: economy.startCash,
      displayedCash: economy.startCash,
      cashDelta: 0, cashDeltaVisible: false, cashPulse: false,
      cashAnimFrame: null, cashChangeToken: 0, pendingCashDelta: 0,
      position: 0,
      nextJunctionChoice: null,
      harborCursor: 6, harborAnchor: 0, harborSalaryMin: 6, harborSalaryMax: 6,
      harborSalaryDistance: 0,
      effects: defaultEffects(),
      cards: [], cardUsedThisTurn: false,
    })),
    lastDice: null, lastDiceFaces: [], diceActionId: 0, diceDisplay: null, logs: [], gameOver: false, busy: false,
    cardSequence: 0, cardUsePending: false,
    passedStartThisTurn: false, bankPool: 0,
    gameMode: "rounds",
    statusTitle: "", statusDescription: "",
    animation: { currentTile: null, landedTile: null, diceRolling: false, diceResult: false, boardBurst: false },
    modal: defaultModal(),
  };
  setTargetHighlight(false);
  state.openingLots = prepareOpeningLots(state.board, mapCfg);
  pushLog(`游戏开始，双方初始资金均为 ${formatMoney(economy.startCash)}。`);
  if (state.openingLots.length) {
    const names = state.openingLots.map((index) => state.board[index].name).join("、");
    pushLog(`新城开业：${names} 已建成 Lv.1，均为无主地产，仍按原地价购买。`);
  }
  setHumanTurnStatus();
  updateSoundToggleButton();
  updateMusicToggleButton();
  applyMapLayout(mapCfg);
  updateModeEyebrow();
  renderStartMapOptions();
  render();
}

function defaultModal() {
  return { visible: false, label: "行动提示", title: "", message: "", buttons: [], cardDraw: false };
}

// ─── 开始界面控制 ─────────────────────────────────────────
const startScreenEl = document.getElementById("start-screen");
const historyOverlayEl = document.getElementById("history-overlay");
const historyListEl = document.getElementById("history-list");
const startPlayBtn = document.getElementById("start-play-btn");
const startHistoryBtn = document.getElementById("start-history-btn");
const historyCloseBtn = document.getElementById("history-close-btn");
const modeEyebrowEl = document.getElementById("mode-eyebrow");
const startMapOptionsEl = document.getElementById("start-map-options");
const startMapDescriptionEl = document.getElementById("start-map-description");
window.addEventListener("city-progress-change", renderStartMapOptions);

function showStartScreen() {
  renderStartMapOptions();
  startScreenEl?.classList.remove("hidden");
}
function hideStartScreen() {
  startScreenEl?.classList.add("hidden");
}
function setEntryError(result) {
  const node = document.getElementById("start-entry-error");
  if (!node) return;
  const errors = { unavailable: "存档暂不可用", corrupt: "存档读取失败", save_failed: "保存失败，请重试", migration_failed: "存档升级失败，请重试" };
  node.textContent = !result ? "" : result.canEnter === false || result.error === "entry_funds"
    ? `金币不足，还差 ¥${result.shortfall || 0}` : errors[result.error] || "出发失败，请重试";
  node.hidden = !node.textContent;
}
function openDepartureMenu(mapId = selectedMapId) {
  if (departureJob) return;
  hideModal();
  window.GameDrama?.reset();
  window.GamePresentation?.onReset();
  setSelectedMap(mapId);
  showStartScreen();
  render();
}
function showHistoryOverlay() {
  renderHistoryList();
  historyOverlayEl?.classList.remove("hidden");
}
function hideHistoryOverlay() {
  historyOverlayEl?.classList.add("hidden");
}

startPlayBtn?.addEventListener("click", () => void startNewGame());
startHistoryBtn?.addEventListener("click", showHistoryOverlay);
historyCloseBtn?.addEventListener("click", hideHistoryOverlay);
startMapOptionsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-map-id]");
  if (!btn) return;
  setSelectedMap(btn.dataset.mapId);
});
historyOverlayEl?.addEventListener("click", (e) => {
  if (e.target === historyOverlayEl) hideHistoryOverlay();
});

// ─── 历史对局记录 ──────────────────────────────────────────
function loadHistory() {
  try { const records = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(records) ? records.filter(r => r && typeof r === "object") : []; }
  catch { return []; }
}
function saveGameResult(reason, winnerId) {
  const mapCfg = getMapConfig(state.currentMapId);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const record = {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    mapId: mapCfg.id,
    mapName: mapCfg.name,
    mode: state.gameMode,
    roundLimit: getMaxRounds(),
    rounds: reason === "rounds" ? state.round - 1 : state.round,
    winner: winnerId,
    players: state.players.map((p) => ({ id: p.id, name: p.name, cash: p.cash })),
  };
  const history = loadHistory();
  history.unshift(record);
  if (history.length > 50) history.splice(50);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
}
function renderHistoryList() {
  if (!historyListEl) return;
  const history = loadHistory();
  if (history.length === 0) {
    historyListEl.innerHTML = `<div class="history-empty">暂无历史对局记录</div>`;
    return;
  }
  historyListEl.innerHTML = history.map((rec) => {
    // Records created before map-specific limits all used the original 30 rounds.
    const roundLimit = Number.isInteger(rec.roundLimit) && rec.roundLimit > 0 ? rec.roundLimit : CONFIG.maxRounds;
    const modeLabel = rec.mode === "bankruptcy" ? "破产淘汰制" : `${roundLimit} 回合制（${rec.rounds} 回合）`;
    const mapLabel = rec.mapName || MAP_PRESETS[rec.mapId]?.name || MAP_PRESETS[DEFAULT_MAP_ID].name;
    const winnerName = rec.winner === "draw"
      ? "平局"
      : (rec.players?.find((p) => p.id === rec.winner)?.name ?? rec.winner);
    const isHumanWin = rec.winner === "human";
    const isDraw = rec.winner === "draw";
    const resultCls = isDraw ? "draw" : (isHumanWin ? "win" : "lose");
    const resultText = isDraw ? "⚖️ 平局" : (isHumanWin ? `🏆 ${winnerName} 胜` : `💔 ${winnerName} 胜`);
    const cashRow = rec.players
      ? rec.players.map((p) => `${p.name} ¥${p.cash}`).join("　vs　")
      : "";
    return `<div class="history-record">
      <div class="history-record-date">${rec.date}<br>${rec.time}</div>
      <div class="history-record-result ${resultCls}">${resultText}</div>
      <div class="history-record-cash">${cashRow}</div>
      <div class="history-record-mode">${mapLabel} · ${modeLabel}</div>
    </div>`;
  }).join("");
}

function settleFirstPlayer(humanFirst, sid = state.sessionId) {
  if (!isSessionActive(sid) || state.initiativeResolved) return false;
  state.firstPlayerIndex = humanFirst ? 0 : 1;
  state.currentPlayerIndex = state.firstPlayerIndex;
  state.initiativeResolved = true;
  const second = state.players[1 - state.firstPlayerIndex];
  const amount = getMapEconomy().secondPlayerBonus;
  const cardId = state.currentMapId === "harbor" ? "boost" : null;
  state.openingCompensation = { playerId: second.id, amount, ...(cardId ? { cardId } : {}) };
  if (amount > 0) {
    updatePlayerCash(second, amount, false);
    pushLog(`${second.name} 后手行动，领取 ${formatMoney(amount)} 开局补给。`);
  }
  if (cardId) {
    grantInventoryCard(second.id, cardId, { type: "opening_compensation" });
    pushLog(`${second.name} 后手补给：双骰卡 ×1。`);
  }
  return true;
}

async function coinFlipForFirstPlayer(sid) {
  const action = await showModal({
    label: "先手决定",
    title: "掷硬币决定先手",
    message: "",
    openingCoin: { phase: "ready", humanFirst: true },
    buttons: [{ id: "flip", label: "抛出硬币", variant: "primary" }],
  });
  if (!isSessionActive(sid) || action !== "flip") return undefined;
  const humanFirst = Math.random() < 0.5;
  if (!await playOpeningCoinToss(humanFirst, sid) || !isSessionActive(sid)) return undefined;
  pushLog(`先手决定：硬币 ${humanFirst ? "正面" : "反面"}，${humanFirst ? "玩家" : "AI 对手"}先手！`);
  settleFirstPlayer(humanFirst, sid);
  const compensation = state.openingCompensation;
  const second = getPlayerById(compensation.playerId);
  const supplies = [compensation.amount > 0 ? formatMoney(compensation.amount) : "", compensation.cardId ? "双骰卡 ×1" : ""].filter(Boolean);
  const supplyMessage = supplies.length ? `${second.isAi ? "对手" : "你"}获后手补偿 ${supplies.join(" · ")}` : "";
  const confirmed = await showContinueModal({
    label: "先手决定",
    title: humanFirst ? "你先手" : "对手先手",
    message: supplyMessage,
    openingCoin: { phase: "settled", humanFirst },
  });
  if (!isSessionActive(sid) || confirmed === "cancel") return undefined;
  return humanFirst;
}

function cancelOpeningCoinToss() {
  const job = openingCoinJob;
  if (!job) return;
  openingCoinJob = null;
  clearTimeout(job.timer);
  job.resolve(false);
}

function playOpeningCoinToss(humanFirst, sid) {
  cancelOpeningCoinToss();
  if (!isSessionActive(sid)) return Promise.resolve(false);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  state.modal = { ...defaultModal(), visible: true, label: "先手决定", title: "硬币翻转中", message: "",
    openingCoin: { phase: "tossing", humanFirst, reduced: Boolean(reduced) }, buttons: [] };
  state.phase = "presenting";
  state.busy = true;
  return new Promise(resolve => {
    const job = { sid, resolve, timer: null };
    openingCoinJob = job;
    render();
    job.timer = setTimeout(() => {
      if (openingCoinJob !== job) return;
      openingCoinJob = null;
      resolve(isSessionActive(sid));
    }, reduced ? 120 : 1760);
  });
}

function openingCoinMarkup(coin) {
  const playerMark = '<path d="m20 47 30-22 30 22v28H58V56H42v19H20Z"/><path d="M34 29v-9h11v1"/>';
  const rivalMark = '<path d="M20 75V40h21V25h19v15h20v35ZM31 51v5m0 8v3m19-30v6m0 10v6m19-8v5m0 8v3"/>';
  const face = (side, label, mark) => `<div class="opening-coin-face opening-coin-${side}"><span class="opening-coin-rim"></span><svg viewBox="0 0 100 100" aria-hidden="true">${mark}</svg><span class="opening-coin-face-label">${label}</span></div>`;
  const edge = Array.from({ length: 24 }, (_, i) => `<i style="--edge-turn:${i * 15}deg"></i>`).join("");
  return `<div class="opening-coin-stage ${coin.phase}${coin.reduced ? " reduced" : ""}" data-coin-side="${coin.humanFirst ? "human" : "ai"}" aria-hidden="true"><div class="opening-coin-halo"></div><div class="opening-coin-shadow"></div><div class="opening-coin-lift"><div class="opening-coin-spin">${face("front", "玩家", playerMark)}${face("back", "对手", rivalMark)}<div class="opening-coin-edge">${edge}</div></div></div><span class="opening-coin-spark spark-a">✦</span><span class="opening-coin-spark spark-b">✦</span></div>`;
}

async function startNewGame() {
  if (departureJob) return;
  // Every paid path must first show the chosen map and ticket price.
  if (startScreenEl?.classList.contains("hidden")) { openDepartureMenu(); return; }
  const job = departureJob = {}, map = getMapConfig(selectedMapId), price = getMapTicket(map);
  setEntryError(); renderStartMapOptions();
  try {
    const progression = window.GameProgression;
    if (!progression?.enter || !progression?.createRunId) { setEntryError({ error: "unavailable" }); return; }
    const info = progression.getEntryInfo({ mapId: map.id, price });
    if (!info.ok || !info.canEnter) { setEntryError(info); return; }
    const runId = progression.createRunId();
    // The debit is synchronous and durable before any board/session is replaced.
    const entry = progression.enter({ runId, mapId: map.id, mapName: map.name, price, collectionId: map.collectionId || "city_stamp" });
    if (!entry.ok) { setEntryError(entry); return; }
    initializeGame(map.id, runId);
    state.ticketPaid = true;
    hideStartScreen();
    const sid = state.sessionId;
    const humanFirst = await coinFlipForFirstPlayer(sid);
    if (!isSessionActive(sid)) return;
    if (humanFirst === undefined) { showStartScreen(); render(); return; }
    state.isFormalRun = true;
    if (!humanFirst) {
      state.currentPlayerIndex = 1; setAiTurnStatus(); render();
      void startAiTurnWithDelay(sid);
    } else { setHumanTurnStatus(); render(); }
  } finally {
    if (departureJob === job) departureJob = null;
    renderStartMapOptions();
  }
}

function updateModeEyebrow() {
  if (!modeEyebrowEl) return;
  const mapCfg = getMapConfig(state.currentMapId);
  modeEyebrowEl.textContent = state.gameMode === "bankruptcy"
    ? `破产淘汰制 · ${mapCfg.modeLabel}`
    : `${getMaxRounds()} 回合制 · ${mapCfg.modeLabel}`;
}

function createBoard(mapCfg = getMapConfig()) {
  const largePrimarySet = new Set(Object.values(mapCfg.largeLotLinks));
  const board = mapCfg.routePositions.map((pos, index) => {
    const tile = {
      index, name: mapCfg.tileNames[index], x: pos.x, y: pos.y,
      isStart: index === 0,
      isSpecial: !!mapCfg.specialTiles[index],
      special: mapCfg.specialTiles[index] || null,
      lot: null,
      isLargeSecondary: !!mapCfg.largeLotLinks[index],
      largePrimaryIndex: mapCfg.largeLotLinks[index] ?? null,
    };
    if (tile.isStart || tile.isSpecial || tile.isLargeSecondary) return tile;
    const cfg = mapCfg.lotConfigs[index];
    if (!cfg) return tile;
    const isLarge = largePrimarySet.has(index);
    tile.lot = {
      ownerId: null, level: 0,
      price: cfg.price, buildCosts: cfg.buildCosts, tolls: cfg.tolls,
      theme: LOT_THEMES[cfg.themeIdx],
      district: mapCfg.districtConfig[index],
      effectId: cfg.effectId || null,
      ...(cfg.landmarkKey ? { landmarkKey: cfg.landmarkKey } : {}),
      isLarge,
    };
    return tile;
  });

  board.forEach((tile) => {
    if (tile.isLargeSecondary && tile.largePrimaryIndex !== null) {
      tile.lot = board[tile.largePrimaryIndex].lot;
    }
  });
  return board;
}

function prepareOpeningLots(board, mapCfg) {
  if (!mapCfg.openingBuildings) return [];
  const districts = new Map();
  board.forEach((tile) => {
    if (!tile.lot || tile.isLargeSecondary || !tile.lot.district) return;
    if (!districts.has(tile.lot.district)) districts.set(tile.lot.district, []);
    districts.get(tile.lot.district).push(tile);
  });
  return [...districts.values()].map((lots) => {
    const selected = lots[Math.floor(Math.random() * lots.length)];
    selected.lot.level = 1;
    return selected.index;
  });
}

function getMapNavigation() {
  return getMapConfig(state.currentMapId).navigation || makeLoopNavigation(getBoardLength());
}

function getJunctionConfig(index) {
  return getMapNavigation().junctions?.[index] || null;
}

const HARBOR_FAMILIES = ["villa", "shop", "hotel", "tower", "finance", "skyscraper", "onsen"];
const HARBOR_FAMILY_NAMES = { villa: "海湾公馆", shop: "港湾商铺", hotel: "海岸酒店", tower: "航海事务所", finance: "海港商会", skyscraper: "港湾观景楼", onsen: "海崖温泉" };
const HARBOR_PROJECT_DEFS = [
  { id: "water", name: "海崖水庭", indices: [6, 7, 9] },
  { id: "promenade", name: "归航花园", indices: [29, 30, 32] },
];
const HARBOR_PROJECT_REWARDS = [
  { stage: 1, threshold: 3, label: "金币 +100" },
  { stage: 2, threshold: 6, label: "双骰卡 ×1" },
  { stage: 3, threshold: 9, label: "潮汐海螺 ×1" },
];

// Reading scene/UI state never grants a reward. Only a completed property
// mutation can advance a project, and earned stages survive ownership loss.
function getHarborProjectSnapshot() {
  if (state.currentMapId !== "harbor" || !state.board || !state.harborProjects) return [];
  return HARBOR_PROJECT_DEFS.map(project => {
    const lots = project.indices.map(index => {
      const tile = state.board[index], owned = tile?.lot?.ownerId === "human";
      const level = Math.max(0, Math.min(3, tile?.lot?.level || 0));
      return { index, name: tile?.name || "", owned, level, contribution: owned ? level : 0 };
    });
    const points = lots.reduce((sum, lot) => sum + lot.contribution, 0);
    const stage = state.harborProjects[project.id]?.stage || 0;
    return { id: project.id, name: project.name, indices: [...project.indices], lots,
      points, maxPoints: 9, stage, nextTarget: stage < 3 ? (stage + 1) * 3 : null,
      rewards: HARBOR_PROJECT_REWARDS.map(reward => ({ ...reward, earned: reward.stage <= stage })),
      collectionBonus: Number(stage === 3) };
  });
}

function syncHarborProjects() {
  if (state.gameOver || state.phase === "preview" || document.body.classList.contains("mode-showcase")) return;
  const human = state.players?.find(player => player.id === "human");
  if (!human) return;
  for (const project of getHarborProjectSnapshot()) {
    const progress = state.harborProjects[project.id], targetStage = Math.floor(project.points / 3);
    while (progress.stage < targetStage) {
      const stage = ++progress.stage;
      if (stage === 1) updatePlayerCash(human, 100, false);
      if (stage === 2) grantInventoryCard("human", "boost", { type: "harbor_project", reference: project.id });
      pushLog(`${project.name} Lv.${stage} · ${HARBOR_PROJECT_REWARDS[stage - 1].label}${stage === 3 ? "（结算带回）" : ""}`);
    }
  }
}

window.GameHarborProjects = Object.freeze({ getSnapshot: getHarborProjectSnapshot });

function harborBuildingMilestone(player, tile) {
  syncHarborProjects();
  if (state.currentMapId !== "harbor" || player.id !== "human" || tile.lot?.ownerId !== "human") return;
  const family = tile.lot.landmarkKey || tile.lot.theme.key;
  if (!HARBOR_FAMILIES.includes(family) || tile.lot.level < 2) return;
  const collection = state.harborCollection;
  const key = `${family}:${tile.lot.level}`;
  if (collection.milestones.includes(key)) return;
  collection.milestones.push(key);
  if (collection.cards.length >= 4) return;
  collection.cards.push({ cardId: `harbor_${family}`, count: 1, level: tile.lot.level, tileIndex: tile.index });
  pushLog(`建筑卡已收集：${HARBOR_FAMILY_NAMES[family]} ×1。完成本局后带回城镇（建设奖励 ${collection.cards.length}/4）。`);
}

function getHarborBuildingRewards() {
  if (state.currentMapId !== "harbor") return [];
  const counts = new Map();
  state.harborCollection.cards.forEach(card => counts.set(card.cardId, (counts.get(card.cardId) || 0) + 1));
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([cardId, count]) => ({ cardId, count }));
}

function harborCycleOffset(cursor) {
  const length = getMapNavigation().cycle.length;
  return ((cursor % length) + length) % length;
}

function resetHarborJourney(player, position = player.position) {
  if (state.currentMapId !== "harbor") return;
  const nav = getMapNavigation(), old = Number.isInteger(player.harborCursor) ? player.harborCursor : 6;
  const direction = player.effects?.reversed ? -1 : 1;
  // Relocation keeps the current phase when possible. It never fabricates
  // traversed steps, a salary, or a route-choice state.
  const phase = Math.floor(harborCycleOffset(old) / nav.phaseLength);
  const base = old - harborCycleOffset(old);
  const candidates = nav.cycle.flatMap((tile,index) => tile === position ? [-1,0,1].map(lap => base + index + lap * nav.cycle.length) : []);
  candidates.sort((a,b) => {
    const rank = cursor => (Math.floor(harborCycleOffset(cursor)/nav.phaseLength) === phase ? 0 : 1000) + Math.abs(cursor-old) + (Math.sign(cursor-old) === direction ? 0 : .1);
    return rank(a)-rank(b);
  });
  player.harborCursor = candidates[0] ?? 6;
  player.harborAnchor = position;
  player.harborSalaryMin = Math.min(player.harborSalaryMin ?? old, player.harborCursor);
  player.harborSalaryMax = Math.max(player.harborSalaryMax ?? old, player.harborCursor);
  player.harborSalaryDistance = 0;
  player.harborFreshSalary = false;
}

function getNextHarborTile(player, currentIndex, dir, mutate) {
  if (!mutate) return getNextHarborTile({...player}, currentIndex, dir, true);
  const nav = getMapNavigation();
  if (player.harborAnchor !== currentIndex || nav.cycle[harborCycleOffset(player.harborCursor)] !== currentIndex) resetHarborJourney(player,currentIndex);
  const cursor = player.harborCursor + (dir < 0 ? -1 : 1);
  const next = nav.cycle[harborCycleOffset(cursor)];
  player.harborSalaryDistance = (player.harborSalaryDistance || 0) + (dir < 0 ? -1 : 1);
  player.harborFreshSalary = next === 0 && Math.abs(player.harborSalaryDistance) >= nav.salaryGapMin &&
    (cursor < player.harborSalaryMin || cursor > player.harborSalaryMax);
  player.harborSalaryMin = Math.min(player.harborSalaryMin,cursor);
  player.harborSalaryMax = Math.max(player.harborSalaryMax,cursor);
  player.harborCursor = cursor;
  player.harborAnchor = next;
  return next;
}

async function ensureHarborDeparture(player, sid) {
  return isSessionActive(sid) && !state.gameOver && getPlayerById(player.id) === player;
}

function getHarborJourney(player) {
  if (state.currentMapId !== "harbor" || !player) return null;
  const copy = {...player}, nav = getMapNavigation();
  if (copy.harborAnchor !== copy.position || nav.cycle[harborCycleOffset(copy.harborCursor)] !== copy.position) resetHarborJourney(copy);
  const travelDirection = copy.effects?.reversed ? -1 : 1;
  // At an exact phase boundary, reverse movement uses the preceding phase.
  const outgoingCursor = copy.harborCursor + (travelDirection < 0 ? -1 : 0);
  const cycleOffset = harborCycleOffset(copy.harborCursor);
  const phase = harborCycleOffset(outgoingCursor) < nav.phaseLength ? "red" : "yellow";
  return {phase,phaseNumber:Math.floor(outgoingCursor/nav.phaseLength)+1,
    cycleOffset,cycleLength:nav.cycle.length,phaseProgress:harborCycleOffset(outgoingCursor)%nav.phaseLength,
    travelDirection,centralDirection:(phase === "red" ? 1 : -1)*travelDirection,
    nextTileIndex:getNextHarborTile(copy,copy.position,travelDirection,false)};
}

window.GameHarbor = {
  getState() {
    const human = state.players?.find(p=>p.id === "human"), active = state.currentMapId === "harbor";
    const nav = active ? getMapNavigation() : MAP_PRESETS.harbor.navigation;
    const journey = active ? getHarborJourney(human) : null;
    return {active,totalTiles:34,lapTiles:35,cycleTiles:70,route:journey?.phase || "red",journey,canChangeRoute:false,
      pendingChoice:null,choices:[],
      rewards:active ? getHarborBuildingRewards() : [],earnedCount:state.harborCollection?.cards.length || 0,
      families:HARBOR_FAMILIES.map(family=>({family,cardId:"harbor_"+family,label:HARBOR_FAMILY_NAMES[family]})),
      navigation:nav};
  },
  setRoute() { return {ok:false}; },
  getRewards:getHarborBuildingRewards,
};

function getNextTileIndex(player, currentIndex, dir = (player.effects?.reversed ? -1 : 1), consumeChoice = true) {
  if (state.currentMapId === "harbor") return getNextHarborTile(player, currentIndex, dir, consumeChoice);
  const nav = getMapNavigation();
  if (dir < 0) return nav.prev[currentIndex] ?? ((currentIndex - 1 + getBoardLength()) % getBoardLength());
  const junction = getJunctionConfig(currentIndex);
  if (junction) {
    const selected = junction.options.find((opt) => opt.id === player.nextJunctionChoice);
    if (selected) {
      if (consumeChoice) player.nextJunctionChoice = null;
      return selected.next;
    }
    return junction.defaultNext ?? nav.next[currentIndex] ?? ((currentIndex + 1) % getBoardLength());
  }
  return nav.next[currentIndex] ?? ((currentIndex + 1) % getBoardLength());
}

function previewMovement(player, steps, options = {}) {
  const dir = options.direction ?? (player.effects.reversed ? -1 : 1);
  const temp = {
    ...player,
    effects: { ...player.effects, reversed: dir < 0 },
    nextJunctionChoice: options.branchChoice ?? player.nextJunctionChoice ?? null,
  };
  let idx = options.startingIndex ?? player.position;
  const path = [];
  let uncertain = false;
  for (let i = 0; i < steps; i++) {
    idx = getNextTileIndex(temp, idx, dir, true);
    path.push(idx);
  }
  return { path, index: idx, branchChoice: temp.nextJunctionChoice, uncertain };
}

function currentPlayer() { return state.players[state.currentPlayerIndex]; }
function getPlayerById(id) { return state.players.find((p) => p.id === id); }
function getOpponent(player) { return state.players.find((p) => p.id !== player.id); }
function formatMoney(n) { return `¥${n}`; }
function rollDice() { return Math.floor(Math.random() * 6) + 1; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isSessionActive(sid) { return state.sessionId === sid; }

function pushLog(msg) {
  state.logs.push(`第 ${state.gameMode === "bankruptcy" ? state.round : Math.min(state.round, getMaxRounds())} 回合 · ${msg}`);
  if (state.logs.length > 24) state.logs.shift();
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function updatePlayerCash(player, delta, animateNow = true) {
  if (!delta) return;
  player.cash += delta;
  if (!animateNow) { player.pendingCashDelta += delta; return; }
  const merged = delta + player.pendingCashDelta;
  player.pendingCashDelta = 0;
  startCashAnimation(player, player.displayedCash ?? (player.cash - merged), player.cash, merged);
}

function startCashAnimation(player, prev, next, delta) {
  player.cashDelta = delta;
  player.cashDeltaVisible = true;
  player.cashPulse = true;
  player.cashChangeToken += 1;
  const token = player.cashChangeToken;
  const sid = state.sessionId;
  if (player.cashAnimFrame) cancelAnimationFrame(player.cashAnimFrame);
  const start = performance.now();
  const dur = 760;
  const step = (now) => {
    if (state.sessionId !== sid || player.cashChangeToken !== token) return;
    const t = Math.min((now - start) / dur, 1);
    player.displayedCash = Math.round(prev + (next - prev) * t);
    window.GamePresentation ? window.GamePresentation.updateCash() : render();
    if (t < 1) player.cashAnimFrame = requestAnimationFrame(step);
    else { player.displayedCash = next; player.cashAnimFrame = null; window.GamePresentation ? window.GamePresentation.updateCash() : render(); }
  };
  player.cashAnimFrame = requestAnimationFrame(step);
  setTimeout(() => {
    if (state.sessionId !== sid || player.cashChangeToken !== token) return;
    player.cashDeltaVisible = false; player.cashPulse = false; window.GamePresentation ? window.GamePresentation.updateCash() : render();
  }, 1300);
}

function flushQueuedCashAnimations() {
  state.players.forEach((p) => {
    if (!p.pendingCashDelta) return;
    const d = p.pendingCashDelta; p.pendingCashDelta = 0;
    startCashAnimation(p, p.displayedCash ?? (p.cash - d), p.cash, d);
  });
}

function getRoundLabel() {
  return state.gameMode === "bankruptcy"
    ? `第 ${state.round} 回合`
    : `第 ${state.round} / ${getMaxRounds()} 回合`;
}

function setHumanTurnStatus() {
  resetDiceDisplay();
  state.phase = "await_roll"; state.busy = false;
  state.statusTitle = `${getRoundLabel()}：${currentPlayer().name} 行动`;
  state.statusDescription = "";
  clearHighlights(); hideModal(false);
}

function setAiTurnStatus() {
  resetDiceDisplay();
  state.phase = "locked"; state.busy = true;
  state.statusTitle = `${getRoundLabel()}：${currentPlayer().name} 行动`;
  state.statusDescription = "";
  clearHighlights(); hideModal(false);
}

function clearHighlights() {
  state.animation.currentTile = null; state.animation.landedTile = null;
  state.animation.diceResult = false; state.animation.boardBurst = false;
}

function resetDiceDisplay() {
  state.diceActionId = (state.diceActionId || 0) + 1;
  state.diceDisplay = null;
  state.lastDice = null;
  state.lastDiceFaces = [];
  state.animation.diceRolling = false;
  state.animation.diceResult = false;
  state.animation.boardBurst = false;
}

function getDiceDisplay() {
  const player = currentPlayer(), rolled = state.diceDisplay;
  const belongsToAction = rolled && rolled.sessionId === state.sessionId &&
    rolled.actionId === state.diceActionId && rolled.actorId === player.id;
  if (belongsToAction) return {...rolled,faces:[...rolled.faces]};
  return {actorId:player.id,purpose:"turn",stage:"ready",count:player.effects.speedBoost ? 2 : 1,
    faces:[],total:null,sessionId:state.sessionId,actionId:state.diceActionId};
}

function render() {
  renderBoard(); renderScoreboard(); renderMiniScoreboard(); renderLogs(); renderStatus(); updateControls(); renderModal();
  window.GamePresentation?.update();
}

function renderBoard() {
  if (window.CityScene?.ready) return;
  const mapCfg = getMapConfig(state.currentMapId);
  const isFreeLayout = mapCfg.layoutMode === "free";
  boardEl.className = `board${state.animation.boardBurst ? " burst" : ""}${isFreeLayout ? " free-layout" : ""}`;
  boardEl.innerHTML = "";
  state.board.forEach((tile) => {
    if (tile.isLargeSecondary) return;
    const el = document.createElement("div");
    const cls = ["tile"];
    const isLargePrimary = tile.lot?.isLarge;
    const secTile = isLargePrimary ? state.board.find((t) => t.largePrimaryIndex === tile.index) : null;
    const checkIdx = secTile ? [tile.index, secTile.index] : [tile.index];
    if (tile.isStart) cls.push("start");
    if (tile.isSpecial) { cls.push("special"); cls.push(`special-${tile.special.type}`); }
    if (checkIdx.some((i) => state.animation.currentTile === i)) cls.push("walking");
    if (checkIdx.some((i) => state.animation.landedTile === i)) cls.push("landed");
    if (tile.lot?.ownerId) { cls.push("owned", `owned-${tile.lot.ownerId}`); }
    if (isLargePrimary) cls.push("large-lot-merged");
    const here = state.players.filter((p) => checkIdx.includes(p.position));
    if (here.length > 0) {
      cls.push("has-players");
      el.style.setProperty("--player-here-a", hexToRgba(here[0].color, 0.45));
      el.style.setProperty("--player-here-b", hexToRgba(here[here.length - 1].color, 0.25));
    }
    el.className = cls.join(" ");
    if (isFreeLayout) {
      const visual = mapCfg.tileVisuals?.[tile.index];
      if (visual) {
        el.style.left = visual.left;
        el.style.top = visual.top;
        el.style.width = visual.width || (tile.isStart || tile.isSpecial ? "10.5%" : "9%");
        el.style.height = visual.height || "15%";
        el.style.transform = visual.rotate ? `rotate(${visual.rotate})` : "";
      } else {
        el.style.left = `${tile.x * 8}%`;
        el.style.top = `${tile.y * 12}%`;
        el.style.width = isLargePrimary ? "18%" : "9%";
        el.style.height = isLargePrimary ? "16%" : "15%";
        el.style.transform = "";
      }
      el.style.gridColumn = "";
      el.style.gridRow = "";
    } else if (isLargePrimary && secTile) {
      if (tile.x === secTile.x) {
        el.style.gridColumn = String(tile.x);
        el.style.gridRow = `${Math.min(tile.y, secTile.y)} / span 2`;
      } else {
        el.style.gridColumn = `${Math.min(tile.x, secTile.x)} / span 2`;
        el.style.gridRow = String(tile.y);
      }
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.transform = "";
    } else {
      el.style.gridColumn = String(tile.x);
      el.style.gridRow = String(tile.y);
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.transform = "";
    }
    if (tile.lot?.ownerId) el.style.setProperty("--owner-accent", getPlayerById(tile.lot.ownerId).color);
    else el.style.removeProperty("--owner-accent");

    el.dataset.tileIndex = tile.index;
    if (tile.isStart) el.innerHTML = renderStartTile(tile);
    else if (tile.isSpecial) el.innerHTML = renderSpecialTile(tile);
    else if (isLargePrimary) el.innerHTML = renderLargeLotMerged(tile, secTile);
    else el.innerHTML = renderLotTile(tile);
    boardEl.appendChild(el);
  });
}

function renderStartTile(tile) {
  return `<div class="tile-header"><span class="tile-name">${tile.name}</span></div>
    <span class="lot-badge" style="background:#fde68a;">市政府</span>
    <div class="lot-body"><div class="lot-owner">经过领 ${formatMoney(getMapEconomy().startBonus)}</div></div>
    <div class="sprite-wrap">${createStartSvg()}</div>
    <div class="token-row">${renderTokens(tile.index)}</div>`;
}

function renderLotTile(tile) {
  const lot = tile.lot;
  const owner = lot.ownerId ? getPlayerById(lot.ownerId) : null;
  const ownerText = owner ? owner.name : "待售";
  const ownerStyle = owner ? `style="color:${owner.color};"` : "";
  const tag = lot.level > 0 ? `<span class="building-tag">Lv.${lot.level}</span>` : "";
  const sprite = lot.level > 0
    ? createBuildingSvg(lot.landmarkKey || lot.theme.key, lot.level, owner?.color ?? lot.theme.color)
    : createLotBaseSprite(!!lot.ownerId);
  const distColor = getDistrictColors()[lot.district] || "#e2e8f0";
  const forSaleBadge = !owner ? `<span class="for-sale-badge">待售 <b>¥${lot.price}</b></span>` : "";
  const tollRow = owner ? `<div class="lot-price-toll">收费 ${formatMoney(lot.tolls[lot.level])}</div>` : "";
  return `<div class="tile-header"><span class="tile-name">${tile.name}</span>${forSaleBadge}</div>
    <span class="lot-badge" style="background:${lot.theme.color};">${lot.theme.label}</span>
    <div class="lot-body"><div class="lot-owner" ${ownerStyle}>${ownerText}</div>${tollRow}</div>
    <div class="sprite-wrap">${tag}${sprite}</div>
    <div class="district-bar" style="background:${distColor};">${lot.district}</div>
    <div class="token-row">${renderTokens(tile.index)}</div>`;
}

function renderLargeLotMerged(tile, secTile) {
  const lot = tile.lot;
  const owner = lot.ownerId ? getPlayerById(lot.ownerId) : null;
  const ownerText = owner ? owner.name : "待售";
  const ownerStyle = owner ? `style="color:${owner.color};"` : "";
  const tag = lot.level > 0 ? `<span class="building-tag">Lv.${lot.level}</span>` : "";
  const sprite = lot.level > 0
    ? createBuildingSvg(lot.landmarkKey || lot.theme.key, lot.level, owner?.color ?? lot.theme.color, true)
    : createLotBaseSprite(!!lot.ownerId);
  const distColor = getDistrictColors()[lot.district] || "#e2e8f0";
  const isVertical = secTile && tile.x === secTile.x;
  let cellA, cellB;
  if (isVertical) {
    cellA = tile.y < (secTile?.y ?? 99) ? tile.index : secTile.index;
    cellB = tile.y < (secTile?.y ?? 99) ? secTile.index : tile.index;
  } else {
    cellA = tile.x < (secTile?.x ?? 99) ? tile.index : secTile.index;
    cellB = tile.x < (secTile?.x ?? 99) ? secTile.index : tile.index;
  }
  const forSaleBadge = !owner ? `<span class="for-sale-badge">待售 <b>¥${lot.price}</b></span>` : "";
  const tollRow = owner ? `<div class="lot-price-toll">收费 ${formatMoney(lot.tolls[lot.level])}</div>` : "";
  return `<div class="tile-header"><span class="tile-name">${tile.name}</span>${forSaleBadge}</div>
    <span class="lot-badge" style="background:${lot.theme.color};">${lot.theme.label}·大型地产</span>
    <div class="lot-body"><div class="lot-owner" ${ownerStyle}>${ownerText}</div>${tollRow}</div>
    <div class="sprite-wrap">${tag}${sprite}</div>
    <div class="district-bar" style="background:${distColor};">${lot.district}</div>
    <div class="large-lot-cells${isVertical ? " vertical" : ""}">
      <div class="large-lot-cell">${renderTokens(cellA)}</div>
      <div class="large-lot-cell">${renderTokens(cellB)}</div>
    </div>`;
}

function renderSpecialTile(tile) {
  let extra = "";
  if (tile.special.type === "bank") {
    const pool = state.bankPool || 0;
    const threshold = getMapEconomy().bankThreshold;
    extra = pool >= threshold
      ? `<div class="bank-pool bank-full">金库 ${formatMoney(pool)} 可提！</div>`
      : `<div class="bank-pool">金库 ${formatMoney(pool)} / ${formatMoney(threshold)}</div>`;
  }
  return `<div class="tile-header"><span class="tile-name">${tile.name}</span></div>
    <span class="lot-badge" style="background:${tile.special.color};">${tile.special.label}</span>
    <div class="lot-body"><div class="lot-owner">${tile.special.description}</div>
    <div class="lot-price">停留生效</div></div>
    ${extra}
    <div class="sprite-wrap">${createSpecialSvg(tile.special.type)}</div>
    <div class="token-row">${renderTokens(tile.index)}</div>`;
}

function renderTokens(idx) {
  return state.players
    .filter((p) => p.position === idx)
    .map((p) => {
      const bc = state.animation.landedTile === idx ? " token-bounce" : "";
      return `<span class="token${bc}" style="background:${p.color};--token-color:${p.color};" title="${p.name}">${p.name[0]}</span>`;
    }).join("");
}

function renderScoreboard() {
  const winner = state.gameOver ? getWinnerText() : "";
  scoreboardEl.innerHTML = "";
  if (winner) {
    const wb = document.createElement("div");
    wb.className = "winner-banner";
    wb.innerHTML = `<div class="winner-text">${winner}</div>${window.GameProgression?.resultMarkup(state.citySettlement) || ""}
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button class="play-again-btn" type="button">🎮 再来一局</button>
        <button class="view-history-btn" type="button">📋 历史记录</button>
      </div>`;
    scoreboardEl.appendChild(wb);
  }
  const assets = state.players.map((p) => {
    const lots = state.board.filter((t) => t.lot?.ownerId === p.id && !t.isLargeSecondary);
    const totalLv = lots.reduce((s, t) => s + t.lot.level, 0);
    const efx = [];
    if (p.effects.speedBoost) efx.push("双骰");
    if (p.effects.speedSlow) efx.push("减速");
    if (p.effects.shield) efx.push("护盾");
    if (p.effects.doubleRent) efx.push("收租翻倍");
    if (p.effects.frozen) efx.push("绊脚");
    if (p.effects.hotSpringRest) efx.push("温泉休息");
    if (p.effects.bankruptcyRelief && getMapConfig().reliefRest !== false) efx.push("休整中");
    if (p.effects.extraTurn) efx.push("再行动");
    if (p.effects.reversed) efx.push("逆行");
    return { player:p, lots:lots.length, totalLv, maxLevel:lots.filter(t=>t.lot.level===3).length, cards:p.cards?.length||0, effects:efx };
  });
  const table = document.createElement("table");
  table.className = "asset-comparison";
  table.setAttribute("aria-label", "双方当前资产对比");
  const row = (label, key, suffix) => `<tr data-asset-row="${key}"><th scope="row">${label}</th>${assets.map(a=>`<td data-asset-player="${a.player.id}">${a[key]}<small>${suffix}</small></td>`).join("")}</tr>`;
  table.innerHTML = `<thead><tr><td></td>${assets.map(a=>`<th scope="col" data-asset-owner="${a.player.id}"><span class="asset-owner-dot" aria-hidden="true"></span>${a.player.id==='human'?'你':'对手'}</th>`).join("")}</tr></thead><tbody>
    <tr class="asset-cash-row" data-asset-row="cash"><th scope="row">现金</th>${assets.map(a=>`<td data-player-anchor="${a.player.id}" data-asset-player="${a.player.id}"><strong class="asset-cash-value">${formatMoney(Math.round(a.player.displayedCash??a.player.cash))}</strong></td>`).join("")}</tr>
    ${row('地产','lots','块')}${row('建筑总等级','totalLv','级')}${row('满级建筑','maxLevel','座')}${row('道具卡','cards','张')}
    ${assets.some(a=>a.effects.length)?`<tr class="asset-effects-row"><th scope="row">状态</th>${assets.map(a=>`<td>${a.effects.length?a.effects.join(' · '):'—'}</td>`).join("")}</tr>`:''}
  </tbody>`;
  scoreboardEl.appendChild(table);
}

function renderMiniScoreboard() {
  const el = document.getElementById("mini-scoreboard");
  if (!el) return;
  const [p0, p1] = state.players;
  const activeId = state.gameOver ? null : currentPlayer().id;
  const mkPlayer = (p, alignRight) => {
    const dc = Math.round(p.displayedCash ?? p.cash);
    const dt = p.cashDelta > 0 ? `+${p.cashDelta}` : `${p.cashDelta}`;
    const deltaHtml = p.cashDeltaVisible
      ? `<span class="mini-delta ${p.cashDelta > 0 ? "pos" : "neg"}">${dt}</span>` : "";
    return `<div data-player-anchor="${p.id}" class="mini-player${p.id === activeId ? " active" : ""}${alignRight ? " mini-player-right" : ""}">
      <span class="mini-dot" style="background:${p.color};"></span>
      <span class="mini-name">${p.isAi ? "AI" : "玩家"}</span>
      <span class="mini-cash">¥${dc}</span>${deltaHtml}
    </div>`;
  };
  el.innerHTML = mkPlayer(p0, false) + `<span class="mini-vs">vs</span>` + mkPlayer(p1, true);
}

function getLogPlayerColor(text) {
  for (const p of PLAYER_DEFS) { if (text.includes(p.name)) return p.color; }
  return "#94a3b8";
}

function renderLogs() {
  if (!logListEl) return;
  const nextKey = state.logs.join("\n");
  if (logListEl.dataset.logKey === nextKey) return;
  logListEl.dataset.logKey = nextKey;
  logListEl.innerHTML = state.logs.slice().reverse().map((item) => {
    const c = getLogPlayerColor(item);
    return `<div class="log-item"><span class="log-dot" style="background:${c};"></span><span class="log-text">${item}</span></div>`;
  }).join("");
}

function renderStatus() {
  document.body.dataset.turn = currentPlayer().id;
  turnTitleEl.textContent = state.statusTitle;
  turnDescriptionEl.textContent = state.statusDescription;
  if (state.gameMode === "bankruptcy") {
    roundChipEl.textContent = `第 ${state.round} 回合 · 破产淘汰制`;
    roundProgressBarEl.style.width = "0%";
  } else {
    roundChipEl.textContent = `第 ${Math.min(state.round, getMaxRounds())} / ${getMaxRounds()} 回合`;
    roundProgressBarEl.style.width = `${Math.min((state.round - 1) / getMaxRounds() * 100, 100)}%`;
  }
  const dice = getDiceDisplay(), diceFaces = Array.from({length:dice.count},(_,i) => dice.faces[i] ?? null);
  const diceFace = face => face === null ? '<span class="dice-ready-mark" aria-hidden="true">—</span>' : renderDiceFaceSvg(face);
  diceBoxEl.textContent = dice.faces.length ? dice.faces.join("+") : "—";
  centerDiceEl.dataset.diceActor = dice.actorId;
  centerDiceEl.dataset.dicePurpose = dice.purpose;
  centerDiceEl.dataset.diceStage = dice.stage;
  diceBoxEl.dataset.diceActor = dice.actorId;
  centerDiceEl.setAttribute("aria-label",`${getPlayerById(dice.actorId).name} · ${dice.purpose === "bank" ? "存款骰" : dice.count === 2 ? "双骰" : "骰子"}${dice.total === null ? " · 待掷" : ` · ${dice.faces.join(" + ")} 点`}`);
  centerDiceEl.classList.toggle("double-dice", dice.count === 2);
  centerDiceValueEl.innerHTML = dice.count === 2
    ? `<span class="dice-pair">${diceFaces.map(face => `<span class="dice-pair-face">${diceFace(face)}</span>`).join("")}</span>`
    : diceFace(diceFaces[0]);
  const rolling = dice.stage === "rolling", result = dice.stage === "result" && state.animation.diceResult;
  const isIdle = dice.stage === "ready" && !state.gameOver && !state.modal.visible;
  centerDiceEl.classList.toggle("idle", isIdle);
  centerDiceEl.classList.toggle("rolling", rolling);
  centerDiceEl.classList.toggle("result", result === true);
  centerTitleEl.textContent = state.statusTitle;
  centerDescriptionEl.textContent = state.statusDescription;
  centerPlayerBadgeEl.textContent = `当前：${currentPlayer().name}`;
  centerPhaseBadgeEl.textContent = getPhaseLabel();
}

function renderModal() {
  const m = state.modal;
  const nextKey = JSON.stringify(m);
  if (eventOverlayEl.dataset.modalKey === nextKey) return;
  eventOverlayEl.dataset.modalKey = nextKey;
  eventOverlayEl.classList.toggle("visible", m.visible);
  eventOverlayEl.classList.toggle("opening-coin-overlay", Boolean(m.visible && m.openingCoin));
  eventOverlayEl.classList.toggle("item-shop-overlay", Boolean(m.visible && m.itemShop));
  eventOverlayEl.setAttribute("aria-busy", m.openingCoin?.phase === "tossing" ? "true" : "false");
  const boardChoice = Boolean(m.visible && (m.boardTargets?.length || m.routeChoice));
  document.body.classList.toggle("browsing-property", boardChoice);
  eventOverlayEl.classList.toggle("board-choice", boardChoice);
  const dock = boardChoice ? document.getElementById("board-choice-dock") : document.body;
  if (dock && eventOverlayEl.parentElement !== dock) dock.appendChild(eventOverlayEl);
  eventLabelEl.textContent = m.label || "行动提示";
  eventTitleEl.textContent = m.title || "";
  eventMessageEl.textContent = m.message || "";
  const ico = EVENT_ICON_MAP[m.label] || { emoji: "📋", cls: "event-info" };
  eventIconWrapEl.innerHTML = m.visible ? m.openingCoin ? openingCoinMarkup(m.openingCoin) : `<div class="event-icon ${ico.cls}">${ico.emoji}</div>` : "";
  if (boardChoice && m.buttons.some(b => b.id.startsWith("seize_"))) {
    eventActionsEl.className = "event-actions property-target-actions";
    const options = m.buttons.filter(b => b.id.startsWith("seize_")).map(b => {
      const index = Number(b.id.slice(6)), tile = state.board[index];
      return `<option value="${index}"${index === m.selectedTarget ? " selected" : ""}>${municipalTargetLabel(tile)} · Lv.${tile.lot.level} · ${formatMoney(getCityTakeoverQuote(tile.lot).purchasePrice)}</option>`;
    }).join("");
    eventActionsEl.innerHTML = `<label class="property-target-picker">征用目标<select data-city-target aria-label="征用目标">${options}</select></label><button class="modal-btn secondary" data-action="skip">跳过</button><button class="modal-btn primary" data-action="seize_${m.selectedTarget}">选择这处地产</button>`;
  } else if (m.itemShop) {
    eventActionsEl.className = "event-actions item-shop-actions";
    eventActionsEl.innerHTML = m.buttons.map(b => `<button class="modal-btn ${b.variant || "ghost"} ${b.id === "skip" ? "item-shop-leave" : "item-shop-card"}" data-action="${b.id}"${b.disabled ? " disabled aria-disabled=\"true\"" : ""}>${b.label}</button>`).join("");
  } else if (m.cardDraw) {
    eventActionsEl.className = "event-actions card-draw-actions";
    eventActionsEl.innerHTML = m.buttons
      .map((b) => `<button class="modal-btn ${b.variant || "ghost"}" data-action="${b.id}">${b.label}</button>`).join("");
  } else {
    eventActionsEl.className = "event-actions";
    eventActionsEl.innerHTML = m.buttons
      .map((b) => `<button class="modal-btn ${b.variant || "ghost"}" data-action="${b.id}">${b.label}</button>`).join("");
  }
}

function updateControls() {
  rollBtn.disabled = state.gameOver || state.busy || currentPlayer().isAi || state.phase !== "await_roll";
  restartBtn.disabled = Boolean(openingCoinJob) || homeConfirmationPending || Boolean(state.ticketPaid && !state.gameOver && state.busy && !state.modal.visible);
}

function getPhaseLabel() {
  if (state.gameOver) return "已结束";
  if (state.phase === "presenting") return "事件结算";
  if (state.animation.diceRolling) return "骰子滚动中";
  if (state.modal.visible) return "轮到你选择";
  if (state.animation.currentTile !== null) return "棋子移动中";
  if (currentPlayer().isAi && state.busy) return "AI 思考中";
  return state.phase === "await_roll" ? "等待掷骰" : "结算中";
}

async function playHumanTurn() {
  if (state.gameOver || state.busy || currentPlayer().isAi || state.phase !== "await_roll") return;
  await processTurn(currentPlayer());
}

async function playAiTurn() {
  if (state.gameOver || !currentPlayer().isAi || state.cardUsePending) return;
  const sid = state.sessionId;
  await useAiInventoryCard(currentPlayer());
  if (!isSessionActive(sid) || state.gameOver) return;
  await processTurn(currentPlayer());
}

async function processTurn(player, isExtraTurn = false) {
  const sid = state.sessionId;
  resetDiceDisplay();
  // A pre-roll movement card may schedule a rest. It keeps this promised dice
  // action; the rest begins on the following action, including a bonus action.
  const deferredRest = player.cardDeferredRest || {};
  player.cardDeferredRest = null;
  state.busy = true; state.phase = "locked"; state.passedStartThisTurn = false;
  hideModal(false); render();

  if (player.effects.bankruptcyRelief && !deferredRest.bankruptcyRelief) {
    player.effects.bankruptcyRelief = false;
    player.effects.frozen = false;
    player.effects.hotSpringRest = false;
    if (getMapConfig().reliefRest === false) {
      // Compact rescue protects the next departure without taking an action
      // away. The one-use shield still follows the regular landing rules.
      pushLog(`${player.name} 救助后恢复行动，正常掷骰。`);
    } else {
      pushLog(`${player.name} 本回合休整，救助金已在上回合到账，下回合恢复行动。`);
      state.statusTitle = `${player.name} 本回合休整`;
      state.statusDescription = "";
      render();
      await showContinueModal({ label: "等待救援", title: `${player.name} 本回合休整`, message: "", drama: { type: "notice", amount: 0 } });
      if (!isSessionActive(sid)) return;
      endTurn(); return;
    }
  }

  if (player.effects.hotSpringRest && !deferredRest.hotSpringRest) {
    player.effects.hotSpringRest = false;
    // A rest already consumes this action. A trap laid during the same rest
    // expires with it: settling the stationary lot again would collect rent
    // and re-arm this rest indefinitely without a new landing.
    const trappedWhileResting = player.effects.frozen;
    player.effects.frozen = false;
    pushLog(`${player.name} 在温泉庄园休息一回合，下回合恢复行动。${trappedWhileResting ? "绊脚效果同时结束，不重复收租或追加休息。" : ""}`);
    state.statusTitle = `${player.name} 休息结束`;
    state.statusDescription = "";
    render();
    await showContinueModal({ label: "温泉休息", title: `♨️ ${player.name} 休息结束`, message: "" });
    if (!isSessionActive(sid)) return;
    endTurn(); return;
  }

  if (player.effects.frozen) {
    player.effects.frozen = false;
    pushLog(`${player.name} 被绊脚术绊住，无法移动，但需结算当前地块！`);
    state.statusTitle = `${player.name} 被绊住`;
    state.statusDescription = "本回合停步";
    render();
    await showContinueModal({ label: "绊脚效果", title: `${player.name} 被绊住！`, message: "本回合停步" });
    if (!isSessionActive(sid)) return;
    const frozenTile = state.board[player.position];
    state.animation.landedTile = frozenTile.index;
    render();
    await resolveLanding(player, frozenTile, sid);
    if (!isSessionActive(sid) || state.gameOver) return;
    endTurn(); return;
  }

  const doubleDice = player.effects.speedBoost;
  const dice = await animateDiceRoll(sid,"turn",doubleDice ? 2 : 1,player);
  if (!isSessionActive(sid) || dice === null) return;

  let actualSteps = dice;
  let speedMsg = "";
  if (doubleDice) {
    player.effects.speedBoost = false;
    speedMsg = `双骰 ${state.lastDiceFaces.join(" + ")} = ${dice} 步`;
  }
  if (player.effects.speedSlow) {
    player.effects.speedSlow = false;
    actualSteps = Math.max(1, Math.ceil(dice / 2));
    speedMsg = `减速陷阱生效！${dice}→${actualSteps} 步。`;
  }
  pushLog(`${player.name} 掷出 ${dice} 点${speedMsg ? "。" + speedMsg : "。"}`);

  if (await animateMovement(player, actualSteps, sid) === false) return;
  if (!isSessionActive(sid)) return;

  const tile = state.board[player.position];
  pushLog(`${player.name} 抵达 ${tile.name}。`);
  playSound(tile.isSpecial || tile.isStart ? "special" : "land", { rate: tile.isSpecial ? 0.96 : 1 });
  state.animation.currentTile = null;
  state.animation.landedTile = tile.index;
  render();
  await sleep(300);
  if (!isSessionActive(sid)) return;

  await resolveLanding(player, tile, sid);
  if (!isSessionActive(sid) || state.gameOver) return;

  let extra = false;
  if (!isExtraTurn && !doubleDice && dice === 6) extra = true;
  if (player.effects.extraTurn) { player.effects.extraTurn = false; extra = true; }

  if (extra) {
    clearHighlights(); render();
    await showContinueModal({
      label: "骰6再动",
      title: "再来一回合！",
      message: "",
    });
    if (!isSessionActive(sid) || state.gameOver) return;
    await processTurn(player, true);
    return;
  }
  endTurn();
}

async function animateDiceRoll(sid, purpose = "turn", count = 1, player = currentPlayer()) {
  if (!isSessionActive(sid) || state.gameOver || currentPlayer() !== player) return null;
  const diceCount = purpose === "turn" && count === 2 ? 2 : 1;
  const display = {sessionId:sid,actionId:state.diceActionId,actorId:player.id,
    purpose,count:diceCount,stage:"rolling",faces:[],total:null};
  state.diceDisplay = display;
  state.lastDice = null; state.lastDiceFaces = [];
  const isActive = () => isSessionActive(sid) && !state.gameOver && currentPlayer() === player &&
    state.diceActionId === display.actionId && state.diceDisplay === display;
  const faces = Array.from({length:diceCount},() => rollDice());
  const final = faces.reduce((sum,face) => sum + face,0);
  playSound("dice", { rate: 0.92 + Math.random() * 0.06 });
  state.animation.diceRolling = true;
  state.animation.diceResult = false;
  state.statusTitle = `${player.name} 正在掷${purpose === "bank" ? "存款骰" : "骰"}`;
  state.statusDescription = "";
  render();
  for (let i = 0; i < 10; i++) {
    state.lastDiceFaces = Array.from({length:diceCount},() => rollDice());
    state.lastDice = state.lastDiceFaces.reduce((sum,face) => sum + face,0);
    display.faces = [...state.lastDiceFaces]; display.total = state.lastDice; render();
    if (i === 4) playSound("dice", { rate: 0.98 + Math.random() * 0.06 });
    await sleep(70 + i * 10);
    if (!isActive()) return null;
  }
  state.lastDice = final;
  state.lastDiceFaces = faces;
  display.faces = [...faces]; display.total = final; display.stage = "result";
  state.animation.diceRolling = false;
  state.animation.diceResult = true;
  state.animation.boardBurst = true;
  playSound("land", { volumeMultiplier: 0.55, rate: 1.18 + (final / 6) * 0.08 });
  state.statusTitle = purpose === "bank" ? `存款骰：${final} 点` : diceCount === 2 ? `${faces.join(" + ")} = ${final} 点` : `${player.name} 掷出了 ${final} 点`;
  state.statusDescription = purpose === "bank"
    ? `存款 ${formatMoney(Math.min(final * 30, player.cash))}`
    : diceCount === 1 && final === 6 ? "再行动一次" : "";
  render();
  await sleep(500);
  if (!isActive()) return null;
  state.animation.diceResult = false;
  state.animation.boardBurst = false;
  render();
  return final;
}

async function animateMovement(player, steps, sid, options = {}) {
  if (!isSessionActive(sid) || state.gameOver || getPlayerById(player.id) !== player) return false;
  if (state.harborMovement && state.currentMapId === "harbor") return false;
  const movement = {sessionId:sid,player,remainingSteps:steps};
  if (state.currentMapId === "harbor") state.harborMovement = movement;
  const dir = options.direction ?? (player.effects.reversed ? -1 : 1);
  try {
  if (!await ensureHarborDeparture(player,sid,dir,steps)) return false;
  for (let step = 1; step <= steps; step++) {
    const prev = player.position;
    const next = getNextTileIndex(player, player.position, dir, true);
    player.position = next;
    playSound("step", {
      rate: 0.95 + Math.random() * 0.14,
      volumeMultiplier: step === steps ? 0.85 : 0.65,
    });
    state.animation.currentTile = next;
    state.animation.landedTile = step === steps ? next : null;
    state.statusTitle = `${player.name} 前进中`;
    state.statusDescription = `第 ${step} / ${steps} 步，抵达 ${state.board[next].name}。`;
    const crossedStart = options.payStart !== false && next === 0 && prev !== 0 && (state.currentMapId !== "harbor" || player.harborFreshSalary);
    let startUpgradeMsg = "";
    if (crossedStart) {
      if (state.currentMapId === "harbor") player.harborSalaryDistance = 0;
      state.passedStartThisTurn = true;
      updatePlayerCash(player, getMapEconomy().startBonus, false);
      const buildable = state.board.filter((t) => t.lot?.ownerId === player.id && t.lot.level === 0 && !t.isLargeSecondary);
      if (buildable.length > 0) {
        const target = buildable[Math.floor(Math.random() * buildable.length)];
        target.lot.level = 1;
        syncHarborProjects();
        startUpgradeMsg = `\n${target.name} 自动建造至 Lv.1！`;
        pushLog(`${player.name} 经过市政府，获得 ${formatMoney(getMapEconomy().startBonus)}。${target.name} 自动建造至 Lv.1。`);
      } else {
        pushLog(`${player.name} 经过市政府，获得 ${formatMoney(getMapEconomy().startBonus)} 奖励。`);
      }
    }
    render();
    await sleep(Math.max(step === steps ? 260 : 180, window.CityScene?.getMovementDuration?.(player.id) || 0));
    if (!isSessionActive(sid) || state.gameOver) return false;
    if (crossedStart) {
      render();
      await showContinueModal({
        label: "市政府补给", title: "市政府补给",
        message: `${player.name} 经过市政府，领取了 ${formatMoney(getMapEconomy().startBonus)} 补给资金。${startUpgradeMsg}`,
        drama: { type: "income", amount: getMapEconomy().startBonus, to: player },
      });
      if (!isSessionActive(sid) || state.gameOver) return false;
    }
    movement.remainingSteps = steps - step;
    if (!await ensureHarborDeparture(player,sid,dir,movement.remainingSteps)) return false;
  }
  return true;
  } finally { if (state.harborMovement === movement) state.harborMovement = null; }
}

function getCityTakeoverQuote(lot) {
  const refund = lot.price;
  const purchasePrice = Math.ceil(refund * 1.25);
  return { refund, purchasePrice, premium: purchasePrice - refund };
}

async function resolveStartTakeover(player, sid) {
  if (!isSessionActive(sid) || getPlayerById(player.id) !== player) return;
  const opp = getOpponent(player);
  const oppTiles = state.board.filter((t) => t.lot?.ownerId === opp.id && !t.isLargeSecondary);

  if (oppTiles.length === 0) {
    const fallback = 100;
    updatePlayerCash(player, fallback, false);
    pushLog(`${player.name} 停留市政府，对手暂无地产可征用，获得 ${formatMoney(fallback)} 补贴。`);
    await showContinueModal({ label: "市政府征用", title: "市政府征用 — 无可用目标", message: `对手暂无地产可征用，改为获得 ${formatMoney(fallback)} 补贴。` });
    return;
  }

  let target, action;
  if (player.isAi) {
    const value = (tile) => tile.lot.tolls[tile.lot.level] + tile.lot.level * 80
      + getDistrictOwnerLots(tile.lot.district, player.id).length * 90
      + getDistrictOwnerLots(tile.lot.district, opp.id).length * 50;
    const sorted = [...oppTiles].sort((a, b) => value(b) - value(a));
    // Consider every affordable property before falling back to a free seizure.
    target = sorted.find((tile) => player.cash - getCityTakeoverQuote(tile.lot).purchasePrice >= 80);
    action = target ? "acquire" : "release";
    target ||= sorted[0];
  } else {
    const buttons = oppTiles.map((tile) => ({
      id: `seize_${tile.index}`,
      label: `${municipalTargetLabel(tile)}（Lv.${tile.lot.level}）接手 ${formatMoney(getCityTakeoverQuote(tile.lot).purchasePrice)}`,
      variant: "secondary",
    }));
    buttons.push({ id: "skip", label: "跳过（不征用）", variant: "secondary" });
    const selection = await showModal({
      label: "市政府征用", title: "选择征用地产",
      message: "",
      buttons, boardTargets: oppTiles.map(tile => tile.index),
    });
    if (!isSessionActive(sid)) return;
    if (selection === "skip" || selection === "cancel") {
      pushLog(`${player.name} 停留市政府，放弃了征用机会。`);
      return;
    }
    if (typeof selection !== "string" || !/^seize_\d+$/.test(selection)) return;
    target = state.board[Number(selection.slice(6))];
    if (!oppTiles.includes(target) || target.lot.ownerId !== opp.id) return;

    const quote = getCityTakeoverQuote(target.lot);
    const canAcquire = player.cash >= quote.purchasePrice;
    const choices = [];
    if (canAcquire) choices.push({ id: "acquire", label: `接手房产 · 支付 ${formatMoney(quote.purchasePrice)}`, variant: "primary" });
    choices.push({ id: "release", label: "只征用 · 不花钱，地产变无主", variant: "danger" });
    choices.push({ id: "skip", label: "放弃这次征用", variant: "secondary" });
    action = await showModal({
      label: "市政府征用", title: `${municipalTargetLabel(target)} · Lv.${target.lot.level}`,
      message: `接手后归你；免费征用后变无主。${canAcquire ? "" : `\n接手还差 ${formatMoney(quote.purchasePrice - player.cash)}`}`,
      buttons: choices, boardTargets: [target.index], selectedTarget: target.index,
    });
  }

  // Both menus can remain open while a game is restarted; validate immediately
  // before the synchronous transfer, including ownership and available cash.
  if (!isSessionActive(sid) || getPlayerById(player.id) !== player || getPlayerById(opp.id) !== opp) return;
  if (action !== "acquire" && action !== "release") return;
  if (state.board[target?.index] !== target || !target?.lot || target.isLargeSecondary || target.lot.ownerId !== opp.id) return;
  const { refund, purchasePrice, premium } = getCityTakeoverQuote(target.lot);
  if (action === "acquire") {
    if (player.cash < purchasePrice) {
      await showContinueModal({ label: "市政府征用", title: "现金不足，未接手", message: `还差 ${formatMoney(purchasePrice - player.cash)}` });
      return;
    }
    updatePlayerCash(player, -purchasePrice, false);
    updatePlayerCash(opp, refund, false);
    state.bankPool += premium;
    target.lot.ownerId = player.id;
    syncHarborProjects();
    playSound("special", { rate: 1.05 });
    pushLog(`市政府接管令！${player.name} 花 ${formatMoney(purchasePrice)} 接手 ${target.name}（Lv.${target.lot.level}），${opp.name} 获补偿 ${formatMoney(refund)}，溢价 ${formatMoney(premium)} 进入公共金库。`);
    render();
    await showContinueModal({
      label: "市政府征用", title: "房产接手成功",
      drama: { type: "seize", from: opp, to: player, amount: purchasePrice, acquisition: true, purchasePrice, refund, premium, tiles: [target.index], tileName: target.name },
      message: `${player.name} 支付 ${formatMoney(purchasePrice)} · ${opp.name} 获 ${formatMoney(refund)}`,
    });
    return;
  }

  target.lot.ownerId = null;
  syncHarborProjects();
  updatePlayerCash(opp, refund, false);
  playSound("special", { rate: 0.88 });
  pushLog(`市政府征用令！${opp.name} 的 ${target.name}（Lv.${target.lot.level}）被强制拍卖，退还买地成本 ${formatMoney(refund)}！`);
  render();
  await showContinueModal({
    label: "市政府征用", title: "征用成功！",
    drama: { type: "seize", from: opp, to: { id: "city", name: "无主地产" }, amount: 0, refund, tiles: [target.index], tileName: target.name },
    message: `${target.name} 变为无主 · ${opp.name} 获补偿 ${formatMoney(refund)}`,
  });
}

async function resolveLargeLotEffect(player, tile, sid) {
  if (!isSessionActive(sid)) return;
  const lot = tile.lot;
  const lotName = tile.isLargeSecondary && tile.largePrimaryIndex != null
    ? state.board[tile.largePrimaryIndex]?.name || tile.name
    : tile.name;
  if (!lot || lot.level === 0 || !lot.effectId) return;

  if (lot.effectId === "finance_bonus" && lot.ownerId === player.id) {
    const bonusTable = [0, 60, 120, 200];
    const bonus = bonusTable[lot.level];
    updatePlayerCash(player, bonus, false);
    pushLog(`${player.name} 的 ${lotName}（Lv.${lot.level}）带来额外收益 ${formatMoney(bonus)}！`);
    render();
    await showContinueModal({
      label: "商会收益",
      title: `📈 ${lotName} 运转！`,
      message: `经营收益 +${formatMoney(bonus)}`,
    });
  } else if (lot.effectId === "tower_bonus" && lot.ownerId === player.id) {
    const bonusTable = [0, 50, 100, 170];
    const bonus = bonusTable[lot.level];
    updatePlayerCash(player, bonus, false);
    pushLog(`${player.name} 的 ${lotName}（Lv.${lot.level}）带来酒店收益 ${formatMoney(bonus)}！`);
    render();
    await showContinueModal({
      label: "酒店收益",
      title: `🏨 ${lotName} 经营收益！`,
      message: `经营收益 +${formatMoney(bonus)}`,
    });
  } else if (lot.effectId === "hot_spring_rest" && lot.ownerId && lot.ownerId !== player.id) {
    // Relief has already scheduled one recovery action and takes precedence.
    if (player.effects.bankruptcyRelief) return;
    if (player.effects.hotSpringRest) {
      pushLog(`${player.name} 已经在特殊休息状态中，不会重复触发。`);
    } else {
      player.effects.hotSpringRest = true;
      pushLog(`${player.name} 被 ${lotName} 的效果困住，下回合被迫休息！`);
      render();
      await showContinueModal({
        label: "温泉庄园",
        title: `♨️ ${lotName} 生效！`,
        message: `${player.name} 下回合休息`,
      });
    }
  }
}

async function resolveLanding(player, tile, sid) {
  if (!isSessionActive(sid) || state.gameOver) return;
  if (tile.isStart) {
    await resolveStartTakeover(player, sid);
    return;
  }

  if (tile.isSpecial) { await resolveSpecialTile(player, tile, sid); return; }

  const lot = tile.lot;
  if (!lot) return;

  if (!lot.ownerId) {
    if (player.cash < lot.price) {
      pushLog(`${player.name} 资金不足，无法购买 ${tile.name}。`);
      await showContinueModal({ label: "购买提示", title: `${tile.name} 暂不可购买`, message: `售价 ${formatMoney(lot.price)}，你只有 ${formatMoney(player.cash)}。` });
      return;
    }
    if (player.isAi) {
      if (shouldAiBuy(player, lot) && buyLot(player, tile, false)) {
        render();
        await showContinueModal({ label: "AI 行动", title: `AI 买下了 ${tile.name}`, message: `−${formatMoney(lot.price)}` });
      } else {
        pushLog(`AI 对手放弃购买 ${tile.name}。`);
        await showContinueModal({ label: "AI 行动", title: `AI 放弃购买 ${tile.name}`, message: "AI 选择保留现金。" });
      }
      return;
    }
    const dec = await showModal({
      label: "购买提示", title: `购买 ${tile.name}？`,
      message: `${lot.theme.label}${lot.isLarge ? " · 大型地产" : ""} · ${formatMoney(lot.price)}`,
      buttons: [
        { id: "buy", label: `购买 ${formatMoney(lot.price)}`, variant: "primary" },
        { id: "skip", label: "暂不购买", variant: "ghost" },
      ],
    });
    if (!isSessionActive(sid)) return;
    if (dec === "buy" && buyLot(player, tile)) { render(); await showContinueModal({ label: "购买完成", title: `已购买 ${tile.name}`, message: `−${formatMoney(lot.price)}`, drama: { type: "buy", amount: lot.price, to: player, tiles: [tile.index], tileName: tile.name } }); }
    return;
  }

  if (lot.ownerId === player.id) {
    await resolveLargeLotEffect(player, tile, sid);
    if (!isSessionActive(sid) || state.gameOver) return;

    if (lot.level >= 3) {
      if (lot.effectId !== "finance_bonus" && lot.effectId !== "tower_bonus") {
        await showContinueModal({ label: "升级提示", title: `${tile.name} 已满级`, message: `Lv.3 最高等级，收费 ${formatMoney(lot.tolls[3])}。` });
      }
      return;
    }
    const cost = lot.buildCosts[lot.level + 1];
    if (player.isAi) {
      if (player.cash >= cost && shouldAiBuild(player, lot, cost)) {
        buildLot(player, tile, false); render();
        await showContinueModal({ label: "AI 行动", title: `AI 升级了 ${tile.name}`, message: `建筑提升到 Lv.${lot.level}。` });
      } else {
        pushLog(`AI 跳过 ${tile.name}。`);
        await showContinueModal({ label: "AI 行动", title: `AI 跳过 ${tile.name}`, message: "保持现状。" });
      }
      return;
    }
    if (player.cash < cost) {
      await showContinueModal({ label: "升级提示", title: `${tile.name} 暂无法升级`, message: `升级需 ${formatMoney(cost)}，你只有 ${formatMoney(player.cash)}。` });
      return;
    }
    const dec = await showModal({
      label: "升级提示", title: `升级 ${tile.name}？`,
      message: `Lv.${lot.level} → Lv.${lot.level + 1} · 租金 ${formatMoney(lot.tolls[lot.level])} → ${formatMoney(lot.tolls[lot.level + 1])}`,
      buttons: [
        { id: "build", label: `升级 ${formatMoney(cost)}`, variant: "primary" },
        { id: "skip", label: "跳过", variant: "ghost" },
      ],
    });
    if (!isSessionActive(sid)) return;
    if (dec === "build") { buildLot(player, tile); render(); await showContinueModal({ label: "建筑升级", title: `${tile.name} 升至 Lv.${lot.level}`, message: `支付 ${formatMoney(cost)}，基础租金提高至 ${formatMoney(lot.tolls[lot.level])}。`, drama: { type: "build", amount: cost, to: player, tiles: [tile.index], tileName: tile.name } }); }
    return;
  }

  const owner = getPlayerById(lot.ownerId);
  if (player.effects.shield) {
    player.effects.shield = false;
    pushLog(`${player.name} 的护盾术生效，免交 ${tile.name} 的过路费！`);
    await showContinueModal({ label: "过路费提示", title: "护盾生效 · 本次免租", message: `${player.name} 免交 ${tile.name} 的过路费。`, drama: { type: "shield", expectedAmount: window.GamePresentation?.rentFor(tile).total ?? lot.tolls[lot.level], to: player, tiles: [tile.index], tileName: tile.name } });
    if (!isSessionActive(sid)) return;
    await resolveLargeLotEffect(player, tile, sid);
    return;
  }
  const toll = collectToll(player, owner, tile);
  render();
  if (window.GamePresentation) {
    const leadChanged = owner.cash > player.cash && owner.cash - toll.actualPayment <= player.cash + toll.actualPayment;
    await showContinueModal({ label: "过路费提示", title: "街区租金结算", message: toll.message, drama: { type: "rent", amount: toll.actualPayment, expectedAmount: toll.toll, leadChanged, from: player, to: owner, tiles: getDistrictOwnerLots(lot.district, owner.id).map(t => t.index), tileName: tile.name } });
    if (!isSessionActive(sid)) return;
  }
  if (toll.actualPayment < toll.toll) {
    if (state.gameMode === "bankruptcy") {
      pushLog(`${player.name} 无力偿还 ${formatMoney(toll.toll)} 过路费，宣告破产！游戏结束。`);
      await showContinueModal({
        label: "破产淘汰",
        title: "💸 破产！游戏结束",
        message: `${player.name} 仅剩 ${formatMoney(toll.actualPayment)}，差 ${formatMoney(toll.toll - toll.actualPayment)} 无力偿还。\n${owner.name} 获胜！`,
      });
      if (!isSessionActive(sid)) return;
      finishGame("bankruptcy");
      return;
    }
    const relief = 200;
    player.effects.bankruptcyRelief = true;
    player.effects.frozen = false;
    player.effects.hotSpringRest = false;
    const reliefShield = getMapConfig().reliefShield === true;
    if (reliefShield) player.effects.shield = true;
    updatePlayerCash(player, relief, false);
    const reliefMessage = `+${formatMoney(relief)}${reliefShield ? " · 护盾" : ""}${getMapConfig().reliefRest === false ? "" : " · 休整 1 回合"}`;
    pushLog(`${player.name} 现金耗尽，进入破产救助：${reliefMessage}`);
    await showContinueModal({
      label: "破产救助",
      title: "救助金已到账",
      drama: { type: "relief", amount: relief, to: player, tiles: [tile.index], tileName: tile.name },
      message: reliefMessage,
    });
  } else if (!window.GamePresentation) {
    await showContinueModal({ label: "过路费提示", title: `支付 ${formatMoney(toll.actualPayment)} 过路费`, message: toll.message });
  }
  if (!isSessionActive(sid)) return;
  await resolveLargeLotEffect(player, tile, sid);
}

function scoreAiTargetTile(player, tile) {
  const opp = getOpponent(player);
  let score = 0;
  if (tile.lot && !tile.lot.ownerId) score += 6;
  else if (tile.lot?.ownerId === player.id && tile.lot.level < 3) score += 4;
  else if (tile.lot?.ownerId === opp.id) score -= tile.lot.tolls[tile.lot.level] / 42;
  if (tile.isSpecial) {
    if (tile.special.type === "construction" || tile.special.type === "card_draw") score += 3;
    if (tile.special.type === "chance" || tile.special.type === "teleport") score += 2;
    if (tile.special.type === "bank") score += state.bankPool >= getMapEconomy().bankThreshold ? 5 : 1;
  }
  return score;
}

function chooseAiJunctionOption(player, tile) {
  const junction = getJunctionConfig(tile.index);
  if (!junction) return null;
  let best = junction.options[0];
  let bestScore = -Infinity;
  for (const option of junction.options) {
    const immediate = state.board[option.next];
    const preview = previewMovement(player, 3, { startingIndex: tile.index, branchChoice: option.id });
    const future = state.board[preview.index];
    const score = scoreAiTargetTile(player, immediate) * 1.4 + scoreAiTargetTile(player, future);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return best;
}

async function resolveJunctionTile(player, tile, sid) {
  if (state.currentMapId === "harbor") {
    await ensureHarborDeparture(player,sid,player.effects.reversed ? -1 : 1,0);
    return;
  }
  const junction = getJunctionConfig(tile.index);
  if (!junction) return;
  if (player.isAi) {
    const selected = chooseAiJunctionOption(player, tile) || junction.options[0];
    player.nextJunctionChoice = selected.id;
    pushLog(`${player.name} 在 ${tile.name} 选择了 ${selected.label}。`);
    await showContinueModal({
      label: "路线选择",
      title: `${player.name} 锁定路线`,
      message: selected.label,
    });
    return;
  }
  const buttons = junction.options.map((opt) => ({
    id: opt.id,
    label: `${opt.label}（下一站 ${state.board[opt.next].name}）`,
    variant: "primary",
  }));
  const selected = await showModal({
    label: "路线选择",
    title: `选择 ${tile.name} 的前进方向`,
    message: "",
    buttons,
  });
  if (!isSessionActive(sid)) return;
  const option = junction.options.find((opt) => opt.id === selected) || junction.options[0];
  player.nextJunctionChoice = option.id;
  pushLog(`${player.name} 在 ${tile.name} 选择了 ${option.label}。`);
  await showContinueModal({
    label: "路线选择",
    title: "路线已锁定",
    message: `行程：${option.label}`,
  });
}

async function resolveRushTile(player, sid, tile = state.board[player.position]) {
  if (!isSessionActive(sid) || state.gameOver) return;
  const minSteps = tile.special?.rushMin ?? 2;
  const maxSteps = tile.special?.rushMax ?? minSteps;
  const steps = minSteps === maxSteps ? minSteps : minSteps + Math.floor(Math.random() * (maxSteps - minSteps + 1));
  const name = tile.name || "冲刺站";
  playSound("special", { rate: 1.1 });
  pushLog(`${player.name} 启动${name}，随机冲刺 ${steps} 格！`);
  await showContinueModal({
    label: name,
    title: `${name}，冲刺 ${steps} 格！`,
    message: "",
    drama: { type: "card", to: player, tiles: [tile.index], tileName: name },
  });
  if (!isSessionActive(sid) || state.gameOver) return;
  if (await animateMovement(player, steps, sid) === false) return;
  if (!isSessionActive(sid) || state.gameOver) return;
  state.animation.currentTile = null;
  state.animation.landedTile = player.position;
  render();
  await sleep(220);
  if (!isSessionActive(sid)) return;
  await resolveLanding(player, state.board[player.position], sid);
}

async function resolveSpecialTile(player, tile, sid) {
  if (tile.special.type === "bank") {
    playSound("special", { rate: 0.9 });
    const threshold = getMapEconomy().bankThreshold;
    if (state.bankPool >= threshold) {
      const payout = state.bankPool;
      state.bankPool = 0;
      updatePlayerCash(player, payout, false);
      pushLog(`${player.name} 在银行提走了全部存款 ${formatMoney(payout)}！`);
      render();
      await showContinueModal({
        label: "功能地块", title: "提取金库",
        drama: { type: "bank", amount: payout, from: { id: "bank", name: "银行金库" }, to: player, tiles: [tile.index], tileName: tile.name },
        message: `${player.name} +${formatMoney(payout)}`,
      });
    } else {
      const bankDice = await animateDiceRoll(sid, "bank", 1, player);
      if (!isSessionActive(sid) || bankDice === null) return;
      const deposit = bankDice * 30;
      const actual = Math.min(deposit, player.cash);
      if (actual > 0) {
        updatePlayerCash(player, -actual, false);
        state.bankPool += actual;
      }
      pushLog(`${player.name} 掷出 ${bankDice} 点，被迫存入 ${formatMoney(actual)}（金库累计 ${formatMoney(state.bankPool)}）。`);
      render();
      await showContinueModal({
        label: "功能地块", title: `强制存款！掷出 ${bankDice} 点`,
        drama: { type: "bank", amount: actual, from: player, to: { id: "bank", name: "银行金库" }, tiles: [tile.index], tileName: tile.name },
        message: `${player.name} 被迫向金库存入 ${formatMoney(actual)}。\n金库累计：${formatMoney(state.bankPool)} / ${formatMoney(threshold)}`,
      });
    }
    return;
  }

  if (tile.special.type === "chance") {
    await resolveChance(player, tile, sid);
    return;
  }

  if (tile.special.type === "teleport") {
    await resolveTeleportTile(player, sid, tile);
    return;
  }

  if (tile.special.type === "construction") {
    await resolveConstruction(player, sid);
    return;
  }

  if (tile.special.type === "card_draw") {
    await resolveCardDraw(player, sid, tile);
    return;
  }

  if (tile.special.type === "rush") {
    await resolveRushTile(player, sid, tile);
    return;
  }

  if (tile.special.type === "junction") {
    await resolveJunctionTile(player, tile, sid);
  }
}

function itemShopVisitIsActive(visit) {
  return Boolean(visit && state.itemShopVisit === visit && !visit.closed &&
    isSessionActive(visit.sessionId) && !state.gameOver &&
    currentPlayer() === visit.player && state.players.includes(visit.player) &&
    visit.player.position === visit.tileIndex && state.board[visit.tileIndex]?.special?.type === "chance");
}

function commitItemShopPurchase(visit, cardId) {
  if (!itemShopVisitIsActive(visit)) return { ok: false, reason: "商店已关闭" };
  const card = visit.offers.find(offer => offer.id === cardId);
  if (!card) return { ok: false, reason: "本次没有这张商品" };
  const price = ITEM_SHOP_PRICES[card.id];
  if (!Number.isFinite(visit.player.cash) || visit.player.cash < price) return { ok: false, reason: "金币不足" };
  // Commit once, synchronously: double taps and stale dialogs cannot pay or grant twice.
  visit.closed = true;
  const item = grantInventoryCard(visit.player.id, card.id, {
    type: "shop", tileIndex: visit.tileIndex, reference: visit.reference,
  });
  if (!item) return { ok: false, reason: "本局已结束" };
  updatePlayerCash(visit.player, -price, false);
  pushLog(`${visit.player.name} 花费 ${formatMoney(price)} 购买 ${card.icon} ${card.name}，已存入背包。`);
  return { ok: true, card, price, item };
}

function drawItemShopOffers() {
  const pool = CARD_POOL.filter(card => Number.isFinite(ITEM_SHOP_PRICES[card.id]));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (state.currentMapId === "harbor") {
    const boost = pool.find(card => card.id === "boost");
    if (boost) return [boost,...pool.filter(card => card.id !== "boost").slice(0,2)];
  }
  return pool.slice(0, 3);
}

async function resolveChance(player, tile, sid) {
  if (!isSessionActive(sid) || state.gameOver || currentPlayer() !== player ||
      state.board[tile?.index] !== tile || tile.special?.type !== "chance" || player.position !== tile.index) return;
  // One offer set per visit; a concurrent resolver cannot refresh the stock.
  if (state.itemShopVisit && isSessionActive(state.itemShopVisit.sessionId)) return;
  const visit = {
    sessionId: sid, player, tileIndex: tile.index, offers: drawItemShopOffers(), closed: false,
    reference: `${sid}:shop:${state.itemShopSequence = (state.itemShopSequence || 0) + 1}`,
  };
  state.itemShopVisit = visit;
  playSound("card", { rate: 1.04 });
  try {
    if (player.isAi) {
      const offers = visit.offers.filter(card => player.cash - ITEM_SHOP_PRICES[card.id] >= 150 &&
        !cardEffectBlock(player, card) && !(player.cards || []).some(item => item.cardId === card.id));
      const selected = (player.cards || []).length < 3 && offers.length ? aiChooseCard(offers, player) : null;
      const purchase = selected ? commitItemShopPurchase(visit, selected.id) : null;
      if (!purchase?.ok) {
        pushLog(`${player.name} 经过 ${tile.name}，本次未购买道具。`);
        return;
      }
      render();
      await showContinueModal({ label: "道具商店", title: `${player.name} 购买了 ${selected.name}`,
        message: `−${formatMoney(purchase.price)}` });
      return;
    }
    const decision = await showModal({
      label: "道具商店", title: tile.name,
      message: `持有 ${formatMoney(player.cash)}`, itemShop: true,
      buttons: [...visit.offers.map(card => {
        const price = ITEM_SHOP_PRICES[card.id], affordable = player.cash >= price;
        return { id: card.id, variant: "primary", disabled: !affordable,
          label: `<span class="card-icon">${card.icon}</span><span class="card-name">${card.name}</span><span class="card-desc">${card.description}</span><span class="card-price">${formatMoney(price)}</span><span class="card-buy-label">${affordable ? "购买" : "金币不足"}</span>` };
      }), { id: "skip", label: "离开商店", variant: "ghost" }],
    });
    if (!itemShopVisitIsActive(visit)) return;
    if (decision === "skip" || decision === "cancel") {
      pushLog(`${player.name} 离开 ${tile.name}，未购买道具。`);
      return;
    }
    const purchase = commitItemShopPurchase(visit, decision);
    if (!purchase.ok) return;
    playSound("card", { rate: 1.12 });
    flushQueuedCashAnimations();
    render();
  } finally {
    visit.closed = true;
    if (state.itemShopVisit === visit) state.itemShopVisit = null;
  }
}

async function resolveTeleportTile(player, sid, tile = state.board[player.position]) {
  if (!isSessionActive(sid) || state.gameOver) return;
  const settleArrival = tile.special?.settleArrival === true;
  playSound("special", { rate: 1.08 });
  const lots = state.board.filter((t) => t.lot !== null);
  if (lots.length === 0) return;
  const target = lots[Math.floor(Math.random() * lots.length)];
  // A jump has no traversed route: do not call animateMovement or pay a start bonus.
  player.position = target.index;
  resetHarborJourney(player);
  pushLog(`${player.name} 踏入传送门，被传送到了 ${target.name}！`);
  state.animation.currentTile = null;
  state.animation.landedTile = target.index;
  render();
  await showContinueModal({
    label: "传送门", title: "传送门启动！",
    message: `${player.name} 抵达 ${target.name}`,
    drama: { type: "card", to: player, tiles: [target.index], tileName: target.name },
  });
  if (!isSessionActive(sid) || state.gameOver) return;
  // The outer landing resolves only this station; settle its destination once here.
  if (settleArrival) await resolveLanding(player, target, sid);
}

async function resolveConstruction(player, sid) {
  playSound("build", { rate: 0.92 });
  const opp = getOpponent(player);
  const canBuild = state.board.filter((t) => t.lot?.ownerId === player.id && t.lot.level < 3 && !t.isLargeSecondary);
  const canDemolish = state.board.filter((t) => t.lot?.ownerId === opp.id && t.lot.level > 0 && !t.isLargeSecondary);

  if (!canBuild.length && !canDemolish.length) {
    const b = 120; updatePlayerCash(player, b, false);
    pushLog(`${player.name} 在城建局无事可做，领取 ${formatMoney(b)} 补贴。`);
    await showContinueModal({ label: "城建局", title: "城建局", message: `暂无可建造或拆除的目标，获得 ${formatMoney(b)} 补贴。` });
    return;
  }

  if (player.isAi) {
    const preferDemolish = canDemolish.length > 0 && canDemolish.some((t) => t.lot.level >= 2);
    if (preferDemolish) {
      const sorted = [...canDemolish].sort((a, b) => b.lot.level - a.lot.level);
      const target = sorted[Math.floor(Math.random() * Math.min(2, sorted.length))];
      target.lot.level -= 1;
      syncHarborProjects();
      pushLog(`${player.name} 在城建局拆除了 ${target.name} 一级建筑！降至 Lv.${target.lot.level}。`);
      render();
      await showContinueModal({ label: "城建局", title: "AI 选择拆除！", message: `${opp.name} 的 ${target.name} 被拆除一级，降至 Lv.${target.lot.level}！` });
    } else if (canBuild.length > 0) {
      const target = canBuild[Math.floor(Math.random() * canBuild.length)];
      target.lot.level += 1;
      harborBuildingMilestone(player, target);
      pushLog(`${player.name} 在城建局免费建造了 ${target.name}，升至 Lv.${target.lot.level}。`);
      render();
      await showContinueModal({ label: "城建局", title: "AI 选择建造！", message: `${player.name} 的 ${target.name} 免费升至 Lv.${target.lot.level}！` });
    } else {
      const target = canDemolish[Math.floor(Math.random() * canDemolish.length)];
      target.lot.level -= 1;
      syncHarborProjects();
      pushLog(`${player.name} 在城建局拆除了 ${target.name} 一级建筑！`);
      render();
      await showContinueModal({ label: "城建局", title: "AI 选择拆除！", message: `${opp.name} 的 ${target.name} 被拆除一级，降至 Lv.${target.lot.level}！` });
    }
    return;
  }

  const btns = [];
  if (canBuild.length > 0) btns.push({ id: "build", label: `随机建造（${canBuild.length} 处可选）`, variant: "primary" });
  if (canDemolish.length > 0) btns.push({ id: "demolish", label: `随机拆除对手（${canDemolish.length} 处可拆）`, variant: "danger" });
  const dec = await showModal({
    label: "城建局", title: "城建局 — 选择行动",
    message: "",
    buttons: btns,
  });
  if (!isSessionActive(sid)) return;

  if (dec === "build") {
    const target = canBuild[Math.floor(Math.random() * canBuild.length)];
    target.lot.level += 1;
    harborBuildingMilestone(player, target);
    pushLog(`${player.name} 在城建局免费建造了 ${target.name}，升至 Lv.${target.lot.level}。`);
    render();
    await showContinueModal({ label: "城建局", title: "建造完成！", message: `${target.name} 免费升级到 Lv.${target.lot.level}！` });
  } else if (dec === "demolish") {
    const target = canDemolish[Math.floor(Math.random() * canDemolish.length)];
    target.lot.level -= 1;
    syncHarborProjects();
    pushLog(`${player.name} 在城建局拆除了 ${opp.name} 的 ${target.name} 一级建筑！`);
    render();
    await showContinueModal({ label: "城建局", title: "拆除完成！", message: `${opp.name} 的 ${target.name} 降至 Lv.${target.lot.level}！` });
  }
}

// One physical entry per reward, with provenance retained for later loadouts or shops.
// No discard limit: a reward never disappears simply because it cannot be used now.
function grantInventoryCard(playerId, cardId, source = {}) {
  const player = state.players?.find(p => p.id === playerId);
  if (!player || state.gameOver || !CARD_POOL.some(c => c.id === cardId)) return null;
  player.cards ||= [];
  const item = {
    instanceId: `${state.sessionId}:card:${++state.cardSequence}`,
    cardId,
    source: {
      type: String(source.type || "reward"),
      mapId: state.currentMapId, round: state.round,
      tileIndex: Number.isInteger(source.tileIndex) ? source.tileIndex : null,
      ...(typeof source.reference === "string" ? { reference: source.reference } : {}),
    },
  };
  player.cards.push(item);
  return { ...item, source: { ...item.source } };
}

function cardTurnBlock(player, ai = false) {
  if (!player || !state.players?.length) return "请先开始对局";
  if (state.gameOver) return "本局已结束";
  if (startScreenEl && !startScreenEl.classList.contains("hidden")) return "请先开始对局";
  if (currentPlayer() !== player || (!ai && player.isAi)) return "等待你的回合";
  if (state.cardUsePending || homeConfirmationPending) return "正在处理行动";
  if (!ai && (state.busy || state.phase !== "await_roll" || state.modal.visible)) return "请先完成当前行动";
  if (player.cardUsedThisTurn) return "本回合已使用卡牌";
  if (player.effects.hotSpringRest || player.effects.frozen ||
      (player.effects.bankruptcyRelief && getMapConfig().reliefRest !== false)) return "本回合休整，暂不能使用";
  return "";
}

function cardEffectBlock(player, card) {
  const opp = getOpponent(player);
  const owned = pid => state.board.some(t => t.lot?.ownerId === pid && !t.isLargeSecondary);
  switch (card.id) {
    case "shield": return player.effects.shield ? "护盾已生效" : "";
    case "combo": return player.effects.extraTurn ? "已获得额外回合" : "";
    case "doubleRent": return !owned(player.id) ? "需要先拥有地产" : player.effects.doubleRent ? "翻倍效果已生效" : "";
    case "freeze": return opp.effects.bankruptcyRelief || opp.effects.hotSpringRest || opp.effects.frozen ? "对手正在休整或已被绊住" : "";
    case "swap": return player.position === opp.position ? "双方已在同一地块" : "";
    case "propertySwap": return !owned(player.id) ? "你还没有可交换的地产" : !owned(opp.id) ? "对手还没有可交换的地产" : "";
    case "teleport": return state.board.some(t => t.lot) ? "" : "没有可传送的地产";
    case "boost": return player.effects.speedBoost && opp.effects.speedBoost ? "双方已有双骰效果" : "";
    case "slow": return player.effects.speedSlow && opp.effects.speedSlow ? "双方已有减速效果" : "";
    default: return "";
  }
}

function getCardInventory() {
  const player = state.players?.find(p => !p.isAi) || state.players?.find(p => p.id === "human");
  const reason = cardTurnBlock(player);
  const cards = (player?.cards || []).map(item => {
    const card = CARD_POOL.find(c => c.id === item.cardId);
    if (!card) return null;
    const blocked = reason || cardEffectBlock(player, card);
    return { ...card, instanceId: item.instanceId, source: { ...item.source }, usable: !blocked, canUse: !blocked, reason: blocked };
  }).filter(Boolean);
  return {
    sessionId: state.sessionId, count: cards.length,
    canBrowse: Boolean(player) && startScreenEl.classList.contains("hidden") && !state.modal?.visible && state.phase !== "presenting" && !homeConfirmationPending,
    opponentCount: state.players?.find(p => p !== player)?.cards?.length || 0,
    canUse: !reason, reason, usedThisTurn: Boolean(player?.cardUsedThisTurn), cards,
  };
}

async function prepareInventoryCard(player, card, sid) {
  if (["teleport", "boost", "slow", "rewind", "reverse"].includes(card.id)) {
    let target = await chooseCardTarget(player, card, sid);
    if (!isSessionActive(sid) || !target) return null;
    if (card.id === "boost" || card.id === "slow") {
      const effect = card.id === "boost" ? "speedBoost" : "speedSlow";
      if (player.isAi && (target === "self" ? player : getOpponent(player)).effects[effect]) {
        target = target === "self" ? "opponent" : "self";
      }
      if ((target === "self" ? player : getOpponent(player)).effects[effect]) return null;
    }
    return { target };
  }
  if (card.id === "launch" && !player.isAi) {
    const buttons = Array.from({ length: 6 }, (_, i) => {
      const steps = i + 1, preview = previewMovement(player, steps), tile = state.board[preview.index];
      return { id: String(steps), label: `${steps} 步 → ${preview.uncertain ? "岔路待选" : tile.name}`, variant: "primary" };
    });
    buttons.unshift({ id: "cancel", label: "暂不使用", variant: "ghost" });
    const choice = await showModal({ label: "使用卡牌", title: "🎯 命定骰 · 选择步数", message: card.description, buttons });
    if (!isSessionActive(sid) || !/^[1-6]$/.test(choice)) return null;
    return { steps: Number(choice) };
  }
  if (card.id === "propertySwap" && !player.isAi) {
    const lots = state.board.filter(t => t.lot?.ownerId === player.id && !t.isLargeSecondary);
    const choice = await showModal({
      label: "使用卡牌", title: "🔀 地产互换 · 选择交出的地产",
      message: "随机获得对手的一块地产，双方建筑等级保留。",
      buttons: [{ id: "cancel", label: "暂不使用", variant: "ghost" }, ...lots.map(t => ({ id: String(t.index), label: `${t.name}（Lv.${t.lot.level}）`, variant: "primary" }))],
    });
    if (!isSessionActive(sid) || !lots.some(t => String(t.index) === choice)) return null;
    return { giveIdx: Number(choice) };
  }
  return {};
}

async function useInventoryCard(player, instanceId, ai = false) {
  const blocked = cardTurnBlock(player, ai);
  if (blocked) return { ok: false, reason: blocked };
  const item = player.cards?.find(c => c.instanceId === instanceId || c.cardId === instanceId);
  const card = CARD_POOL.find(c => c.id === item?.cardId);
  if (!item || !card) return { ok: false, reason: "背包中没有这张卡牌" };
  const invalid = cardEffectBlock(player, card);
  if (invalid) return { ok: false, reason: invalid };
  const sid = state.sessionId;
  state.cardUsePending = true; state.busy = true; state.phase = "locked";
  hideModal(false); render();
  try {
    const prepared = await prepareInventoryCard(player, card, sid);
    if (!isSessionActive(sid)) return { ok: false, reason: "对局已切换" };
    if (!prepared) return { ok: false, cancelled: true, reason: "已保留卡牌" };
    const changed = cardEffectBlock(player, card);
    if (changed) return { ok: false, reason: changed };
    // Consume only after a valid choice, but before any awaited effect can be clicked twice.
    player.cards.splice(player.cards.indexOf(item), 1);
    player.cardUsedThisTurn = true;
    state.busy = true; state.phase = "locked";
    hideModal(false);
    pushLog(`${player.name} 使用了 ${card.icon} ${card.name}。`);
    await executeCardEffect(player, card, sid, prepared);
    if (isSessionActive(sid) && card.id === "launch") {
      player.cardDeferredRest = {
        hotSpringRest: player.effects.hotSpringRest,
        bankruptcyRelief: player.effects.bankruptcyRelief,
      };
    }
    return { ok: true, cardId: card.id };
  } finally {
    if (isSessionActive(sid)) {
      state.cardUsePending = false;
      setTargetHighlight(false);
      if (!state.gameOver) {
        if (player.isAi) setAiTurnStatus();
        else setHumanTurnStatus();
      }
      render();
    }
  }
}

async function useAiInventoryCard(player) {
  if (cardTurnBlock(player, true)) return;
  const enemyOwns = state.board.some(t => t.lot?.ownerId === getOpponent(player).id);
  const candidates = (player.cards || []).map(item => ({ item, card: CARD_POOL.find(c => c.id === item.cardId) }))
    .filter(({ card }) => card && !cardEffectBlock(player, card) && (card.id !== "shield" || enemyOwns));
  if (!candidates.length) return;
  const selected = aiChooseCard(candidates.map(c => c.card), player);
  await useInventoryCard(player, candidates.find(c => c.card.id === selected.id).item.instanceId, true);
}

window.GameCards = {
  getSnapshot: getCardInventory,
  getInventory: getCardInventory,
  getShopSnapshot: () => {
    const visit = state.itemShopVisit;
    if (!itemShopVisitIsActive(visit)) return null;
    return { playerId: visit.player.id, tileIndex: visit.tileIndex, cash: visit.player.cash,
      offers: visit.offers.map(card => ({ ...card, price: ITEM_SHOP_PRICES[card.id], affordable: visit.player.cash >= ITEM_SHOP_PRICES[card.id] })) };
  },
  use: instanceId => useInventoryCard(state.players?.find(p => p.id === "human"), instanceId),
  grant: grantInventoryCard,
  // A future entry flow can apply an already-authorized loadout once, before initiative.
  // This hook does not spend warehouse money or create a second currency.
  applyLoadout(playerId, cardIds, reference = "") {
    const player = state.players?.find(p => p.id === playerId);
    if (!player || state.initiativeResolved || state.gameOver || player.cardLoadoutApplied || !Array.isArray(cardIds) ||
        cardIds.some(id => !CARD_POOL.some(card => card.id === id))) return [];
    player.cardLoadoutApplied = true;
    return cardIds.map(id => grantInventoryCard(playerId, id, { type: "loadout", reference }));
  },
};

function drawInventoryCardOffers(tile = null) {
  const remaining = [...CARD_POOL], drawn = [];
  const guaranteedId = state.currentMapId === "harbor" && state.board[tile?.index] === tile &&
    tile?.special?.type === "card_draw" ? tile.special.guaranteedCardId : null;
  const guaranteedIndex = remaining.findIndex(card => card.id === guaranteedId);
  if (guaranteedIndex >= 0) drawn.push(remaining.splice(guaranteedIndex,1)[0]);
  while (remaining.length && drawn.length < 3) {
    const weight = card => state.currentMapId === "harbor" && card.id === "boost" ? 3 : 1;
    let ticket = Math.random() * remaining.reduce((sum,card) => sum + weight(card),0);
    let index = remaining.findIndex(card => (ticket -= weight(card)) < 0);
    if (index < 0) index = remaining.length - 1;
    drawn.push(remaining.splice(index,1)[0]);
  }
  return drawn;
}

async function resolveCardDraw(player, sid, tile = state.board[player.position]) {
  playSound("card", { rate: 1.02 });
  const drawn = drawInventoryCardOffers(tile);
  let selected;

  if (player.isAi) {
    selected = aiChooseCard(drawn, player);
    pushLog(`${player.name} 翻牌选择了 ${selected.icon} ${selected.name}。`);
    await showContinueModal({
      label: "翻牌事件", title: `AI 选择了 ${selected.icon} ${selected.name}`,
      message: "",
    });
    if (!isSessionActive(sid)) return;
  } else {
    const dec = await showModal({
      label: "翻牌奖励", title: "选一张道具卡", message: "",
      cardDraw: true,
      buttons: drawn.map((c) => ({
        id: c.id,
        label: `<span class="card-icon">${c.icon}</span><span class="card-name">${c.name}</span><span class="card-desc">${c.description}</span>`,
        variant: "primary",
      })),
    });
    if (!isSessionActive(sid)) return;
    selected = drawn.find((c) => c.id === dec);
    if (!selected) return;
    pushLog(`${player.name} 选择了 ${selected.icon} ${selected.name}。`);
  }

  grantInventoryCard(player.id, selected.id, { type: "tile", tileIndex: player.position });
  pushLog(`${selected.icon} ${selected.name} 已存入 ${player.name} 的背包。`);
  render();
}

function setTargetHighlight(enabled) {
  state.targetSelection = enabled;
  document.body.classList.toggle("selecting-target", enabled);
  document.querySelectorAll(".token").forEach((el) => {
    el.classList.toggle("token-target-highlight", enabled);
  });
}

async function chooseCardTarget(player, card, sid) {
  if (player.isAi) {
    const opp = getOpponent(player);
    const myLots = state.board.filter((t) => t.lot?.ownerId === player.id && !t.isLargeSecondary);
    const oppLots = state.board.filter((t) => t.lot?.ownerId === opp.id && !t.isLargeSecondary);
    switch (card.id) {
      case "teleport": return "opponent";
      case "boost": {
        let dangerousOutcomes = 0;
        for (let s = 2; s <= 12; s++) {
          const idx = previewMovement(opp, s).index;
          const t = state.board[idx];
          if (t.lot?.ownerId === player.id && t.lot.level >= 2) dangerousOutcomes += 6-Math.abs(7-s);
        }
        if (dangerousOutcomes >= 12) return "opponent";
        return "self";
      }
      case "slow": {
        for (let s = 1; s <= 3; s++) {
          const idx = previewMovement(player, s).index;
          const t = state.board[idx];
          if ((t.lot && !t.lot.ownerId) || (t.lot?.ownerId === player.id && t.lot.level < 3)) return "self";
        }
        return "opponent";
      }
      case "rewind": return oppLots.length > 0 ? "opponent" : "self";
      case "reverse": return "opponent";
      default: return "opponent";
    }
  }
  setTargetHighlight(true);
  render();
  const blockedEffect = card.id === "boost" ? "speedBoost" : card.id === "slow" ? "speedSlow" : null;
  const targets = [
    { id: "self", label: "对自己使用", variant: "primary" },
    { id: "opponent", label: "对对手使用", variant: "danger" },
  ].filter(target => !blockedEffect || !(target.id === "self" ? player : getOpponent(player)).effects[blockedEffect]);
  const choice = await showModal({
    label: "卡牌效果",
    title: `${card.icon} ${card.name} — 选择目标`,
    message: card.description,
    buttons: [
      { id: "cancel", label: "暂不使用", variant: "ghost" },
      ...targets,
    ],
  });
  if (!isSessionActive(sid)) return null;
  setTargetHighlight(false);
  return ["self", "opponent"].includes(choice) ? choice : null;
}

async function executeCardEffect(player, card, sid, prepared = {}) {
  const opp = getOpponent(player);

  switch (card.id) {
    case "teleport": {
      const target_who = prepared.target || await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid) || !target_who) return;
      const target_player = target_who === "self" ? player : opp;
      playSound("special", { rate: 1.1 });
      const lots = state.board.filter((t) => t.lot !== null);
      if (lots.length === 0) break;
      const dest = lots[Math.floor(Math.random() * lots.length)];
      target_player.position = dest.index;
      resetHarborJourney(target_player);
      state.animation.landedTile = dest.index;
      pushLog(`传送术！${target_player.name} 被传送到 ${dest.name}！`);
      render();
      await showContinueModal({ label: "卡牌效果", title: `${target_player.name} 传送到 ${dest.name}！`, message: "" });
      break;
    }
    case "launch": {
      playSound("special", { rate: 1.06 });
      let steps;
      if (prepared.steps) steps = prepared.steps;
      else if (player.isAi) {
        let bestStep = 1, bestScore = -9999;
        for (let s = 1; s <= 6; s++) {
          const idx = previewMovement(player, s).index;
          const t = state.board[idx];
          let score = 0;
          if (t.lot && !t.lot.ownerId) score += 5;
          else if (t.lot?.ownerId === player.id && t.lot.level < 3) score += 4;
          else if (t.lot?.ownerId === opp.id) score -= t.lot.tolls[t.lot.level] / 40;
          if (t.isSpecial && (t.special.type === "card_draw" || t.special.type === "construction")) score += 3;
          if (score > bestScore) { bestScore = score; bestStep = s; }
        }
        steps = bestStep;
      } else {
        const btns = [];
        for (let s = 1; s <= 6; s++) {
          const preview = previewMovement(player, s);
          btns.push({ id: String(s), label: `${s} 步 → ${preview.uncertain ? "岔路待选" : state.board[preview.index].name}`, variant: "primary" });
        }
        const choice = await showModal({
          label: "卡牌效果", title: "🎯 命定骰 — 选择步数",
          message: "",
          buttons: btns,
        });
        if (!isSessionActive(sid)) return;
        steps = parseInt(choice, 10) || 1;
      }
      pushLog(`命定骰！${player.name} 选择前进 ${steps} 步！`);
      await showContinueModal({ label: "卡牌效果", title: "命定骰", message: `${player.name} · 前进 ${steps} 步` });
      if (!isSessionActive(sid)) return;
      if (await animateMovement(player, steps, sid) === false) return;
      if (!isSessionActive(sid) || state.gameOver) return;
      state.animation.currentTile = null;
      state.animation.landedTile = player.position;
      render();
      await resolveLanding(player, state.board[player.position], sid);
      break;
    }
    case "rewind": {
      const target_who = prepared.target || await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid) || !target_who) return;
      const target_player = target_who === "self" ? player : opp;
      playSound("special", { rate: 0.94 });
      pushLog(`时光回溯！${target_player.name} 被迫后退 3 步！`);
      await showContinueModal({ label: "卡牌效果", title: "时光回溯", message: `${target_player.name} · 后退 3 步` });
      if (!isSessionActive(sid)) return;
      if (await animateMovement(target_player,3,sid,{direction:target_player.effects.reversed ? 1 : -1,payStart:false}) === false) return;
      state.animation.currentTile = null;
      state.animation.landedTile = target_player.position;
      render();
      await showContinueModal({ label: "卡牌效果", title: `${target_player.name} 到达 ${state.board[target_player.position].name}`, message: "" });
      break;
    }
    case "swap": {
      playSound("special", { rate: 1 });
      const tmp = player.position;
      player.position = opp.position;
      opp.position = tmp;
      resetHarborJourney(player); resetHarborJourney(opp);
      pushLog(`换位魔法！${player.name} 和 ${opp.name} 交换了位置！`);
      state.animation.landedTile = player.position;
      render();
      await showContinueModal({
        label: "卡牌效果", title: "换位魔法！",
        message: `${player.name} 现在在 ${state.board[player.position].name}，${opp.name} 在 ${state.board[opp.position].name}。`,
      });
      break;
    }
    case "boost": {
      const target_who = prepared.target || await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid) || !target_who) return;
      const target_player = target_who === "self" ? player : opp;
      target_player.effects.speedBoost = true;
      pushLog(`双骰卡！${target_player.name} 下次同时掷两颗骰子！`);
      await showContinueModal({ label: "卡牌效果", title: "双骰卡", message: `${target_player.name} · 下次掷两颗骰子` });
      break;
    }
    case "slow": {
      const target_who = prepared.target || await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid) || !target_who) return;
      const target_player = target_who === "self" ? player : opp;
      target_player.effects.speedSlow = true;
      pushLog(`减速陷阱！${target_player.name} 下次掷骰减半！`);
      await showContinueModal({ label: "卡牌效果", title: "减速陷阱", message: `${target_player.name} · 下次骰点减半` });
      break;
    }
    case "freeze":
      if (opp.effects.bankruptcyRelief) {
        pushLog(`绊脚术对 ${opp.name} 无效！对方正在救助休整中，免疫控制效果。`);
        await showContinueModal({ label: "卡牌效果", title: "🪤 绊脚术 — 无效！", message: `${opp.name} 正处于破产救助状态，免疫绊脚术！` });
      } else {
        opp.effects.frozen = true;
        const restNote = opp.effects.hotSpringRest ? "对方正在温泉休息，绊脚与休息同时结束，不重复收租或追加休息。" : "下回合无法移动，但仍需结算当前所在地块！";
        pushLog(`绊脚术！${opp.name} 被绊住。${restNote}`);
        await showContinueModal({ label: "卡牌效果", title: "🪤 绊脚术！", message: `${opp.name} 被绊住。${restNote}` });
      }
      break;
    case "combo":
      player.effects.extraTurn = true;
      pushLog(`连击鼓！${player.name} 将获得额外回合！`);
      await showContinueModal({ label: "卡牌效果", title: "连击鼓", message: `${player.name} · 再行动一次` });
      break;
    case "shield":
      player.effects.shield = true;
      pushLog(`护盾术！${player.name} 将免疫下一次过路费！`);
      await showContinueModal({ label: "卡牌效果", title: "护盾术", message: `${player.name} · 获得护盾` });
      break;
    case "doubleRent":
      player.effects.doubleRent = true;
      pushLog(`收租翻倍！${player.name} 的地产下次被踩收费×2！`);
      await showContinueModal({ label: "卡牌效果", title: "收租翻倍", message: `${player.name} · 下次租金 ×2` });
      break;
    case "propertySwap": {
      playSound("special", { rate: 1.02 });
      const myLots = state.board.filter((t) => t.lot?.ownerId === player.id && !t.isLargeSecondary);
      const oppLots = state.board.filter((t) => t.lot?.ownerId === opp.id && !t.isLargeSecondary);
      if (myLots.length === 0 || oppLots.length === 0) {
        const b = 100;
        updatePlayerCash(player, b, false);
        const reason = myLots.length === 0 ? "你没有地产可交出" : "对手没有地产可获取";
        pushLog(`地产互换失败：${reason}，获得 ${formatMoney(b)} 补偿。`);
        await showContinueModal({ label: "卡牌效果", title: "地产互换 — 无法执行", message: `${reason}，改为获得 ${formatMoney(b)} 补偿金。` });
        break;
      }
      let giveIdx;
      if (Number.isInteger(prepared.giveIdx)) giveIdx = prepared.giveIdx;
      else if (player.isAi) {
        const sorted = [...myLots].sort((a, b) => (a.lot.level + a.lot.price / 100) - (b.lot.level + b.lot.price / 100));
        giveIdx = sorted[0].index;
      } else {
        const btns = myLots.map((t) => ({
          id: String(t.index),
          label: `${t.name}（Lv.${t.lot.level}）`,
          variant: "primary",
        }));
        const dec = await showModal({
          label: "卡牌效果", title: "🔀 地产互换 — 选择交出的地产",
          message: "随机换取对手一处地产",
          buttons: btns,
        });
        if (!isSessionActive(sid)) return;
        giveIdx = parseInt(dec, 10);
        if (isNaN(giveIdx)) giveIdx = myLots[0].index;
      }
      const giveTile = state.board[giveIdx];
      const getTile = oppLots[Math.floor(Math.random() * oppLots.length)];
      giveTile.lot.ownerId = opp.id;
      getTile.lot.ownerId = player.id;
      syncHarborProjects();
      if (giveTile.lot.isLarge) {
        const sec = state.board.find((t) => t.isLargeSecondary && t.largePrimaryIndex === giveTile.index);
        if (sec) sec.lot = giveTile.lot;
      }
      if (getTile.lot.isLarge) {
        const sec = state.board.find((t) => t.isLargeSecondary && t.largePrimaryIndex === getTile.index);
        if (sec) sec.lot = getTile.lot;
      }
      pushLog(`地产互换！${player.name} 交出 ${giveTile.name}（Lv.${giveTile.lot.level}），获得 ${getTile.name}（Lv.${getTile.lot.level}）！`);
      render();
      await showContinueModal({
        label: "卡牌效果", title: "地产互换完成！",
        message: `交出：${giveTile.name}（Lv.${giveTile.lot.level}）\n获得：${getTile.name}（Lv.${getTile.lot.level}）`,
      });
      break;
    }
    case "reverse": {
      const target_who = prepared.target || await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid) || !target_who) return;
      const target_player = target_who === "self" ? player : opp;
      target_player.effects.reversed = !target_player.effects.reversed;
      const dirText = state.currentMapId === "harbor" ? (target_player.effects.reversed ? "沿路线反向" : "沿路线正向") : (target_player.effects.reversed ? "逆时针" : "顺时针");
      pushLog(`逆行术！${target_player.name} 的前进方向变为${dirText}！`);
      render();
      await showContinueModal({
        label: "卡牌效果", title: "🔃 逆行术！",
        message: `${target_player.name} 的前进方向已变为${dirText}！`,
      });
      break;
    }
  }
}

function purchaseBuildingNote(lot) {
  return lot.level > 0
    ? `Lv.${lot.level} · 租金 ${formatMoney(lot.tolls[lot.level])}`
    : "";
}

function buyLot(player, tile, animate = true) {
  const lot = tile.lot;
  if (player.cash < lot.price) {
    pushLog(`${player.name} 资金不足，无法购买 ${tile.name}。`);
    return false;
  }
  updatePlayerCash(player, -lot.price, animate);
  lot.ownerId = player.id;
  syncHarborProjects();
  playSound("buy", { rate: lot.isLarge ? 0.92 : 1 });
  pushLog(`${player.name} 花 ${formatMoney(lot.price)} 买下了 ${tile.name}。`);
  return true;
}

function buildLot(player, tile, animate = true) {
  const lot = tile.lot;
  const next = lot.level + 1;
  const cost = lot.buildCosts[next];
  updatePlayerCash(player, -cost, animate);
  lot.level = next;
  harborBuildingMilestone(player, tile);
  playSound("build", { rate: 0.96 + next * 0.03 });
  pushLog(`${player.name} 花 ${formatMoney(cost)} 将 ${tile.name} 升到 Lv.${next}。`);
}

function collectToll(visitor, owner, tile) {
  const distTiles = getDistrictOwnerLots(tile.lot.district, owner.id);
  const cnt = distTiles.length;
  let mult = getDistrictTollMultiplier(cnt);
  let doubleActive = false;
  if (owner.effects.doubleRent) { mult *= 2; owner.effects.doubleRent = false; doubleActive = true; }
  const base = distTiles.reduce((s, t) => s + t.lot.tolls[t.lot.level], 0);
  const toll = Math.round(base * mult);
  const actual = Math.max(0, Math.min(visitor.cash, toll));
  updatePlayerCash(visitor, -actual, false);
  updatePlayerCash(owner, actual, false);
  playSound("toll", { rate: doubleActive ? 0.9 : 1 });
  const mText = mult > 1 ? `，系数 x${mult}` : "";
  const dText = doubleActive ? "（收租翻倍生效！）" : "";
  if (actual < toll) pushLog(`${visitor.name} 现金不足，仅支付 ${formatMoney(actual)} 给 ${owner.name}。`);
  else pushLog(`${visitor.name} 支付 ${formatMoney(actual)} 过路费给 ${owner.name}。`);
  return {
    actualPayment: actual, toll,
    message: `${tile.lot.district}连锁收费：${owner.name} 拥有 ${cnt} 块地${mText}${dText}，合计 ${formatMoney(actual)}。`,
  };
}

function getDistrictOwnerLots(district, ownerId) {
  const seen = new Set();
  return state.board.filter((t) => {
    if (!t.lot || t.lot.district !== district || t.lot.ownerId !== ownerId) return false;
    if (seen.has(t.lot)) return false;
    seen.add(t.lot); return true;
  });
}

function getDistrictTollMultiplier(n) {
  if (n >= 3) return 1.5;
  if (n === 2) return 1.2;
  return 1;
}

function findUpgradeableOwnedLot(pid) {
  const c = state.board.filter((t) => t.lot?.ownerId === pid && t.lot.level < 3 && !t.isLargeSecondary);
  if (!c.length) return null;
  return c.sort((a, b) => a.lot.level - b.lot.level || a.lot.price - b.lot.price)[0];
}

function shouldAiBuy(player, lot) {
  if (player.cash < lot.price) return false;
  const reserve = 180;
  const distOwned = getDistrictOwnerLots(lot.district, player.id);
  const distTotal = new Set(state.board.filter((t) => t.lot && t.lot.district === lot.district).map((t) => t.lot)).size;
  if (distOwned.length + 1 >= distTotal && player.cash - lot.price >= 60) return true;
  const oppOwns = state.board.filter((t) => t.lot && t.lot.district === lot.district && t.lot.ownerId && t.lot.ownerId !== player.id).length;
  if (oppOwns >= 2 && player.cash - lot.price >= reserve) return true;
  return player.cash - lot.price >= reserve || lot.price <= 120;
}

function shouldAiBuild(player, lot, cost) {
  const reserve = 150;
  const dist = getDistrictOwnerLots(lot.district, player.id);
  if (dist.length >= 2 && player.cash - cost >= 100) return true;
  if (lot.level === 0 && player.cash - cost >= reserve) return true;
  return player.cash - cost >= reserve * 1.5;
}

function aiChooseCard(cards, player) {
  const opp = getOpponent(player);
  const myLots = state.board.filter((t) => t.lot?.ownerId === player.id && !t.isLargeSecondary).length;
  const oppLots = state.board.filter((t) => t.lot?.ownerId === opp.id && !t.isLargeSecondary).length;
  // A stored card can wait for a useful turn. Avoid choosing another trap
  // while one is already pending, but still accept it if it is the only reward.
  const redundantFreeze = opp.effects.hotSpringRest || opp.effects.frozen || opp.effects.bankruptcyRelief;
  const prio = {
    rewind: oppLots > 0 ? 9 : 2, freeze: redundantFreeze ? -1 : oppLots > 0 ? 7 : 3,
    slow: oppLots > 0 ? 7 : 3, doubleRent: myLots >= 2 ? 8 : 2,
    combo: 6, boost: 5, shield: oppLots >= 3 ? 7 : 3,
    launch: 6, teleport: 5, swap: 4,
    propertySwap: (myLots > 0 && oppLots > 0) ? 6 : 1,
    reverse: 5,
  };
  return [...cards].sort((a, b) => (prio[b.id] ?? 3) - (prio[a.id] ?? 3))[0];
}

function endTurn() {
  if (state.gameOver) return;
  hideModal(false); clearHighlights(); state.busy = false;
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  resetDiceDisplay();
  currentPlayer().cardUsedThisTurn = false;
  if (state.currentPlayerIndex === state.firstPlayerIndex) state.round += 1;
  if (state.gameMode === "rounds" && state.round > getMaxRounds()) { finishGame("rounds"); return; }
  if (currentPlayer().isAi) { setAiTurnStatus(); render(); void startAiTurnWithDelay(state.sessionId); }
  else { setHumanTurnStatus(); render(); }
}

async function startAiTurnWithDelay(sid) {
  await sleep(720);
  if (isSessionActive(sid) && currentPlayer().isAi && !state.gameOver) await playAiTurn();
}

function finishGame(reason = "rounds") {
  if (state.gameOver) return;
  state.gameOver = true; state.phase = "locked"; state.busy = false; hideModal(false);
  const rank = [...state.players].sort((a, b) => b.cash - a.cash);
  const top = rank[0];
  const tied = rank.filter((p) => p.cash === top.cash);
  const roundLabel = reason === "bankruptcy" ? "破产淘汰" : `第 ${state.round - 1} 回合`;
  if (tied.length > 1) {
    state.statusTitle = "游戏结束：平局";
    state.statusDescription = `${tied.map((p) => p.name).join("、")} 以 ${formatMoney(top.cash)} 并列第一。`;
    pushLog(`${roundLabel}结束，平局！双方 ${formatMoney(top.cash)}。`);
  } else {
    state.statusTitle = "游戏结束";
    state.statusDescription = `${top.name} 以 ${formatMoney(top.cash)} 获胜！`;
    const loser = rank[rank.length - 1];
    pushLog(`${roundLabel}结束，${top.name}（${formatMoney(top.cash)}）击败${loser.name}（${formatMoney(loser.cash)}）！`);
  }
  const winnerId = tied.length > 1 ? "draw" : top.id;
  const mapCfg = getMapConfig(state.currentMapId);
  state.citySettlement = window.GameProgression?.settle({
    runId: state.runId, mapId: mapCfg.id, mapName: mapCfg.name, mode: state.gameMode,
    reason, rounds: reason === "rounds" ? state.round - 1 : state.round,
    humanCash: state.players.find(p => p.id === "human").cash, winnerId,
    collectionCount: 1 + Number(winnerId === "human") + Number(state.board.some(t => !t.isLargeSecondary && t.lot?.isLarge && t.lot.ownerId === "human" && t.lot.level === 3)),
    harborProjectRewards: getHarborProjectSnapshot().filter(project => project.stage === 3).map(project => project.id),
    eligible: state.isFormalRun === true,
    buildingCards: getHarborBuildingRewards(),
    buildingCardDraft: mapCfg.id === 'harbor',
  });
  if (state.isFormalRun) saveGameResult(reason, winnerId);
  playSound("win");
  render();
  window.GamePresentation?.celebrate(top, tied.length > 1);
}

function getWinnerText() {
  if (!state.gameOver) return "";
  const r = [...state.players].sort((a, b) => b.cash - a.cash);
  if (r[0].cash === r[1].cash) return `平局：双方 ${formatMoney(r[0].cash)}。`;
  return `胜者：${r[0].name}，最终现金 ${formatMoney(r[0].cash)}。`;
}

function municipalTargetLabel(tile) {
  const steps = state.board.filter(t => t.index === tile.index || t.isLargeSecondary && t.largePrimaryIndex === tile.index).map(t => t.index + 1);
  return `第 ${steps.join("、")} 格 · ${tile.name}`;
}

function previewMunicipalTarget(index) {
  const m = state.modal;
  if (!m.visible || !m.boardTargets?.length) return false;
  let tile = state.board[index];
  if (tile?.isLargeSecondary) tile = state.board[tile.largePrimaryIndex];
  if (!tile || !m.boardTargets.includes(tile.index)) return false;
  m.selectedTarget = tile.index;
  window.GamePresentation?.selectTile(tile.index);
  render();
  return true;
}

function showModal({ label = "行动提示", title, message, buttons, cardDraw = false, itemShop = false, boardTargets = null, selectedTarget = null, boardContext = null, openingCoin = null, routeChoice = null }) {
  cancelOpeningCoinToss();
  if (modalResolver) { modalResolver("cancel"); modalResolver = null; }
  state.modal = { visible: true, label, title, message, buttons, cardDraw, itemShop, boardTargets, boardContext, openingCoin, routeChoice, selectedTarget: selectedTarget ?? boardTargets?.[0] ?? null };
  if (boardTargets?.length) window.GamePresentation?.selectTile(state.modal.selectedTarget);
  else if (boardContext) window.GamePresentation?.selectTile(boardContext.selectedTarget);
  else window.GamePresentation?.selectCurrentTile();
  state.phase = "await_modal"; state.busy = false; render();
  return new Promise((r) => { modalResolver = r; });
}

async function returnToStartScreen() {
  if (homeConfirmationPending || openingCoinJob) return;
  if (state.ticketPaid && !state.gameOver) {
    // Movement and presentations must finish before an asynchronous choice can pause the turn.
    if (state.busy && !state.modal.visible) return;
    const previous = { state, modal: state.modal, phase: state.phase, busy: state.busy, resolver: modalResolver };
    homeConfirmationPending = true;
    // Suspend the existing choice without resolving it; cancel must resume that same choice.
    modalResolver = null;
    const action = await showModal({
      label: "返回首页", title: "结束本局并返回首页？",
      message: "本局收益放弃，门票不退。",
      boardContext: previous.modal.boardTargets?.length ? {indices:previous.modal.boardTargets,selectedTarget:previous.modal.selectedTarget} : null,
      buttons: [
        { id: "cancel", label: "继续本局", variant: "ghost" },
        { id: "home", label: "返回首页", variant: "primary" },
      ],
    });
    homeConfirmationPending = false;
    if (state !== previous.state) {
      previous.resolver?.("cancel");
      updateControls();
      return;
    }
    modalResolver = previous.resolver;
    if (action !== "home") {
      state.modal = previous.modal; state.phase = previous.phase; state.busy = previous.busy;
      if (previous.modal.boardTargets?.length) window.GamePresentation?.selectTile(previous.modal.selectedTarget);
      render();
      return;
    }
  }
  initializeGame(); showStartScreen();
}

async function showContinueModal(cfg) {
  if (cfg.openingCoin) {
    const action = await showModal({ ...cfg, buttons: [{ id: "continue", label: "开始行动", variant: "primary" }] });
    flushQueuedCashAnimations();
    return action;
  }
  if (window.GamePresentation) return window.GamePresentation.present(cfg);
  await showModal({ ...cfg, buttons: [{ id: "continue", label: "确定", variant: "primary" }] });
  flushQueuedCashAnimations();
}

function hideModal(shouldResolve = true, actionId = "cancel") {
  cancelOpeningCoinToss();
  const choosingProperty = state.modal.boardTargets?.length && /^seize_\d+$/.test(actionId) || state.modal.boardContext;
  state.modal = defaultModal();
  if (shouldResolve && modalResolver) { const r = modalResolver; modalResolver = null; r(actionId); }
  // Keep the browsing angle across the target picker and its quote panel.
  // The next choice is opened by the resolved promise before this redraw.
  if (choosingProperty) Promise.resolve().then(render);
  else render();
}

function renderDiceFaceSvg(v) {
  const pos = {
    1: [[25,25]], 2: [[12,12],[38,38]], 3: [[12,12],[25,25],[38,38]],
    4: [[12,12],[38,12],[12,38],[38,38]], 5: [[12,12],[38,12],[25,25],[12,38],[38,38]],
    6: [[12,12],[38,12],[12,25],[38,25],[12,38],[38,38]],
  };
  const dots = (pos[v] || pos[1]).map(([x,y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="white"/>`).join("");
  return `<svg viewBox="0 0 50 50" width="100%" height="100%">${dots}</svg>`;
}

function createRegionalBuildingSprite(asset, label) {
  const candidate = new URLSearchParams(location.search).get('artStage') === 'candidate';
  const directory = candidate ? 'art/full-ai-city/packed/previews' : 'assets/buildings/regions';
  const mapId = state?.currentMapId ?? selectedMapId;
  return `<img class="building-sprite" src="${directory}/${mapId}/${asset}.png?v=20261025-facade2" alt="${label}" loading="lazy" decoding="async" draggable="false">`;
}

function createStartSvg() {
  return createRegionalBuildingSprite('civic_hall', '市政府');
}

function createSpecialSvg(type) {
  const asset = { bank:'vault_bank', construction:'builders_guild', card_draw:'card_pavilion', chance:'card_pavilion', teleport:'teleport_gate', rush:'rush_station', junction:'junction_hub' }[type];
  const label = { bank:'金库', construction:'城建局', card_draw:'翻牌驿站', chance:'道具商店', teleport:'传送港', rush:'冲刺站', junction:'交汇广场' }[type];
  return asset ? createRegionalBuildingSprite(asset, label) : '';
}

function createLotBaseSprite(isOwned) {
  const src = isOwned
    ? "assets/buildings/plot-foundation-owned.png"
    : "assets/buildings/plot-empty-unowned.png";
  const alt = isOwned ? "已购地基" : "待售空地";
  return `<img class="building-sprite" src="${src}" alt="${alt}" draggable="false">`;
}

function createBuildingSvg(type, level, color, isLarge = false) {
  return createRegionalBuildingSprite(`${type}_${level}`, `等级 ${level} 建筑`);
}



// ─── 地块 Tooltip ────────────────────────────────────────────────────────────
let tooltipLongPressTimer = null;

function buildTooltipContent(idx) {
  // 若是大地块副格，映射到主格
  let tile = state.board[idx];
  if (!tile) return "";
  if (tile.isLargeSecondary && tile.largePrimaryIndex != null)
    tile = state.board[tile.largePrimaryIndex];

  if (tile.isStart) {
    const preview = `<div class="tt-preview tt-preview-special">${createStartSvg()}</div>`;
    return `<button class="tt-close" aria-label="关闭">✕</button>
      <div class="tt-name">起点 · 市政府</div>
      <span class="tt-badge" style="background:#fde68a;">奖励地块</span>
      ${preview}
      <div class="tt-row">经过自动领取 ¥${getMapEconomy().startBonus}</div>
      <div class="tt-row">停留可强制收购对手一处地产</div>`;
  }

  if (tile.isSpecial) {
    const s = tile.special;
    const preview = `<div class="tt-preview tt-preview-special">${createSpecialSvg(s.type)}</div>`;
    return `<button class="tt-close" aria-label="关闭">✕</button>
      <div class="tt-name">${tile.name}</div>
      <span class="tt-badge" style="background:${s.color};">${s.label}</span>
      ${preview}
      <div class="tt-row">${s.description}</div>`;
  }

  const lot = tile.lot;
  if (!lot) return `<div class="tt-name">${tile.name}</div>`;

  const owner = lot.ownerId ? getPlayerById(lot.ownerId) : null;
  const ownerColor = owner ? owner.color : "#64748b";
  const ownerText = owner ? owner.name : "待售";
  const dots = [1, 2, 3].map(l =>
    `<span class="tt-dot${l <= lot.level ? " filled" : ""}"></span>`).join("");
  const largeMark = lot.isLarge ? `<span class="tt-large-tag">大型</span>` : "";

  // 建筑预览：已建则显示对应等级建筑图，未建则显示地基
  const spriteHtml = lot.level > 0
    ? createBuildingSvg(lot.landmarkKey || lot.theme.key, lot.level, owner?.color ?? "#64748b", lot.isLarge)
    : createLotBaseSprite(!!lot.ownerId);
  // 背景色用主题色淡化，与格子保持一致感
  const previewBg = lot.level > 0
    ? `background:linear-gradient(160deg,${lot.theme.color}33,${lot.theme.color}11)`
    : `background:rgba(255,255,255,0.04)`;
  const preview = `<div class="tt-preview" style="${previewBg}">${spriteHtml}</div>`;

  let tollBlock = "";
  if (owner) {
    tollBlock = `<div class="tt-toll">收费 ¥${lot.tolls[lot.level]}</div>
      <div class="tt-toll-label">Lv.0 ¥${lot.tolls[0]}　Lv.1 ¥${lot.tolls[1]}　Lv.2 ¥${lot.tolls[2]}　Lv.3 ¥${lot.tolls[3]}</div>`;
  } else {
    tollBlock = `<div class="tt-price-row"><span>售价 ¥${lot.price}</span><span>基础收费 ¥${lot.tolls[0]}</span></div>`;
  }

  const upgradeHint = (owner && lot.level < 3)
    ? `<div class="tt-upgrade">↑ 升至 Lv.${lot.level + 1} 需 ¥${lot.buildCosts[lot.level + 1]}</div>` : "";

  return `<button class="tt-close" aria-label="关闭">✕</button>
    <div class="tt-name">${tile.name}${largeMark}</div>
    <span class="tt-badge" style="background:${lot.theme.color};">${lot.theme.label}</span>
    <div class="tt-owner-row">
      <span style="color:${ownerColor};font-weight:700;">${ownerText}</span>
      <div class="tt-level-dots">${dots}</div>
    </div>
    ${preview}
    <div class="tt-divider"></div>
    ${tollBlock}
    ${upgradeHint}
    <div class="tt-district">📍 ${lot.district || "—"}</div>`;
}

function positionTooltip(anchorEl) {
  if (!tileTooltipEl) return;
  // 手机 (无 hover 能力): 固定居中
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    tileTooltipEl.style.cssText =
      "left:50%;top:50%;transform:translate(-50%,-50%);";
    return;
  }
  // 桌面: 贴近格子，避免超出视口
  const r = anchorEl.getBoundingClientRect();
  const w = 218, h = tileTooltipEl.offsetHeight || 260;
  let left = r.right + 10;
  let top = r.top;
  if (left + w > window.innerWidth - 8) left = r.left - w - 10;
  if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
  if (top < 8) top = 8;
  tileTooltipEl.style.cssText = `left:${left}px;top:${top}px;transform:none;`;
}

function showTileTooltip(idx, anchorEl) {
  if (!tileTooltipEl || !state.board) return;
  tileTooltipEl.innerHTML = buildTooltipContent(idx);
  tileTooltipEl.classList.remove("hidden");
  positionTooltip(anchorEl);
  // 关闭按钮 (手机)
  tileTooltipEl.querySelector(".tt-close")?.addEventListener("click", hideTileTooltip);
}

function hideTileTooltip() {
  tileTooltipEl?.classList.add("hidden");
}

// 桌面: 鼠标悬浮
boardEl.addEventListener("mouseover", (e) => {
  const tile = e.target.closest(".tile[data-tile-index]");
  if (!tile) { hideTileTooltip(); return; }
  showTileTooltip(Number(tile.dataset.tileIndex), tile);
});
boardEl.addEventListener("mouseleave", hideTileTooltip);

// 手机: 长按 500ms
boardEl.addEventListener("touchstart", (e) => {
  const tile = e.target.closest(".tile[data-tile-index]");
  if (!tile) return;
  clearTimeout(tooltipLongPressTimer);
  tooltipLongPressTimer = setTimeout(() => {
    showTileTooltip(Number(tile.dataset.tileIndex), tile);
  }, 500);
}, { passive: true });
boardEl.addEventListener("touchend",   () => clearTimeout(tooltipLongPressTimer), { passive: true });
boardEl.addEventListener("touchmove",  () => clearTimeout(tooltipLongPressTimer), { passive: true });
// 点击棋盘空白处关闭
boardEl.addEventListener("click", (e) => {
  if (!e.target.closest(".tile")) hideTileTooltip();
});

eventActionsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (btn) hideModal(true, btn.dataset.action);
});
eventActionsEl.addEventListener("change", (e) => {
  if (e.target.matches("[data-city-target]")) {
    const hadFocus = document.activeElement === e.target;
    previewMunicipalTarget(Number(e.target.value));
    if (hadFocus) eventActionsEl.querySelector("[data-city-target]")?.focus({preventScroll:true});
  }
});
soundToggleBtn?.addEventListener("click", () => {
  const nextEnabled = !soundState.enabled;
  setSoundEnabled(nextEnabled);
  if (nextEnabled) playSound("card", { volumeMultiplier: 0.55, rate: 1.06 });
});
musicToggleBtn?.addEventListener("click", () => {
  unlockBgmPlayback();
  setMusicEnabled(!bgmState.enabled);
});
document.addEventListener("pointerdown", unlockBgmPlayback, { once: true });
document.addEventListener("keydown", unlockBgmPlayback, { once: true });
document.addEventListener("visibilitychange", syncBgmPlayback);
window.addEventListener("pagehide", () => { if (openingCoinJob) hideModal(); });
rollBtn.addEventListener("click", () => void playHumanTurn());
restartBtn.addEventListener("click", () => void returnToStartScreen());
scoreboardEl.addEventListener("click", (e) => {
  if (e.target.closest(".play-again-btn")) void startNewGame();
  if (e.target.closest(".view-history-btn")) showHistoryOverlay();
});
warmSoundCache();
ensureBgmEngine();
ensureFallbackBgmAudio();
showStartScreen();
