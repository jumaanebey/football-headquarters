// server/authorityStore.ts
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var uuid = (value) => {
  if (!UUID.test(value)) throw new TypeError("Invalid authority identifier.");
  return value;
};
var record = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuthorityStoreUnavailable();
  return value;
};
var integer = (value) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new AuthorityStoreUnavailable();
  return value;
};
var timestamp = (value) => {
  const result = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(result) || result < 0) throw new AuthorityStoreUnavailable();
  return result;
};
var AuthorityStoreUnavailable = class extends Error {
  constructor() {
    super("Club service is temporarily unavailable.");
    this.name = "AuthorityStoreUnavailable";
  }
};
var clubFromRow = (value) => {
  const row = record(value);
  return {
    owner: uuid(String(row.pid)),
    state: record(row.state),
    revision: integer(row.revision),
    activeMatch: row.active_match == null ? null : uuid(String(row.active_match)),
    origin: String(row.origin),
    updatedAt: timestamp(row.updated_at)
  };
};
var matchFromRow = (value) => {
  const row = record(value);
  if (!["reserved", "started", "settled", "cancelled"].includes(String(row.status))) throw new AuthorityStoreUnavailable();
  return {
    id: uuid(String(row.id)),
    owner: uuid(String(row.owner)),
    status: row.status,
    config: record(row.config),
    seed: integer(row.seed),
    issuedAt: timestamp(row.issued_at),
    expiresAt: timestamp(row.expires_at),
    metadata: record(row.metadata),
    result: row.result
  };
};
function createSupabaseAuthorityStore(options) {
  if (typeof window !== "undefined") throw new Error("Authority storage is server-only.");
  const base = new URL(options.url);
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new TypeError("Invalid Supabase server URL.");
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) throw new TypeError("HTTPS is required.");
  if (!options.serviceRoleKey || options.serviceRoleKey.startsWith("sb_publishable_")) throw new TypeError("A private server key is required.");
  const send = options.fetch ?? fetch;
  const headers2 = { apikey: options.serviceRoleKey, "Content-Type": "application/json" };
  if (!options.serviceRoleKey.startsWith("sb_secret_")) headers2.Authorization = `Bearer ${options.serviceRoleKey}`;
  const request = async (path, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15e3);
    try {
      const response = await send(new URL(`/rest/v1/${path}`, base), {
        ...init,
        headers: { ...headers2, ...init.headers },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new AuthorityStoreUnavailable();
      return await response.json();
    } catch {
      throw new AuthorityStoreUnavailable();
    } finally {
      clearTimeout(timer);
    }
  };
  const rows = async (path, init) => {
    const result = await request(path, init);
    if (!Array.isArray(result)) throw new AuthorityStoreUnavailable();
    return result;
  };
  const getClub = async (owner) => {
    const result = await rows(`fhq_authority_clubs?pid=eq.${uuid(owner)}&select=pid,state,revision,active_match,origin,updated_at&limit=1`);
    return result.length ? clubFromRow(result[0]) : null;
  };
  return {
    async getConfiguration() {
      const result = await rows("fhq_authority_configuration?singleton=eq.true&select=activation_at&limit=1");
      if (result.length !== 1) throw new AuthorityStoreUnavailable();
      return { activationAt: timestamp(record(result[0]).activation_at) };
    },
    getClub,
    async createClub(owner, state, origin) {
      uuid(owner);
      if (!origin || origin.length > 40) throw new TypeError("Invalid club origin.");
      const result = await rows("fhq_authority_clubs?on_conflict=pid&select=pid,state,revision,active_match,origin,updated_at", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ pid: owner, state, origin })
      });
      if (result.length) return clubFromRow(result[0]);
      const existing = await getClub(owner);
      if (!existing) throw new AuthorityStoreUnavailable();
      return existing;
    },
    async getMatch(owner, id) {
      const result = await rows(`fhq_authority_matches?owner=eq.${uuid(owner)}&id=eq.${uuid(id)}&select=id,owner,status,config,seed,issued_at,expires_at,metadata,result&limit=1`);
      return result.length ? matchFromRow(result[0]) : null;
    },
    async getMatchForParticipant(owner, id) {
      const result = await rows("rpc/fhq_authority_match_film", {
        method: "POST",
        body: JSON.stringify({ requesting_owner: uuid(owner), match_id: uuid(id) })
      });
      return result.length ? matchFromRow(result[0]) : null;
    },
    async findOperation(owner, operationId) {
      const result = await rows(`fhq_authority_operations?owner=eq.${uuid(owner)}&operation_id=eq.${uuid(operationId)}&select=owner,operation_id,request_hash,response&limit=1`);
      if (!result.length) return null;
      const row = record(result[0]);
      return { owner: uuid(String(row.owner)), operationId: uuid(String(row.operation_id)), requestHash: String(row.request_hash), result: row.response };
    },
    async commit(command) {
      uuid(command.owner);
      uuid(command.operationId);
      integer(command.expectedRevision);
      if (!/^[0-9a-f]{64}$/.test(command.requestHash)) throw new TypeError("Invalid operation hash.");
      if (command.target) {
        uuid(command.target.owner);
        integer(command.target.expectedRevision);
      }
      if (command.match) {
        uuid(command.match.id);
        uuid(command.match.owner);
      }
      const result = record(await request("rpc/fhq_authority_commit", { method: "POST", body: JSON.stringify({ command }) }));
      const club = result.club == null ? void 0 : clubFromRow(result.club);
      if (result.ok === true && typeof result.duplicate === "boolean" && club) return { ok: true, duplicate: result.duplicate, club, result: result.result };
      if (result.ok === false && ["revision_conflict", "operation_conflict", "not_found", "match_conflict"].includes(String(result.code))) {
        return { ok: false, code: result.code, ...club ? { club } : {} };
      }
      throw new AuthorityStoreUnavailable();
    },
    async listRivals(owner) {
      const result = await rows("rpc/fhq_authority_rivals", { method: "POST", body: JSON.stringify({ requesting_owner: uuid(owner) }) });
      return result.map((value) => {
        const row = record(value);
        return { owner: uuid(String(row.owner)), name: String(row.name), stadiumLevel: integer(row.stadium_level), fans: integer(row.fans), trophies: integer(row.trophies), revision: integer(row.revision) };
      });
    },
    async getLeaderboard() {
      const result = await rows("rpc/fhq_authority_leaderboard", { method: "POST", body: "{}" });
      return result.map((value) => {
        const row = record(value);
        return { owner: uuid(String(row.owner)), name: String(row.name), stadiumLevel: integer(row.stadium_level), fans: integer(row.fans), trophies: integer(row.trophies), revision: integer(row.revision) };
      });
    }
  };
}

// game/combat/canonical.ts
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === void 0 ? null : item)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter((key) => value[key] !== void 0).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

// types.ts
var ResourceType = /* @__PURE__ */ ((ResourceType2) => {
  ResourceType2["COINS"] = "COINS";
  ResourceType2["GEMS"] = "GEMS";
  ResourceType2["ENERGY"] = "ENERGY";
  ResourceType2["FANS"] = "FANS";
  return ResourceType2;
})(ResourceType || {});
var BuildingType = /* @__PURE__ */ ((BuildingType2) => {
  BuildingType2["TRAINING_PITCH"] = "TRAINING_PITCH";
  BuildingType2["YOUTH_ACADEMY"] = "YOUTH_ACADEMY";
  BuildingType2["TACTICS_ROOM"] = "TACTICS_ROOM";
  BuildingType2["MEDICAL_CENTER"] = "MEDICAL_CENTER";
  BuildingType2["STADIUM"] = "STADIUM";
  return BuildingType2;
})(BuildingType || {});
var DrillState = /* @__PURE__ */ ((DrillState2) => {
  DrillState2["IDLE"] = "IDLE";
  DrillState2["ACTIVE"] = "ACTIVE";
  DrillState2["COMPLETED"] = "COMPLETED";
  return DrillState2;
})(DrillState || {});
var SeasonPhase = /* @__PURE__ */ ((SeasonPhase3) => {
  SeasonPhase3["OFF_SEASON"] = "OFF_SEASON";
  SeasonPhase3["SEASON"] = "SEASON";
  return SeasonPhase3;
})(SeasonPhase || {});
var UnitGroup = /* @__PURE__ */ ((UnitGroup2) => {
  UnitGroup2["OFFENSE_LINE"] = "OFFENSE_LINE";
  UnitGroup2["OFFENSE_SKILL"] = "OFFENSE_SKILL";
  UnitGroup2["DEFENSE_LINE"] = "DEFENSE_LINE";
  UnitGroup2["DEFENSE_SECONDARY"] = "DEFENSE_SECONDARY";
  return UnitGroup2;
})(UnitGroup || {});
var PlayerRole = /* @__PURE__ */ ((PlayerRole3) => {
  PlayerRole3["QB"] = "QB";
  PlayerRole3["RB"] = "RB";
  PlayerRole3["WR"] = "WR";
  PlayerRole3["OL"] = "OL";
  PlayerRole3["DL"] = "DL";
  PlayerRole3["LB"] = "LB";
  PlayerRole3["CB"] = "CB";
  PlayerRole3["S"] = "S";
  return PlayerRole3;
})(PlayerRole || {});
var PlayerRarity = /* @__PURE__ */ ((PlayerRarity2) => {
  PlayerRarity2["COMMON"] = "COMMON";
  PlayerRarity2["RARE"] = "RARE";
  PlayerRarity2["EPIC"] = "EPIC";
  PlayerRarity2["LEGENDARY"] = "LEGENDARY";
  return PlayerRarity2;
})(PlayerRarity || {});
var PlayerState = /* @__PURE__ */ ((PlayerState2) => {
  PlayerState2["IDLE"] = "IDLE";
  PlayerState2["WALKING"] = "WALKING";
  PlayerState2["TRAINING"] = "TRAINING";
  PlayerState2["PATROLLING"] = "PATROLLING";
  return PlayerState2;
})(PlayerState || {});

// constants.ts
var DRILLS = {
  // OFFENSE LINE DRILLS
  "sled_push": {
    id: "sled_push",
    name: "Blocking Sleds",
    targetUnit: "OFFENSE_LINE" /* OFFENSE_LINE */,
    durationSeconds: 10,
    costEnergy: 15,
    rewardCoins: 100,
    rewardXp: 10,
    readinessGain: 5,
    levelReq: 1,
    icon: "Shield"
  },
  // OFFENSE SKILL DRILLS
  "routes": {
    id: "routes",
    name: "Route Tree",
    targetUnit: "OFFENSE_SKILL" /* OFFENSE_SKILL */,
    durationSeconds: 15,
    costEnergy: 20,
    rewardCoins: 150,
    rewardXp: 15,
    readinessGain: 5,
    levelReq: 1,
    icon: "Wind"
  },
  // DEFENSE LINE DRILLS
  "tackle_dummy": {
    id: "tackle_dummy",
    name: "Tackle Dummies",
    targetUnit: "DEFENSE_LINE" /* DEFENSE_LINE */,
    durationSeconds: 12,
    costEnergy: 15,
    rewardCoins: 120,
    rewardXp: 12,
    readinessGain: 5,
    levelReq: 1,
    icon: "Target"
  },
  // SECONDARY DRILLS
  "coverage": {
    id: "coverage",
    name: "Zone Coverage",
    targetUnit: "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */,
    durationSeconds: 15,
    costEnergy: 20,
    rewardCoins: 150,
    rewardXp: 15,
    readinessGain: 5,
    levelReq: 1,
    icon: "Eye"
  },
  // FULL TEAM
  "scrimmage": {
    id: "scrimmage",
    name: "Full Scrimmage",
    targetUnit: "ALL",
    durationSeconds: 60,
    costEnergy: 80,
    rewardCoins: 1e3,
    rewardXp: 100,
    readinessGain: 20,
    levelReq: 5,
    icon: "Users"
  }
};
var INITIAL_BUILDINGS = [
  {
    id: "pitch-1",
    type: "TRAINING_PITCH" /* TRAINING_PITCH */,
    level: 1,
    gridX: 7,
    gridY: 7,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: "IDLE" /* IDLE */
  },
  {
    id: "academy-1",
    type: "YOUTH_ACADEMY" /* YOUTH_ACADEMY */,
    level: 1,
    gridX: 7,
    gridY: 1,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: "IDLE" /* IDLE */
  },
  {
    id: "med-1",
    type: "MEDICAL_CENTER" /* MEDICAL_CENTER */,
    level: 1,
    gridX: 1,
    gridY: 7,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: "IDLE" /* IDLE */
  },
  {
    id: "stadium-1",
    type: "STADIUM" /* STADIUM */,
    level: 1,
    gridX: 4,
    gridY: 4,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: "IDLE" /* IDLE */,
    accrued: 0
  },
  {
    id: "tactics-1",
    type: "TACTICS_ROOM" /* TACTICS_ROOM */,
    level: 1,
    gridX: 1,
    gridY: 1,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: "IDLE" /* IDLE */
  }
];
var BUILDING_INFO = {
  ["TRAINING_PITCH" /* TRAINING_PITCH */]: { name: "Training Field", color: "#10b981", description: "Boosts coins earned from drills." },
  ["YOUTH_ACADEMY" /* YOUTH_ACADEMY */]: { name: "Scouting Dept", color: "#3b82f6", description: "Raises your roster cap so you can sign more players." },
  ["TACTICS_ROOM" /* TACTICS_ROOM */]: { name: "Film Room", color: "#9333ea", description: "Break down the film, sharpen the game plan \u2014 boosts team readiness gained from drills." },
  ["MEDICAL_CENTER" /* MEDICAL_CENTER */]: { name: "Rehab Center", color: "#ef4444", description: "Increases Energy Regen rate." },
  ["STADIUM" /* STADIUM */]: { name: "Stadium", color: "#e2e8f0", description: "Earns ticket revenue (Coins) over time. Upgrade to raise income and storage." }
};
var RALLY_CONFIG = {
  fanCost: 60,
  // Fans spent per rally
  energyGain: 55
  // partial top-up toward the 100 cap
};
var COLLECTOR_CONFIG = {
  ["STADIUM" /* STADIUM */]: {
    resource: "COINS" /* COINS */,
    ratePerSecPerLevel: 1.5,
    // L1 = 1.5 coins/sec (90/min) — passive is a trickle, not a faucet
    capPerLevel: 300,
    // L1 storage cap = 300 (fills in ~3.3min, then you must collect)
    maxOfflineSeconds: 3 * 3600
    // bank up to 3h while away
  }
};
var collectorRate = (type, level) => {
  const cfg = COLLECTOR_CONFIG[type];
  return cfg ? cfg.ratePerSecPerLevel * level : 0;
};
var collectorCap = (type, level) => {
  const cfg = COLLECTOR_CONFIG[type];
  return cfg ? cfg.capPerLevel * level : 0;
};
var HOME_DISPLAY_ANCHORS = {
  ["STADIUM" /* STADIUM */]: { gridX: -1, gridY: 6.5 },
  // pulled in July 11 round 3 — full bowl in frame at default cam
  ["YOUTH_ACADEMY" /* YOUTH_ACADEMY */]: { gridX: 8, gridY: 1 },
  ["MEDICAL_CENTER" /* MEDICAL_CENTER */]: { gridX: 1, gridY: 10 },
  ["TRAINING_PITCH" /* TRAINING_PITCH */]: { gridX: 10, gridY: 10 }
};
var displayAnchorOf = (b) => HOME_DISPLAY_ANCHORS[b.type] ?? { gridX: b.gridX, gridY: b.gridY };
var UPGRADE_CONFIG = {
  baseCost: 1400,
  costMultiplier: 1.7
};
var INITIAL_BUILDERS = 2;
var upgradeDurationSecs = (toLevel) => Math.round(20 * Math.pow(1.4, Math.max(0, toLevel - 2)));
var skipGemCost = (remainingSecs) => Math.max(1, Math.ceil(remainingSecs / 25));
var builderHireCost = (current) => current <= 2 ? 40 : current === 3 ? 100 : 250;
var MAX_BUILDERS = 5;
var RAID_ENERGY = 12;
var PARKING_LOT = {
  maxLevel: 3,
  costs: [8e3, 2e4, 45e3],
  // L0→1, L1→2, L2→3
  compressPerLevel: 0.055
  // 5.5% tighter base per level (L3 ≈ 16.5% longer approach)
};
var CROWD_PULSE = {
  minFans: 300,
  // below this the stands are too quiet to matter
  intervalSecs: 10,
  slowSecs: (fans) => 0.8 + Math.min(1.7, fans / 1500)
  // 2,873 fans ≈ 2.7s stall
};
var DEFENSE_TYPES = [
  { kind: "jugs", name: "JUGS Machine", sprite: "/assets/battle/jugs-machine.webp", emoji: "\u{1F3C8}", desc: "Rapid-fire football launcher", cost: 2500, hp: 260, damage: 16, range: 24 },
  { kind: "sled", name: "Tackling Sled", sprite: "/assets/battle/tackling-sled.webp", emoji: "\u{1F6F7}", desc: "Short range, hits like a truck (+35%)", cost: 1800, hp: 340, damage: 22, range: 14 },
  { kind: "ref", name: "Ref Tower", sprite: "/assets/battle/ref-tower.webp", emoji: "\u{1F6A9}", desc: "Penalty flags SLOW runners, longest range", cost: 3200, hp: 220, damage: 13, range: 30 },
  { kind: "tshirt", name: "T-Shirt Cannon", sprite: "/assets/battle/tshirt-cannon.webp", emoji: "\u{1F455}", desc: "Splash \u2014 blasts the whole cluster", cost: 2200, hp: 240, damage: 18, range: 20 },
  { kind: "cooler", name: "Gatorade Station", sprite: "/assets/battle/gatorade-station.webp", emoji: "\u{1F964}", desc: "Soaks the turf \u2014 puddle zones SLOW everyone crossing", cost: 2800, hp: 250, damage: 8, range: 22 }
];
var EXTRA_SLOT_COSTS = [40, 80, 120];
var buildingTiles = (gx, gy) => [[gx, gy], [gx + 1, gy], [gx, gy + 1], [gx + 1, gy + 1]];
var wallCap = (stadiumLevel) => Math.min(44, 22 + 2 * stadiumLevel);
var WALL_HP = 220;
var INITIAL_WALLS = [
  { gridX: 1, gridY: 1 },
  { gridX: 2, gridY: 1 },
  { gridX: 3, gridY: 1 },
  { gridX: 6, gridY: 1 },
  { gridX: 7, gridY: 1 },
  { gridX: 8, gridY: 1 },
  { gridX: 1, gridY: 8 },
  { gridX: 2, gridY: 8 },
  { gridX: 3, gridY: 8 },
  { gridX: 6, gridY: 8 },
  { gridX: 7, gridY: 8 },
  { gridX: 8, gridY: 8 }
];
var TENDENCIES = {
  blitzer: { label: "Blitzer", side: "offense", desc: "Aggressive rusher \u2014 boosts raid power", color: "#ef4444", emoji: "\u{1F525}" },
  playmaker: { label: "Playmaker", side: "offense", desc: "Makes big plays \u2014 boosts raid power", color: "#f97316", emoji: "\u2728" },
  anchor: { label: "Anchor", side: "defense", desc: "Holds the line \u2014 boosts defense", color: "#3b82f6", emoji: "\u2693" },
  ironwall: { label: "Iron Wall", side: "defense", desc: "Immovable \u2014 boosts defense", color: "#64748b", emoji: "\u{1F9F1}" },
  general: { label: "Field General", side: "balanced", desc: "High IQ \u2014 boosts offense & defense", color: "#a855f7", emoji: "\u{1F396}\uFE0F" },
  wildcard: { label: "Wildcard", side: "balanced", desc: "Unpredictable \u2014 small all-round boost", color: "#22c55e", emoji: "\u{1F3B2}" }
};
var TENDENCY_KEYS = Object.keys(TENDENCIES);
var tendencyFromId = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = h * 31 + id.charCodeAt(i) >>> 0;
  return TENDENCY_KEYS[h % TENDENCY_KEYS.length];
};
var createPlayer = (id, name, role, unit, rarity, x, y, color) => ({
  id,
  name,
  role,
  unit,
  rarity,
  level: 1,
  stats: { strength: 10, speed: 10, iq: 10 },
  maxStat: 50,
  worldPos: { x, y, z: 0 },
  targetPos: { x, y, z: 0 },
  state: "IDLE" /* IDLE */,
  avatarColor: color,
  tendency: tendencyFromId(id)
});
var INITIAL_ROSTER = [
  // OFFENSE LINE (The Wall) - Grey/Silver
  createPlayer("ol1", "Big Mike", "OL" /* OL */, "OFFENSE_LINE" /* OFFENSE_LINE */, "COMMON" /* COMMON */, 20, 20, "#94a3b8"),
  createPlayer("ol2", "Tank", "OL" /* OL */, "OFFENSE_LINE" /* OFFENSE_LINE */, "COMMON" /* COMMON */, 22, 22, "#94a3b8"),
  createPlayer("ol3", "Fridge", "OL" /* OL */, "OFFENSE_LINE" /* OFFENSE_LINE */, "RARE" /* RARE */, 24, 20, "#94a3b8"),
  // OFFENSE SKILL (Flashy) - Red
  createPlayer("qb1", "Ace QB", "QB" /* QB */, "OFFENSE_SKILL" /* OFFENSE_SKILL */, "EPIC" /* EPIC */, 30, 30, "#ef4444"),
  createPlayer("wr1", "Speedy", "WR" /* WR */, "OFFENSE_SKILL" /* OFFENSE_SKILL */, "RARE" /* RARE */, 35, 25, "#ef4444"),
  createPlayer("rb1", "Power Back", "RB" /* RB */, "OFFENSE_SKILL" /* OFFENSE_SKILL */, "COMMON" /* COMMON */, 32, 35, "#ef4444"),
  // DEFENSE LINE (Aggressive) - Blue
  createPlayer("dl1", "Crusher", "DL" /* DL */, "DEFENSE_LINE" /* DEFENSE_LINE */, "RARE" /* RARE */, 60, 60, "#3b82f6"),
  createPlayer("lb1", "Hawk", "LB" /* LB */, "DEFENSE_LINE" /* DEFENSE_LINE */, "COMMON" /* COMMON */, 65, 62, "#3b82f6"),
  // DEFENSE SECONDARY (Fast) - Dark Blue
  createPlayer("cb1", "Island", "CB" /* CB */, "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */, "EPIC" /* EPIC */, 70, 30, "#1e40af"),
  createPlayer("s1", "Viper", "S" /* S */, "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */, "RARE" /* RARE */, 75, 35, "#1e40af")
];
var RARITY_MULT = {
  ["COMMON" /* COMMON */]: 1,
  ["RARE" /* RARE */]: 1.25,
  ["EPIC" /* EPIC */]: 1.6,
  ["LEGENDARY" /* LEGENDARY */]: 2.1
};
var LEVEL_STAT_GAIN = 0.08;
var ROLE_BASE_STATS = {
  ["QB" /* QB */]: { strength: 8, speed: 10, iq: 14 },
  ["RB" /* RB */]: { strength: 13, speed: 12, iq: 8 },
  ["WR" /* WR */]: { strength: 7, speed: 14, iq: 10 },
  ["OL" /* OL */]: { strength: 14, speed: 6, iq: 9 },
  ["DL" /* DL */]: { strength: 13, speed: 8, iq: 8 },
  ["LB" /* LB */]: { strength: 11, speed: 10, iq: 10 },
  ["CB" /* CB */]: { strength: 7, speed: 14, iq: 10 },
  ["S" /* S */]: { strength: 8, speed: 12, iq: 12 }
};
var RARITY_CONFIG = {
  ["COMMON" /* COMMON */]: { color: "from-slate-500 to-slate-700", border: "border-slate-400", maxStat: 30, next: "RARE" /* RARE */ },
  ["RARE" /* RARE */]: { color: "from-blue-500 to-blue-700", border: "border-blue-400", maxStat: 50, next: "EPIC" /* EPIC */ },
  ["EPIC" /* EPIC */]: { color: "from-amber-400 to-amber-600", border: "border-amber-300", maxStat: 80, next: "LEGENDARY" /* LEGENDARY */ },
  ["LEGENDARY" /* LEGENDARY */]: { color: "from-purple-500 to-fuchsia-700", border: "border-fuchsia-400", maxStat: 100, next: null }
};
var RECRUIT_CONFIG = {
  baseRosterCap: 10,
  // roster cap = baseRosterCap + scoutLevel * capPerLevel
  capPerLevel: 2,
  rushGemCost: 5,
  // gems to instantly finish a scouting job
  candidateCount: 3,
  // candidates shown per scouting board
  // Per-rarity tuning. Higher rarity = pricier, slower to scout, stronger.
  rarity: {
    ["COMMON" /* COMMON */]: { cost: 300, seconds: 15, baseStat: 10, jitter: 4, weight: 55 },
    ["RARE" /* RARE */]: { cost: 800, seconds: 30, baseStat: 16, jitter: 5, weight: 28 },
    ["EPIC" /* EPIC */]: { cost: 2e3, seconds: 60, baseStat: 24, jitter: 6, weight: 13 },
    ["LEGENDARY" /* LEGENDARY */]: { cost: 5e3, seconds: 120, baseStat: 34, jitter: 8, weight: 4 }
  }
};
var ROLE_UNIT = {
  ["QB" /* QB */]: "OFFENSE_SKILL" /* OFFENSE_SKILL */,
  ["RB" /* RB */]: "OFFENSE_SKILL" /* OFFENSE_SKILL */,
  ["WR" /* WR */]: "OFFENSE_SKILL" /* OFFENSE_SKILL */,
  ["OL" /* OL */]: "OFFENSE_LINE" /* OFFENSE_LINE */,
  ["DL" /* DL */]: "DEFENSE_LINE" /* DEFENSE_LINE */,
  ["LB" /* LB */]: "DEFENSE_LINE" /* DEFENSE_LINE */,
  ["CB" /* CB */]: "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */,
  ["S" /* S */]: "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */
};
var UNIT_COLOR = {
  ["OFFENSE_LINE" /* OFFENSE_LINE */]: "#94a3b8",
  ["OFFENSE_SKILL" /* OFFENSE_SKILL */]: "#ef4444",
  ["DEFENSE_LINE" /* DEFENSE_LINE */]: "#3b82f6",
  ["DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */]: "#1e40af"
};
var RECRUIT_FIRST_NAMES = ["Deon", "Marcus", "Jamal", "Tyler", "Cole", "Zeke", "Malik", "Trey", "Rocco", "Xavier", "Isaiah", "Brock", "Cash", "Diesel", "Ace", "Vince", "Rex", "Duke", "Bo", "Nash"];
var RECRUIT_LAST_NAMES = ["Steel", "Storm", "Rhodes", "Blaze", "Cannon", "Voss", "Knight", "Cross", "Wolfe", "Stone", "Frost", "Hayes", "Vega", "Reyes", "Payne", "Lane", "Fox", "Beck", "Ward", "Kane"];
var trainingYieldMult = (level) => 1 + level * 0.1;
var warRoomReadinessMult = (level) => 1 + level * 0.1;
var energyIntervalMs = (medLevel) => Math.max(4e3, 8e3 - (medLevel - 1) * 800);

// assets.ts
var BUILDING_ART = {
  ["STADIUM" /* STADIUM */]: { slug: "stadium", levels: [1, 2, 3, 4, 5] },
  ["TRAINING_PITCH" /* TRAINING_PITCH */]: { slug: "practice-field", levels: [1, 2, 3, 4, 5] },
  ["YOUTH_ACADEMY" /* YOUTH_ACADEMY */]: { slug: "headquarters", levels: [1, 2, 3, 4, 5] },
  ["TACTICS_ROOM" /* TACTICS_ROOM */]: { slug: "film-room", levels: [1, 3, 5] },
  ["MEDICAL_CENTER" /* MEDICAL_CENTER */]: { slug: "weight-room", levels: [1, 3, 5] }
};
var BUILDING_ERAS = {
  ["STADIUM" /* STADIUM */]: ["Roped Field", "Bleachers", "The Horseshoe", "The Bowl", "The Cathedral"],
  ["TRAINING_PITCH" /* TRAINING_PITCH */]: ["Sandlot", "First Sled", "Real Turf", "Team Facility", "The Pro Cage"],
  ["YOUTH_ACADEMY" /* YOUTH_ACADEMY */]: ["The Easel", "The Shed", "The Office", "The Ops Hub", "Draft Command"],
  ["TACTICS_ROOM" /* TACTICS_ROOM */]: ["Chalk Talk", "The Film Room", "The Theater"],
  ["MEDICAL_CENTER" /* MEDICAL_CENTER */]: ["The Ice Tank", "The Deck", "The Spa"]
};
var buildingSprite = (type, level) => {
  const art = BUILDING_ART[type];
  const match = [...art.levels].filter((l) => l <= level).pop() ?? art.levels[0];
  return `/assets/buildings/${art.slug}-${match}.webp`;
};
var UNIT_ART = {
  ["OFFENSE_LINE" /* OFFENSE_LINE */]: "offensive-line",
  ["OFFENSE_SKILL" /* OFFENSE_SKILL */]: "skill-positions",
  ["DEFENSE_LINE" /* DEFENSE_LINE */]: "defensive-line",
  ["DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */]: "secondary"
};
var DEFENSE_FLAVOR_SPRITE = {
  jugs: "jugs-machine",
  sled: "tackling-sled",
  ref: "ref-tower",
  tshirt: "tshirt-cannon",
  cooler: "gatorade-station"
};
var wallSprite = (stadiumLevel) => stadiumLevel >= 9 ? "/assets/battle/blocking-sled-3.webp" : stadiumLevel >= 5 ? "/assets/battle/blocking-sled.webp" : "/assets/battle/blocking-sled-1.webp";
var defenseSprite = (kind, level = 1) => {
  const slug = DEFENSE_FLAVOR_SPRITE[kind] ?? "jugs-machine";
  const tier = level >= 8 ? 3 : level >= 4 ? 2 : 1;
  return `/assets/battle/${slug}${tier > 1 ? `-${tier}` : ""}.webp`;
};

// battle.ts
var TROOP_STATS = {
  // Names and hints are written for someone who has never played this and may not follow
  // football. No position abbreviations, no internal terms — a first-timer reads these
  // mid-battle with a clock running. Same four names are used on the Coach screen.
  ["OFFENSE_LINE" /* OFFENSE_LINE */]: { hp: 280, dps: 14, speed: 9, range: 4, label: "Linemen", color: "#475569", emoji: "\u{1F6E1}\uFE0F", hint: "big blockers \u2014 they soak the hits and shield everyone behind them" },
  // steel
  ["OFFENSE_SKILL" /* OFFENSE_SKILL */]: { hp: 95, dps: 34, speed: 15, range: 7, label: "Playmakers", color: "#f97316", emoji: "\u26A1", hint: "your stars \u2014 hit hard and move fast, but they go down easy" },
  // team orange
  ["DEFENSE_LINE" /* DEFENSE_LINE */]: { hp: 175, dps: 24, speed: 11, range: 4, label: "Pass Rushers", color: "#1f2937", emoji: "\u{1F4A5}", hint: "they charge the rival's defensive equipment first" },
  // charcoal
  ["DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */]: { hp: 90, dps: 22, speed: 17, range: 8, label: "Defensive Backs", color: "#eab308", emoji: "\u{1F3C3}", hint: "your fastest group \u2014 they sprint for the buildings holding the loot" }
  // gold
};
var UNIT_PREF = {
  ["OFFENSE_LINE" /* OFFENSE_LINE */]: { kind: "defense", w: 0.75 },
  // tanks lean toward turrets to soak
  ["OFFENSE_SKILL" /* OFFENSE_SKILL */]: { kind: "loot", w: 0.6 },
  // playmakers go for the score
  ["DEFENSE_LINE" /* DEFENSE_LINE */]: { kind: "defense", w: 0.5 },
  // the blitz — hunts equipment hard
  ["DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */]: { kind: "loot", w: 0.75 }
  // fast flankers race to open buildings
};
var UNIT_ORDER = [
  "OFFENSE_LINE" /* OFFENSE_LINE */,
  "OFFENSE_SKILL" /* OFFENSE_SKILL */,
  "DEFENSE_LINE" /* DEFENSE_LINE */,
  "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */
];
var GAME_PLANS = [
  { key: "ground", name: "Ground & Pound", blurb: "Tough +30% Grit \xB7 slower", hp: 1.3, dps: 1, speed: 0.85, momentum: 1 },
  { key: "balanced", name: "Balanced", blurb: "Momentum builds 40% faster", hp: 1, dps: 1, speed: 1, momentum: 1.4 },
  { key: "air", name: "Air Raid", blurb: "+20% yards +25% speed \xB7 fragile", hp: 0.75, dps: 1.2, speed: 1.25, momentum: 1 }
];
var armyFromRoster = (roster) => {
  const counts = {
    ["OFFENSE_LINE" /* OFFENSE_LINE */]: 0,
    ["OFFENSE_SKILL" /* OFFENSE_SKILL */]: 0,
    ["DEFENSE_LINE" /* DEFENSE_LINE */]: 0,
    ["DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */]: 0
  };
  roster.forEach((p) => {
    counts[p.unit] = (counts[p.unit] || 0) + 1;
  });
  return counts;
};
var POCKET_RADIUS = 9;
var RECEIVER_BONUS = 1.6;
var POCKET_FACTOR = 0.6;
var ROLE_COMBAT = {
  QB: { range: 13, thrower: true, dmgMult: 1.15, hpMult: 0.8, power: "throws from distance" },
  RB: { speedMult: 1.4, dmgMult: 1.5, hpMult: 1.1, power: "fast \u2014 hits HARD" },
  WR: { speedMult: 1.3, receiver: true, hpMult: 0.75, power: "catches: +60% dmg with a QB out" },
  OL: { protector: true, hpMult: 1.35, power: "the pocket \u2014 shields QB & RB" },
  DL: { dmgMult: 1.2, power: "trench bully" },
  LB: { dmgMult: 1.1, speedMult: 1.1, power: "sideline to sideline" },
  CB: { speedMult: 1.35, power: "ballhawk \u2014 races to loot" },
  S: { range: 9, speedMult: 1.2, power: "plays deep \u2014 mid range" }
};
var effectiveStat = (u, stat) => ROLE_BASE_STATS[u.role][stat] * RARITY_MULT[u.rarity] * (1 + LEVEL_STAT_GAIN * (u.level - 1));
var combatStat = (u, stat) => effectiveStat(u, stat) + Math.max(0, (u.stats?.[stat] ?? 10) - 10);
var unitPower = (u) => Math.round(combatStat(u, "strength") + combatStat(u, "speed") + combatStat(u, "iq"));
var statFactor = (v) => Math.max(0.6, Math.min(4.5, v / 10));
var unitCombatStats = (u) => {
  const st = TROOP_STATS[u.unit];
  const rc = ROLE_COMBAT[u.role];
  const strF = statFactor(combatStat(u, "strength"));
  const spdF = statFactor(combatStat(u, "speed"));
  return {
    hp: Math.round(st.hp * (rc?.hpMult ?? 1) * strF),
    dps: st.dps * (rc?.dmgMult ?? 1) * strF,
    // softened (sqrt): raw 2×+ move speed breaks pathing/kiting feel — LEGENDARY is
    // still clearly quicker, just not teleporting.
    speed: st.speed * (rc?.speedMult ?? 1) * Math.sqrt(spdF),
    range: rc?.range ?? st.range,
    chargeRate: statFactor(combatStat(u, "iq"))
    // ability cadence mult (cd = base / chargeRate)
  };
};
var HERO_DEFS = [
  // --- Starters (owned from the start) ---
  { key: "qb", name: "The Franchise", role: "QB", unit: "OFFENSE_SKILL" /* OFFENSE_SKILL */, ability: "hailmary", abilityName: "Hail Mary", abilityDesc: "Gain 300 + 4\xD7 your yardage stat against the closest facility", baseHp: 240, baseDps: 28, speed: 13, range: 9, color: "#f59e0b", emoji: "\u{1F3AF}", art: "/assets/heroes/qb.webp", starter: true },
  { key: "enforcer", name: "The Enforcer", role: "RB", unit: "DEFENSE_LINE" /* DEFENSE_LINE */, ability: "truckstick", abilityName: "Truck Stick", abilityDesc: "Plant, drive forward and burst on contact. Refill grit and gain 6 seconds of double yardage.", baseHp: 460, baseDps: 24, speed: 10, range: 4, color: "#7c3aed", emoji: "\u{1F69B}", art: "/assets/heroes/enforcer.webp", starter: true },
  { key: "coach", name: "The General", role: "HC", unit: "OFFENSE_LINE" /* OFFENSE_LINE */, ability: "motivation", abilityName: "Inspire", abilityDesc: "Give nearby teammates 4 seconds of Blitz", baseHp: 380, baseDps: 18, speed: 8, range: 4, color: "#10b981", emoji: "\u{1F4CB}", art: "/assets/heroes/coach.webp", starter: true },
  { key: "kicker", name: "The Specialist", role: "K", unit: "OFFENSE_SKILL" /* OFFENSE_SKILL */, ability: "onside_bomb", abilityName: "Onside Bomb", abilityDesc: "Gain 500 yards against the closest facility and 250 against nearby facilities", baseHp: 190, baseDps: 35, speed: 12, range: 12, color: "#3b82f6", emoji: "\u{1F3C8}", art: "/assets/heroes/kicker.webp", starter: true },
  { key: "burner", name: "The Burner", role: "WR", unit: "OFFENSE_SKILL" /* OFFENSE_SKILL */, ability: "burner_dash", abilityName: "Jet Sweep", abilityDesc: "Dash to the closest facility with 2.5 seconds of Blitz", baseHp: 220, baseDps: 32, speed: 18, range: 5, color: "#ef4444", emoji: "\u{1F525}", art: "/assets/heroes/burner.webp", starter: true },
  // --- Unlockable heroes (coin-gated) — distinct support roles, incl. women ---
  { key: "medic", name: "Dr. Sloane", role: "Team Doc", unit: "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */, ability: "field_medic", abilityName: "Field Medic", abilityDesc: "Restore 35% of nearby teammates\u2019 maximum grit, plus 5 seconds of recovery", baseHp: 300, baseDps: 10, speed: 13, range: 6, color: "#22c55e", emoji: "\u26D1\uFE0F", art: "/assets/heroes/medic.webp", unlock: { coins: 8e3 } },
  { key: "captain", name: "The Captain", role: "S", unit: "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */, ability: "shield_wall", abilityName: "Shield Wall", abilityDesc: "Nearby teammates take half pressure for 5 seconds", baseHp: 440, baseDps: 16, speed: 11, range: 4, color: "#0ea5e9", emoji: "\u{1F6E1}\uFE0F", art: "/assets/heroes/captain.webp", unlock: { coins: 14e3 } },
  { key: "playmaker", name: "The Playmaker", role: "WR", unit: "OFFENSE_SKILL" /* OFFENSE_SKILL */, ability: "trick_play", abilityName: "Trick Play", abilityDesc: "Bring three extra skill players onto the field", baseHp: 250, baseDps: 30, speed: 16, range: 7, color: "#ec4899", emoji: "\u{1F3A9}", art: "/assets/heroes/playmaker.webp", unlock: { coins: 2e4 } },
  // --- Premium pay-to-unlock hero (gems) — the GOAT ---
  { key: "legend", name: "The Legend", role: "GOAT", unit: "OFFENSE_SKILL" /* OFFENSE_SKILL */, ability: "hall_of_fame", abilityName: "Hall of Fame", abilityDesc: "Refill your whole squad\u2019s grit and give them 6 seconds of Blitz", baseHp: 520, baseDps: 40, speed: 14, range: 8, color: "#a855f7", emoji: "\u{1F451}", art: "/assets/heroes/legend.webp", unlock: { gems: 120 } }
];
var STARTER_HERO_KEYS = HERO_DEFS.filter((h) => h.starter).map((h) => h.key);
var heroLevelMult = (level) => 1 + 0.25 * (level - 1);
var heroStarMult = (stars) => 1 + 0.35 * (Math.max(1, stars) - 1);
var heroUpgradeCost = (level) => Math.round(600 * Math.pow(1.55, level - 1));
var heroForBattle = (def, level, stars = 1) => {
  const m = heroLevelMult(level) * heroStarMult(stars);
  return {
    key: def.key,
    name: def.name,
    ability: def.ability,
    abilityName: def.abilityName,
    abilityDesc: def.abilityDesc,
    unit: def.unit,
    hp: Math.round(def.baseHp * m),
    dps: def.baseDps * m,
    speed: def.speed,
    range: def.range,
    color: def.color,
    emoji: def.emoji,
    art: def.art,
    level
  };
};
var heroesForBattle = (heroStates) => heroStates.filter((hl) => hl.unlocked !== false).map((hl) => {
  const def = HERO_DEFS.find((d) => d.key === hl.key);
  return def ? heroForBattle(def, hl.level, hl.stars ?? 1) : null;
}).filter(Boolean);
var heroMaxLevel = (stadiumLevel) => stadiumLevel + 5;
var ABILITY_CD = 11;
var RAGE_SECONDS = 5;
var HEAL_SECONDS = 4;
var HEAL_PER_SEC = 45;
var PLAYBOOK = [
  { key: "blitz", name: "Blitz", desc: "Nearby players hit twice as hard and move twice as fast", charges: 2, radius: 22, color: "#dc2626", emoji: "\u{1F525}" },
  { key: "medic", name: "Trainer", desc: "Athletic trainer patches up nearby players", charges: 2, radius: 22, color: "#16a34a", emoji: "\u2795" }
];
var SPECIALS = [
  // The team mascot struts in, soaks hits, and keeps everyone near it Raging ("crowd goes wild").
  { key: "mascot", name: "Mascot", desc: "Nearby players hit harder while it is alive", count: 1, charges: 1, hp: 520, dps: 8, speed: 9, range: 4, aura: { radius: 16, keepRageT: 1.1 }, color: "#f97316", emoji: "\u{1F42F}", art: "/assets/units/mascot.webp" },
  // A cheap, fast, fragile swarm — the tailgate crowd storming the field.
  { key: "fan", name: "Fan Mob", desc: "A swarm of rowdy fans storms the field", count: 5, charges: 2, hp: 45, dps: 9, speed: 16, range: 3, color: "#fb923c", emoji: "\u{1F4E3}", art: "/assets/units/fan-mob.webp" }
];
var specialsForBattle = (fans) => SPECIALS.map((sp) => sp.key === "fan" ? { ...sp, charges: 1 + Math.min(3, Math.floor(fans / 500)) } : sp);
var armyStrength = (roster) => {
  const acc = {
    ["OFFENSE_LINE" /* OFFENSE_LINE */]: { t: 0, n: 0 },
    ["OFFENSE_SKILL" /* OFFENSE_SKILL */]: { t: 0, n: 0 },
    ["DEFENSE_LINE" /* DEFENSE_LINE */]: { t: 0, n: 0 },
    ["DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */]: { t: 0, n: 0 }
  };
  const tBonus = {
    ["OFFENSE_LINE" /* OFFENSE_LINE */]: 0,
    ["OFFENSE_SKILL" /* OFFENSE_SKILL */]: 0,
    ["DEFENSE_LINE" /* DEFENSE_LINE */]: 0,
    ["DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */]: 0
  };
  roster.forEach((p) => {
    acc[p.unit].t += combatStat(p, "strength");
    acc[p.unit].n += 1;
    const side = TENDENCIES[p.tendency]?.side;
    if (side === "offense") tBonus[p.unit] += 0.06;
    else if (side === "balanced") tBonus[p.unit] += 0.03;
  });
  const out = {};
  Object.keys(acc).forEach((u) => {
    const avg = acc[u].n ? acc[u].t / acc[u].n : 10;
    out[u] = Math.max(1, Math.min(4.5, avg / 10 * (1 + tBonus[u])));
  });
  return out;
};
var BATTLE_SECONDS = 60;
var ENEMY_BASES = [
  {
    id: "valley",
    name: "Valley State",
    difficulty: 1,
    reward: { coins: 700, fans: 30 },
    buildings: [
      { id: "hq", kind: "hq", x: 50, y: 50, hp: 480, size: 8, formation: "goalline" },
      { id: "d1", kind: "defense", x: 32, y: 34, hp: 200, size: 5, damage: 16, range: 22 },
      { id: "d2", kind: "defense", x: 68, y: 66, hp: 200, size: 5, damage: 16, range: 22 },
      { id: "b1", kind: "building", x: 30, y: 66, hp: 150, size: 5 },
      { id: "b2", kind: "building", x: 68, y: 32, hp: 150, size: 5 },
      { id: "b3", kind: "building", x: 50, y: 26, hp: 150, size: 5 },
      // Blocking Sleds ringing the HQ (radius ~13 so they enclose, not overlap, the stadium)
      { id: "w1", kind: "wall", x: 63, y: 50, hp: 200, size: 4 },
      { id: "w2", kind: "wall", x: 59, y: 59, hp: 200, size: 4 },
      { id: "w3", kind: "wall", x: 50, y: 63, hp: 200, size: 4 },
      { id: "w4", kind: "wall", x: 41, y: 59, hp: 200, size: 4 },
      { id: "w5", kind: "wall", x: 37, y: 50, hp: 200, size: 4 },
      { id: "w6", kind: "wall", x: 41, y: 41, hp: 200, size: 4 },
      { id: "w7", kind: "wall", x: 50, y: 37, hp: 200, size: 4 },
      { id: "w8", kind: "wall", x: 59, y: 41, hp: 200, size: 4 }
    ]
  },
  {
    id: "tech",
    name: "Tech University",
    difficulty: 2,
    reward: { coins: 1400, fans: 55 },
    buildings: [
      { id: "hq", kind: "hq", x: 50, y: 50, hp: 620, size: 8, formation: "cover3" },
      { id: "d1", kind: "defense", x: 28, y: 30, hp: 260, size: 5, damage: 20, range: 24 },
      { id: "d2", kind: "defense", x: 72, y: 30, hp: 260, size: 5, damage: 20, range: 24 },
      { id: "d3", kind: "defense", x: 50, y: 74, hp: 260, size: 5, damage: 20, range: 24 },
      { id: "b1", kind: "building", x: 28, y: 62, hp: 180, size: 5 },
      { id: "b2", kind: "building", x: 72, y: 62, hp: 180, size: 5 },
      { id: "b3", kind: "building", x: 31, y: 46, hp: 180, size: 5 },
      { id: "b4", kind: "building", x: 69, y: 46, hp: 180, size: 5 },
      // Wall ring around the HQ (radius ~13 so it encloses, not overlaps, the stadium)
      { id: "w1", kind: "wall", x: 63, y: 50, hp: 260, size: 4 },
      { id: "w2", kind: "wall", x: 59, y: 59, hp: 260, size: 4 },
      { id: "w3", kind: "wall", x: 50, y: 63, hp: 260, size: 4 },
      { id: "w4", kind: "wall", x: 41, y: 59, hp: 260, size: 4 },
      { id: "w5", kind: "wall", x: 37, y: 50, hp: 260, size: 4 },
      { id: "w6", kind: "wall", x: 41, y: 41, hp: 260, size: 4 },
      { id: "w7", kind: "wall", x: 50, y: 37, hp: 260, size: 4 },
      { id: "w8", kind: "wall", x: 59, y: 41, hp: 260, size: 4 }
    ]
  },
  // ── P2-2: more layouts so generateRaidTargets stops cycling valley/tech/valley.
  // generateRaidTargets rescales hp/damage per trophy tier and overrides the hq
  // formation — what these add is DISTINCT GEOMETRY (wall shape, turret placement,
  // building count) so consecutive raid boards read differently.
  {
    id: "harbor",
    name: "Harbor Hawks",
    difficulty: 3,
    reward: { coins: 1900, fans: 70 },
    buildings: [
      { id: "hq", kind: "hq", x: 50, y: 52, hp: 720, size: 8, formation: "cover3" },
      // Turrets pushed NORTH (the approach side); the south is an open kill-lane behind them.
      { id: "d1", kind: "defense", x: 34, y: 40, hp: 280, size: 5, damage: 22, range: 24 },
      { id: "d2", kind: "defense", x: 66, y: 40, hp: 280, size: 5, damage: 22, range: 24 },
      { id: "d3", kind: "defense", x: 50, y: 32, hp: 300, size: 5, damage: 24, range: 26 },
      { id: "b1", kind: "building", x: 34, y: 66, hp: 190, size: 5 },
      { id: "b2", kind: "building", x: 66, y: 66, hp: 190, size: 5 },
      { id: "b3", kind: "building", x: 50, y: 70, hp: 190, size: 5 },
      // Front-facing wall ARC only (north) — no rear wall, so flankers can swing around.
      { id: "w1", kind: "wall", x: 40, y: 44, hp: 280, size: 4 },
      { id: "w2", kind: "wall", x: 50, y: 41, hp: 280, size: 4 },
      { id: "w3", kind: "wall", x: 60, y: 44, hp: 280, size: 4 },
      { id: "w4", kind: "wall", x: 34, y: 52, hp: 280, size: 4 },
      { id: "w5", kind: "wall", x: 66, y: 52, hp: 280, size: 4 }
    ]
  },
  {
    id: "summit",
    name: "Summit Stags",
    difficulty: 4,
    reward: { coins: 2500, fans: 90 },
    buildings: [
      { id: "hq", kind: "hq", x: 50, y: 50, hp: 820, size: 8, formation: "maxprotect" },
      // Four corner turrets + a TIGHT inner wall box: you must break the shell to reach the HQ.
      { id: "d1", kind: "defense", x: 36, y: 36, hp: 300, size: 5, damage: 24, range: 24 },
      { id: "d2", kind: "defense", x: 64, y: 36, hp: 300, size: 5, damage: 24, range: 24 },
      { id: "d3", kind: "defense", x: 36, y: 64, hp: 300, size: 5, damage: 24, range: 24 },
      { id: "d4", kind: "defense", x: 64, y: 64, hp: 300, size: 5, damage: 24, range: 24 },
      { id: "b1", kind: "building", x: 50, y: 30, hp: 200, size: 5 },
      { id: "b2", kind: "building", x: 50, y: 70, hp: 200, size: 5 },
      { id: "w1", kind: "wall", x: 44, y: 44, hp: 300, size: 4 },
      { id: "w2", kind: "wall", x: 56, y: 44, hp: 300, size: 4 },
      { id: "w3", kind: "wall", x: 44, y: 56, hp: 300, size: 4 },
      { id: "w4", kind: "wall", x: 56, y: 56, hp: 300, size: 4 },
      { id: "w5", kind: "wall", x: 50, y: 42, hp: 300, size: 4 },
      { id: "w6", kind: "wall", x: 50, y: 58, hp: 300, size: 4 },
      { id: "w7", kind: "wall", x: 42, y: 50, hp: 300, size: 4 },
      { id: "w8", kind: "wall", x: 58, y: 50, hp: 300, size: 4 }
    ]
  },
  {
    id: "delta",
    name: "Delta Dragons",
    difficulty: 5,
    reward: { coins: 3200, fans: 110 },
    buildings: [
      { id: "hq", kind: "hq", x: 50, y: 50, hp: 900, size: 8, formation: "goalline" },
      // Wide open base: cardinal turrets with long range, loot at the corners — a race,
      // not a siege. Only a sparse wall cross slows the direct lanes in.
      { id: "d1", kind: "defense", x: 50, y: 28, hp: 320, size: 5, damage: 26, range: 28 },
      { id: "d2", kind: "defense", x: 50, y: 72, hp: 320, size: 5, damage: 26, range: 28 },
      { id: "d3", kind: "defense", x: 28, y: 50, hp: 320, size: 5, damage: 26, range: 28 },
      { id: "d4", kind: "defense", x: 72, y: 50, hp: 320, size: 5, damage: 26, range: 28 },
      { id: "b1", kind: "building", x: 30, y: 30, hp: 210, size: 5 },
      { id: "b2", kind: "building", x: 70, y: 30, hp: 210, size: 5 },
      { id: "b3", kind: "building", x: 30, y: 70, hp: 210, size: 5 },
      { id: "b4", kind: "building", x: 70, y: 70, hp: 210, size: 5 },
      { id: "w1", kind: "wall", x: 50, y: 40, hp: 300, size: 4 },
      { id: "w2", kind: "wall", x: 50, y: 60, hp: 300, size: 4 },
      { id: "w3", kind: "wall", x: 40, y: 50, hp: 300, size: 4 },
      { id: "w4", kind: "wall", x: 60, y: 50, hp: 300, size: 4 }
    ]
  },
  {
    id: "ridge",
    name: "Ridge Raiders",
    difficulty: 6,
    reward: { coins: 4200, fans: 140 },
    buildings: [
      { id: "hq", kind: "hq", x: 50, y: 50, hp: 1050, size: 8, formation: "maxprotect" },
      // The fortress: five turrets + a full outer ring, loot buried in the core.
      { id: "d1", kind: "defense", x: 38, y: 32, hp: 340, size: 5, damage: 28, range: 26 },
      { id: "d2", kind: "defense", x: 62, y: 32, hp: 340, size: 5, damage: 28, range: 26 },
      { id: "d3", kind: "defense", x: 32, y: 62, hp: 340, size: 5, damage: 28, range: 26 },
      { id: "d4", kind: "defense", x: 68, y: 62, hp: 340, size: 5, damage: 28, range: 26 },
      { id: "d5", kind: "defense", x: 50, y: 68, hp: 340, size: 5, damage: 28, range: 26 },
      { id: "b1", kind: "building", x: 44, y: 44, hp: 220, size: 5 },
      { id: "b2", kind: "building", x: 56, y: 44, hp: 220, size: 5 },
      { id: "w1", kind: "wall", x: 63, y: 50, hp: 340, size: 4 },
      { id: "w2", kind: "wall", x: 59, y: 59, hp: 340, size: 4 },
      { id: "w3", kind: "wall", x: 50, y: 63, hp: 340, size: 4 },
      { id: "w4", kind: "wall", x: 41, y: 59, hp: 340, size: 4 },
      { id: "w5", kind: "wall", x: 37, y: 50, hp: 340, size: 4 },
      { id: "w6", kind: "wall", x: 41, y: 41, hp: 340, size: 4 },
      { id: "w7", kind: "wall", x: 50, y: 37, hp: 340, size: 4 },
      { id: "w8", kind: "wall", x: 59, y: 41, hp: 340, size: 4 }
    ]
  }
];
var RIVAL_NAMES = ["Riverside Rams", "Coastal Cobras", "Mesa Mavericks", "Summit Stags", "Delta Dragons", "Harbor Hawks", "Canyon Cougars", "Prairie Pumas", "Bayou Bandits", "Ridge Raiders", "Metro Mustangs", "Vista Vipers"];
var generateRaidTargets = (trophies, random = Math.random) => {
  const bracket = Math.max(0, Number.isFinite(trophies) ? trophies : 0);
  const base = 2.2 + bracket / 120 + Math.pow(bracket / 700, 1.45);
  return Array.from({ length: 3 }, (_, i) => {
    const strength = [0.62, 0.86, 0.75 + 0.3 * Math.exp(-bracket / 200)][i];
    const variation = i === 2 ? 0.85 + random() * 0.3 : 0.97 + random() * 0.06;
    const tier = base * strength * variation;
    const risk = tier * (i === 2 ? 1.6 : 1);
    const template = ENEMY_BASES.find((candidate) => candidate.id === ["valley", "tech", "ridge"][i]);
    const tDmg = Math.round(14 * Math.pow(tier, 1.3));
    const botFormation = tier >= 2.2 ? "maxprotect" : tier >= 1.4 ? "cover3" : "goalline";
    const buildings = template.buildings.map((b) => ({ ...b, hp: Math.round(b.hp * tier), damage: b.damage ? tDmg : b.damage, formation: b.kind === "hq" ? botFormation : void 0 }));
    const extraSpots = [[30, 50], [70, 50], [50, 30], [50, 70], [38, 64]];
    const extras = i === 2 ? extraSpots.length : Math.min(extraSpots.length, 1 + Math.floor(tier / 1.1));
    const flavors = ["tshirt", "ref", "sled", "cooler", "ref"];
    for (let e = 0; e < extras; e++) {
      const [x, y] = extraSpots[e];
      buildings.push({ id: `xd${e}`, kind: "defense", flavor: flavors[e], x, y, hp: Math.round(220 * tier), size: 5, damage: tDmg, range: 23 });
    }
    return {
      id: `mm_${i}_${Math.floor(random() * 99999)}`,
      name: RIVAL_NAMES[Math.floor(random() * RIVAL_NAMES.length)],
      difficulty: Math.round(risk * 10) / 10,
      reward: { coins: Math.round(420 * risk + 250), fans: Math.round(14 * risk + 6) },
      buildings
    };
  });
};
var defenseLayoutFromBase = (buildings, walls = [], defBoost = 1, defenses = [], bus = null, parkingLot = 0, wallHp = WALL_HP, formation) => {
  const squeeze = 1 - PARKING_LOT.compressPerLevel * Math.min(PARKING_LOT.maxLevel, Math.max(0, parkingLot));
  const cx = (v) => 50 + (v - 50) * squeeze;
  const bs = buildings.map((b) => {
    const x = cx(Math.min(86, Math.max(14, b.gridX * 10 + 5)));
    const y = cx(Math.min(86, Math.max(14, b.gridY * 10 + 5)));
    const lvl = b.level;
    const art = buildingSprite(b.type, lvl);
    if (b.type === "STADIUM" /* STADIUM */)
      return { id: b.id, kind: "hq", x, y, hp: Math.round(500 * (1 + 0.35 * (lvl - 1)) * defBoost), size: 8, art, formation };
    if (b.type === "MEDICAL_CENTER" /* MEDICAL_CENTER */ || b.type === "YOUTH_ACADEMY" /* YOUTH_ACADEMY */)
      return { id: b.id, kind: "defense", x, y, hp: Math.round(210 * (1 + 0.35 * (lvl - 1)) * defBoost), size: 6, damage: Math.round((12 + lvl * 3) * defBoost), range: 24, art };
    return { id: b.id, kind: "building", x, y, hp: Math.round(150 * (1 + 0.3 * (lvl - 1)) * defBoost), size: 6, art };
  });
  const stadiumLvl = buildings.find((b) => b.type === "STADIUM" /* STADIUM */)?.level ?? 1;
  const wallArt = wallSprite(stadiumLvl);
  const ws = walls.map((w, i) => ({
    id: `wall-${i}`,
    kind: "wall",
    x: cx(Math.min(90, Math.max(10, w.gridX * 10))),
    y: cx(Math.min(90, Math.max(10, w.gridY * 10))),
    hp: Math.round(wallHp * defBoost),
    size: 4,
    art: wallArt
  }));
  const ds = defenses.map((d) => {
    const t = DEFENSE_TYPES.find((x) => x.kind === d.kind) ?? DEFENSE_TYPES[0];
    const lvl = Math.max(1, d.level ?? 1);
    return {
      id: d.id,
      kind: "defense",
      flavor: t.kind,
      x: cx(Math.min(88, Math.max(12, d.gridX * 10))),
      y: cx(Math.min(88, Math.max(12, d.gridY * 10))),
      hp: Math.round(t.hp * defBoost * (1 + 0.12 * (lvl - 1))),
      size: 5,
      damage: Math.round(t.damage * defBoost * (1 + 0.1 * (lvl - 1))),
      range: t.range,
      art: defenseSprite(t.kind, lvl),
      // emplacement art LEVELS UP with the slot (published layouts carry it)
      level: lvl
      // L10 = signature play unlocked
    };
  });
  const busB = bus ? [{
    id: "team-bus",
    kind: "wall",
    x: cx(Math.min(90, Math.max(10, bus.gridX * 10))),
    y: cx(Math.min(90, Math.max(10, bus.gridY * 10))),
    hp: Math.round(wallHp * 2.2 * defBoost),
    size: 6,
    art: wallArt
    // the big blocker wears the same era
  }] : [];
  return [...bs, ...ws, ...ds, ...busB];
};
var homeDefenders = (roster, parkingLotLevel = 0) => {
  const side = (p) => {
    const t = TENDENCIES[p.tendency];
    return t?.side === "defense" ? 2 : t?.side === "balanced" ? 1 : 0;
  };
  const jerseyOf = (id) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = h * 31 + id.charCodeAt(i) >>> 0;
    return 40 + h % 59;
  };
  const rosterGuards = roster.filter((p) => side(p) > 0).sort((a, b) => side(b) - side(a) || unitPower(b) - unitPower(a)).slice(0, 4).map((p) => {
    const str = combatStat(p, "strength");
    const balanced = side(p) === 1;
    return {
      jersey: jerseyOf(p.id),
      hp: Math.round((110 + str * 5.5) * (balanced ? 0.8 : 1)),
      dps: Math.round((7 + str * 0.55) * (balanced ? 0.8 : 1) * 10) / 10,
      name: p.name,
      unit: p.unit
      // real position group → the guard wears the right sprite
    };
  });
  const fanGuards = [];
  const pl = Math.min(PARKING_LOT.maxLevel, Math.max(0, parkingLotLevel));
  if (pl > 0) {
    const mobCount = pl * 3;
    for (let i = 0; i < mobCount; i++) {
      fanGuards.push({
        jersey: 99,
        hp: 75,
        dps: 12,
        name: "Tailgate Mob",
        art: "/assets/units/fan-mob.webp"
      });
    }
  }
  return [...rosterGuards, ...fanGuards];
};
var GAUNTLET_MAX_TIER = 20;
var gauntletWaves = (tier) => {
  const OL = "OFFENSE_LINE" /* OFFENSE_LINE */, SK = "OFFENSE_SKILL" /* OFFENSE_SKILL */, DL = "DEFENSE_LINE" /* DEFENSE_LINE */, DS = "DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */;
  const edge = (i, n, seed) => {
    const ang = (i + seed * 0.37) / n * Math.PI * 2;
    const cx0 = Math.cos(ang), cy0 = Math.sin(ang);
    const m = Math.max(Math.abs(cx0), Math.abs(cy0));
    return { x: 50 + cx0 / m * 47, y: 50 + cy0 / m * 47 };
  };
  const mixes = [
    [OL, OL, OL, SK],
    [OL, OL, SK, SK, DL],
    [OL, SK, SK, DL, DS, DS],
    [OL, OL, SK, SK, DL, DL, DS, DS],
    [OL, OL, OL, SK, SK, SK, DL, DL, DS, DS]
  ];
  const labels = ["The Walk-Ons", "The Rival JV", "The Blitz Package", "The First String", "THE ALL-STARS"];
  return mixes.map((mix, w) => ({
    at: [2, 14, 26, 38, 50][w],
    label: labels[w],
    // Tier ramps the whole night; each wave inside a night hits harder than the last.
    mult: Math.round((0.5 + 0.13 * Math.min(GAUNTLET_MAX_TIER, tier)) * (1 + w * 0.18) * 100) / 100,
    troops: mix.map((u, i) => ({ unit: u, ...edge(i, mix.length, w + tier) }))
  }));
};
var gauntletReward = (tier, wavesHeld, cleared) => ({
  coins: Math.round(120 * tier * wavesHeld * (cleared ? 1.5 : 1)),
  fans: Math.round(4 * tier * wavesHeld)
});
var dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
var nearestBuilding = (x, y, buildings, pref) => {
  let best = null;
  let bd = Infinity;
  for (const b of buildings) {
    if (b.dead || b.kind === "wall") continue;
    let d = dist(x, y, b.x, b.y);
    if (pref) {
      const isLoot = b.kind === "building" || b.kind === "hq";
      if (pref.kind === "defense" && b.kind === "defense" || pref.kind === "loot" && isLoot) d *= pref.w;
    }
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
};
var blockingWall = (tx, ty, range, goal, buildings) => {
  const gd = dist(tx, ty, goal.x, goal.y);
  let best = null;
  let bd = Infinity;
  for (const b of buildings) {
    if (b.dead || b.kind !== "wall") continue;
    const td = dist(tx, ty, b.x, b.y);
    if (td > b.size * 0.5 + range + 6) continue;
    if (dist(b.x, b.y, goal.x, goal.y) >= gd) continue;
    if (td < bd) {
      bd = td;
      best = b;
    }
  }
  return best;
};
var cellOf = (v) => Math.max(0, Math.min(9, Math.round(v / 10)));
var WALL_STEP_COST = 7;
var planPath = (fromX, fromY, goal, buildings) => {
  const wallAt = new Array(100).fill(null);
  const blocked = /* @__PURE__ */ new Set();
  for (const b of buildings) {
    if (b.kind !== "wall" || b.dead) continue;
    const i = cellOf(b.x), j = cellOf(b.y);
    wallAt[j * 10 + i] = b;
    blocked.add(`${i},${j}`);
  }
  const start = cellOf(fromY) * 10 + cellOf(fromX);
  const gx = cellOf(goal.x), gy = cellOf(goal.y);
  const end = gy * 10 + gx;
  const g = new Array(100).fill(Infinity);
  g[start] = 0;
  const prev = new Array(100).fill(-1);
  const closed = new Array(100).fill(false);
  const open = [start];
  const h = (n) => Math.abs(n % 10 - gx) + Math.abs((n / 10 | 0) - gy);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === end) break;
    if (closed[cur]) continue;
    closed[cur] = true;
    const ci = cur % 10, cj = cur / 10 | 0;
    for (const [ni, nj] of [[ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]]) {
      if (ni < 0 || ni > 9 || nj < 0 || nj > 9) continue;
      const n = nj * 10 + ni;
      const step = wallAt[n] ? WALL_STEP_COST : 1;
      if (g[cur] + step < g[n]) {
        g[n] = g[cur] + step;
        prev[n] = cur;
        if (!closed[n]) open.push(n);
      }
    }
  }
  const cells = [];
  for (let n = end; n !== -1 && n !== start; n = prev[n]) cells.unshift(n);
  let targetWallId = null;
  for (const n of cells) {
    if (wallAt[n]) {
      targetWallId = wallAt[n].id;
      break;
    }
  }
  return { path: cells.map((n) => ({ x: n % 10 * 10, y: (n / 10 | 0) * 10 })), targetWallId, goalId: goal.id, blocked, age: 0 };
};
var mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
if (typeof window !== "undefined" && import.meta.env?.DEV) window.__fhqPlanPath = planPath;
var losClear = (x0, y0, x1, y1, blocked) => {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d / 3));
  for (let k = 1; k <= steps; k++) {
    const x = x0 + (x1 - x0) * k / steps, y = y0 + (y1 - y0) * k / steps;
    if (blocked.has(`${cellOf(x)},${cellOf(y)}`)) return false;
  }
  return true;
};
var nearestTroop = (x, y, troops, within) => {
  let best = null;
  let bd = within;
  for (const t of troops) {
    if (t.dead) continue;
    const d = dist(x, y, t.x, t.y);
    if (d <= bd) {
      bd = d;
      best = t;
    }
  }
  return best;
};

// gacha.ts
var ROLL_COST_GEMS = 20;
var MAX_STARS = 5;
var STAR_UP_COSTS = { 1: 25, 2: 50, 3: 90, 4: 140 };

// recruiting.ts
var ALL_ROLES = [
  "QB" /* QB */,
  "RB" /* RB */,
  "WR" /* WR */,
  "OL" /* OL */,
  "DL" /* DL */,
  "LB" /* LB */,
  "CB" /* CB */,
  "S" /* S */
];
var rosterCap = (scoutLevel) => RECRUIT_CONFIG.baseRosterCap + scoutLevel * RECRUIT_CONFIG.capPerLevel;
var recruitCost = (p) => RECRUIT_CONFIG.rarity[p.rarity].cost;
var recruitSeconds = (p) => RECRUIT_CONFIG.rarity[p.rarity].seconds;

// dailies.ts
var ALL_QUESTS = [
  { id: "win_attack", text: "Win an attack (Season or Raid)", emoji: "\u2694\uFE0F", target: 1, reward: { gems: 8 } },
  { id: "game_balls", text: "Earn 5 Game Balls on offense", emoji: "\u{1F3C8}", target: 5, reward: { gems: 6 } },
  { id: "drills", text: "Collect 3 finished drills", emoji: "\u{1F3CB}\uFE0F", target: 3, reward: { gems: 5 } },
  { id: "bank_coins", text: "Bank 1,200 Stadium coins", emoji: "\u{1FA99}", target: 1200, reward: { gems: 4 } },
  { id: "train_hero", text: "Train a hero", emoji: "\u2B50", target: 1, reward: { gems: 4 } },
  { id: "scout", text: "Run a Scout Search", emoji: "\u{1F3B0}", target: 1, reward: { gems: 5 } }
];
var SWEEP_BONUS_GEMS = 6;
var todayKey = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
var questsForDate = (dateKey) => {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = h * 31 + dateKey.charCodeAt(i) >>> 0;
  const pool = [...ALL_QUESTS];
  const picks = [];
  for (let k = 0; k < 3 && pool.length; k++) {
    h = h * 1103515245 + 12345 >>> 0;
    picks.push(pool.splice(h % pool.length, 1)[0]);
  }
  return picks;
};
var freshDailies = (date2 = todayKey()) => ({ date: date2, progress: {}, claimed: [], sweepClaimed: false });

// fixedBase.ts
var FORMATION_ORDER = ["goalline", "cover3", "maxprotect"];
var SLOT_IDS = [
  { id: "D1", kind: "jugs", stadiumReq: 1 },
  // flex — first gun up
  { id: "D3", kind: "ref", stadiumReq: 2 },
  // first PERIMETER piece
  { id: "D2", kind: "sled", stadiumReq: 3 },
  // first MID piece
  { id: "D4", kind: "tshirt", stadiumReq: 4 },
  // second perimeter
  { id: "D5", kind: "jugs", stadiumReq: 6 },
  // flex second
  { id: "D7", kind: "cooler", stadiumReq: 5 },
  // area denial — the Gatorade Station
  { id: "D6", kind: "sled", stadiumReq: 8 },
  // second mid
  { id: "C1", kind: "ref", crownIndex: 0 },
  { id: "C2", kind: "tshirt", crownIndex: 1 },
  { id: "C3", kind: "jugs", crownIndex: 2 }
];
var COUNTER_WEAK_MULT = 1.1;
var COUNTER_STRONG_MULT = 0.92;
var ring = (lo, hi, skip) => {
  const out = [];
  const push = (x, y) => {
    if (!skip.has(`${x},${y}`)) out.push({ gridX: x, gridY: y });
  };
  for (let x = lo; x <= hi; x++) push(x, lo);
  for (let y = lo + 1; y <= hi; y++) push(hi, y);
  for (let x = hi - 1; x >= lo; x--) push(x, hi);
  for (let y = hi - 1; y >= lo + 1; y--) push(lo, y);
  return out;
};
var K = (...tiles) => new Set(tiles.map(([x, y]) => `${x},${y}`));
var FORMATIONS = {
  // ── FORMATION 1: everything packed around the Field, one wall, a huge kill-zone.
  goalline: {
    key: "goalline",
    name: "Goal Line",
    motto: "Tight core, one wall, nothing easy.",
    unlockStadium: 1,
    counter: { strongVs: ["ground"], weakTo: ["air"] },
    // Radius-3 quincunx (was radius-2, which bunched the campus in the top third
    // and left the south half empty). Corners embed in the wall ring — the
    // facilities ARE the fort's corner towers. Board is 0..9; 2×2 max anchor is 8.
    anchors: {
      ["STADIUM" /* STADIUM */]: { gridX: 4, gridY: 4 },
      // CORNER squares, pulled in one tile from the extremes: at (0,0)-style anchors
      // the ART (wider than its 2×2 footprint) overhung the campus edge onto the
      // rough (external audit, July 2026). (1,1)/(7,7) share the stadium's screen
      // column but sit 3+ tiles of depth away — inside the allowed layering gap.
      ["TACTICS_ROOM" /* TACTICS_ROOM */]: { gridX: 1, gridY: 1 },
      // War Room — top corner
      ["YOUTH_ACADEMY" /* YOUTH_ACADEMY */]: { gridX: 7, gridY: 1 },
      // Scouting — right corner
      ["MEDICAL_CENTER" /* MEDICAL_CENTER */]: { gridX: 1, gridY: 7 },
      // Rehab — left corner
      ["TRAINING_PITCH" /* TRAINING_PITCH */]: { gridX: 7, gridY: 7 }
      // Training — bottom corner
    },
    slotPos: {
      D1: { gridX: 4, gridY: 2, covers: "North pocket" },
      D2: { gridX: 7, gridY: 4, covers: "East flank (point-blank)" },
      D3: { gridX: 2, gridY: 4, covers: "West pocket (long range)" },
      D4: { gridX: 4, gridY: 7, covers: "South approach splash" },
      D5: { gridX: 2, gridY: 5, covers: "West pocket second" },
      D7: { gridX: 6, gridY: 2, covers: "NE approach \u2014 soak the lane" },
      D6: { gridX: 5, gridY: 2, covers: "North gate second" },
      C1: { gridX: 7, gridY: 5, covers: "East flank second" },
      C2: { gridX: 6, gridY: 7, covers: "South flank splash" },
      C3: { gridX: 3, gridY: 2, covers: "NW overwatch" }
    },
    // One wall ring at 1..8 with 2-tile gates mid-side; high levels narrow them.
    // TIGHT wall hugging the Stadium only (ring 3..6) — facilities stand OUTSIDE as
    // sacrificial buildings; open ground surrounds the wall (never touches the edge).
    wallOrder: [
      ...ring(3, 6, K([4, 3], [5, 6])),
      // north + south 1-tile gates
      { gridX: 4, gridY: 3 }
      // high levels seal the north gate
    ],
    busTile: { gridX: 5, gridY: 7 }
    // parked on the south-gate approach
  },
  // ── FORMATION 2: field → turret ring → facility ring (facilities ARE the wall
  //    line, corners left open as gates). The purest bullseye.
  cover3: {
    key: "cover3",
    name: "Cover 3",
    motto: "Rings on rings \u2014 every layer has one job.",
    unlockStadium: 3,
    counter: { strongVs: ["air"], weakTo: ["ground"] },
    // Facilities embed in the wall ring at DISTINCT grid diagonals (gx−gy all
    // different) — straight N/E/S/W axes share a screen column in iso and the
    // buildings stack on top of each other, scrambling the name tags.
    anchors: {
      ["STADIUM" /* STADIUM */]: { gridX: 4, gridY: 4 },
      // True corner squares (see goalline note) — the wall ring 2..7 stands between
      // the stadium and the sacrificial corner facilities.
      ["TACTICS_ROOM" /* TACTICS_ROOM */]: { gridX: 1, gridY: 1 },
      // War Room — top corner
      ["YOUTH_ACADEMY" /* YOUTH_ACADEMY */]: { gridX: 7, gridY: 1 },
      // Scouting — right corner
      ["MEDICAL_CENTER" /* MEDICAL_CENTER */]: { gridX: 1, gridY: 7 },
      // Rehab — left corner
      ["TRAINING_PITCH" /* TRAINING_PITCH */]: { gridX: 7, gridY: 7 }
      // Training — bottom corner
    },
    slotPos: {
      D1: { gridX: 4, gridY: 3, covers: "Field ring N" },
      D2: { gridX: 6, gridY: 4, covers: "Field ring E (point-blank)" },
      D3: { gridX: 1, gridY: 4, covers: "West perimeter (long range)" },
      D4: { gridX: 4, gridY: 8, covers: "South perimeter splash" },
      D5: { gridX: 3, gridY: 5, covers: "Field ring SW" },
      D7: { gridX: 3, gridY: 6, covers: "SW lane \u2014 soak the approach" },
      D6: { gridX: 5, gridY: 3, covers: "Field ring NE" },
      C1: { gridX: 8, gridY: 4, covers: "East perimeter (long range)" },
      C2: { gridX: 5, gridY: 1, covers: "North perimeter splash" },
      C3: { gridX: 6, gridY: 6, covers: "SE diagonal overwatch" }
    },
    // Wall ring at 1..8 WITHOUT corners (the four corner gaps are the gates);
    // the facility blocks punch their own sections out (occupied-filtered).
    wallOrder: ring(2, 7, K([4, 2], [7, 5])),
    // ring 2..7 — open apron all around; N + E gates
    busTile: { gridX: 8, gridY: 5 }
    // parked across the EAST gate approach
  },
  // ── FORMATION 3: Cover 3's shell + an inner KEEP around the Field. Double wall.
  maxprotect: {
    key: "maxprotect",
    name: "Max Protect",
    motto: "Breach the wall. Fight the courtyard. Crack the keep.",
    unlockStadium: 5,
    counter: { strongVs: ["ground", "air"], weakTo: ["balanced"] },
    // Same distinct-diagonal shell as Cover 3 (see note there) + the inner keep.
    anchors: {
      ["STADIUM" /* STADIUM */]: { gridX: 4, gridY: 4 },
      // Corner squares (matches Cover 3)
      ["TACTICS_ROOM" /* TACTICS_ROOM */]: { gridX: 1, gridY: 1 },
      ["YOUTH_ACADEMY" /* YOUTH_ACADEMY */]: { gridX: 7, gridY: 1 },
      ["MEDICAL_CENTER" /* MEDICAL_CENTER */]: { gridX: 1, gridY: 7 },
      ["TRAINING_PITCH" /* TRAINING_PITCH */]: { gridX: 7, gridY: 7 }
    },
    slotPos: {
      D1: { gridX: 4, gridY: 2, covers: "North courtyard" },
      D2: { gridX: 7, gridY: 3, covers: "NE courtyard (point-blank)" },
      D3: { gridX: 2, gridY: 4, covers: "W courtyard (long range)" },
      D4: { gridX: 5, gridY: 7, covers: "S courtyard splash" },
      D5: { gridX: 7, gridY: 5, covers: "E courtyard" },
      D7: { gridX: 3, gridY: 4, covers: "Keep west gate \u2014 soak the breach" },
      D6: { gridX: 5, gridY: 3, covers: "Keep north gate" },
      C1: { gridX: 2, gridY: 5, covers: "SW courtyard" },
      C2: { gridX: 7, gridY: 4, covers: "E corner overwatch" },
      C3: { gridX: 4, gridY: 6, covers: "Keep south gate" }
    },
    wallOrder: [
      // inner KEEP first (walls hug the Field; one gap per side — D6/C3 turrets guard two of them)
      { gridX: 3, gridY: 3 },
      { gridX: 4, gridY: 3 },
      { gridX: 6, gridY: 3 },
      { gridX: 6, gridY: 4 },
      { gridX: 6, gridY: 6 },
      { gridX: 5, gridY: 6 },
      { gridX: 3, gridY: 6 },
      { gridX: 3, gridY: 5 },
      // then the outer shell (ring 2..7 — perimeter never touches the map edge)
      ...ring(2, 7, K([4, 2], [7, 5]))
    ],
    busTile: { gridX: 8, gridY: 5 }
    // parked across the EAST gate approach
  }
};
var GATE_POSTS = {
  goalline: [{ id: "north", label: "North Gate", gridX: 4, gridY: 1 }, { id: "south", label: "South Gate", gridX: 5, gridY: 8 }],
  // Posts must sit on OPEN tiles — (7,7) was inside Training's footprint, and
  // maxprotect's old posts sat on the D1 turret tile / a live wall tile, so gate
  // heroes spawned inside buildings. Now audited (auditFormation checks posts).
  cover3: [{ id: "north", label: "North Wall", gridX: 4, gridY: 2 }, { id: "south", label: "SE Corner Gate", gridX: 6, gridY: 8 }],
  maxprotect: [{ id: "north", label: "Courtyard North", gridX: 4, gridY: 1 }, { id: "south", label: "South Approach", gridX: 5, gridY: 8 }]
};
var gatePostsFor = (f) => GATE_POSTS[f] ?? GATE_POSTS.goalline;
var MASTERY_THRESHOLDS = [3, 8, 15];
var masteryLevel = (holds) => MASTERY_THRESHOLDS.filter((t) => holds >= t).length;
var masteryDefMult = (holds) => 1 + 0.03 * masteryLevel(holds);
var formationDef = (f) => FORMATIONS[f] ?? FORMATIONS.goalline;
var formationUnlocked = (_f, _stadiumLevel) => true;
var anchorsFor = (f) => formationDef(f).anchors;
var busTileFor = (f) => formationDef(f).busTile;
var slotsFor = (f) => {
  const def = formationDef(f);
  return SLOT_IDS.map((s) => ({ ...s, ...def.slotPos[s.id] }));
};
var slotById = (f, id) => slotsFor(f).find((s) => s.id === id);
var kindDef = (kind) => DEFENSE_TYPES.find((d) => d.kind === kind);
var slotUnlocked = (slot, stadiumLevel, bonusDefSlots) => slot.crownIndex !== void 0 ? bonusDefSlots > slot.crownIndex : stadiumLevel >= (slot.stadiumReq ?? 1);
var MAX_SLOT_LEVEL = 10;
var slotUpgradeCost = (kind, toLevel) => {
  const base = kindDef(kind).cost;
  if (toLevel <= 1) return base;
  return Math.round(0.6 * base * Math.pow(1.35, toLevel - 2));
};
var wallOrderFor = (f) => {
  const def = formationDef(f);
  const occupied = /* @__PURE__ */ new Set();
  for (const type of Object.keys(def.anchors)) {
    const a = def.anchors[type];
    for (const [tx, ty] of buildingTiles(a.gridX, a.gridY)) occupied.add(`${tx},${ty}`);
  }
  for (const s of slotsFor(f)) occupied.add(`${s.gridX},${s.gridY}`);
  occupied.add(`${def.busTile.gridX},${def.busTile.gridY}`);
  const seen = /* @__PURE__ */ new Set();
  return def.wallOrder.filter((w) => {
    const k = `${w.gridX},${w.gridY}`;
    if (occupied.has(k) || seen.has(k)) return false;
    if (w.gridX < 0 || w.gridX > 9 || w.gridY < 0 || w.gridY > 9) return false;
    seen.add(k);
    return true;
  });
};
var wallsFor = (f, stadiumLevel) => {
  const order = wallOrderFor(f);
  return order.slice(0, Math.min(order.length, wallCap(stadiumLevel)));
};
var wallHpFor = (stadiumLevel) => Math.round(220 * (1 + 0.08 * Math.max(0, stadiumLevel - 1)));
var auditFormation = (f) => {
  const errors = [];
  const def = formationDef(f);
  const seen = /* @__PURE__ */ new Set();
  const claim = (x, y, what) => {
    const k = `${x},${y}`;
    if (seen.has(k)) errors.push(`overlap at ${k} (${what})`);
    if (x < 0 || x > 9 || y < 0 || y > 9) errors.push(`${what} off-board at ${k}`);
    seen.add(k);
  };
  for (const type of Object.keys(def.anchors)) {
    const a = def.anchors[type];
    for (const [tx, ty] of buildingTiles(a.gridX, a.gridY)) claim(tx, ty, type);
  }
  for (const s of slotsFor(f)) claim(s.gridX, s.gridY, s.id);
  claim(def.busTile.gridX, def.busTile.gridY, "bus");
  for (const w of wallOrderFor(f)) claim(w.gridX, w.gridY, "wall");
  const blocks = Object.keys(def.anchors).map((t) => {
    const a = def.anchors[t];
    return { t, diag: a.gridX - a.gridY, depth: a.gridX + a.gridY };
  });
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    if (blocks[i].diag === blocks[j].diag && Math.abs(blocks[i].depth - blocks[j].depth) < 4) {
      errors.push(`iso-stack: ${blocks[i].t} and ${blocks[j].t} share screen diagonal ${blocks[i].diag} too closely`);
    }
  }
  const stadium = def.anchors["STADIUM" /* STADIUM */];
  const scx = stadium.gridX + 0.5, scy = stadium.gridY + 0.5;
  for (const sl of slotsFor(f)) {
    const d = Math.max(Math.abs(sl.gridX - scx), Math.abs(sl.gridY - scy));
    if (sl.kind === "sled" && d > 2.5) errors.push(`${sl.id} (sled) too far out (d=${d}) \u2014 point-blank belongs MID`);
    if ((sl.kind === "ref" || sl.kind === "tshirt") && d < 2.5) errors.push(`${sl.id} (${sl.kind}) too close in (d=${d}) \u2014 belongs PERIMETER`);
  }
  for (const post of gatePostsFor(f)) {
    const pk = `${post.gridX},${post.gridY}`;
    if (seen.has(pk)) errors.push(`gate post ${post.id} at ${pk} sits on an occupied tile`);
  }
  return errors;
};
if (import.meta.env?.DEV) {
  for (const f of FORMATION_ORDER) {
    const errs = auditFormation(f);
    if (errs.length) throw new Error(`fixedBase[${f}]: ${errs.join("; ")}`);
  }
}

// game/economy.ts
function levelTimeline(building, jobs, from, to) {
  const upgrades = jobs.filter((job) => job.kind === "building" && job.key === building.id && job.finishTime <= to).sort((a, b) => a.finishTime - b.finishTime);
  let level = building.level, cursor = from;
  const segments = [];
  for (const upgrade of upgrades) {
    if (upgrade.finishTime > from) {
      segments.push({ from: cursor, to: upgrade.finishTime, level });
      cursor = upgrade.finishTime;
    }
    level = Math.max(level, upgrade.toLevel);
  }
  segments.push({ from: cursor, to, level });
  return segments;
}
function advanceEconomy(previous, now) {
  const from = previous.lastTick;
  const completedJobs = previous.upgrades.filter((job) => job.finishTime <= now);
  const buildings = previous.buildings.map((building) => {
    const segments = levelTimeline(building, previous.upgrades, from, now);
    const collector = COLLECTOR_CONFIG[building.type];
    let accrued = building.accrued ?? 0;
    if (collector) for (const segment of segments) {
      const seconds = Math.min(Math.max(0, segment.to - segment.from) / 1e3, collector.maxOfflineSeconds);
      accrued = Math.min(collectorCap(building.type, segment.level), accrued + collectorRate(building.type, segment.level) * seconds);
    }
    const level = segments[segments.length - 1].level;
    const state = building.state === "ACTIVE" /* ACTIVE */ && building.finishTime != null && now >= building.finishTime ? "COMPLETED" /* COMPLETED */ : building.state;
    return level !== building.level || state !== building.state || collector && accrued !== building.accrued ? { ...building, level, state, ...collector ? { accrued } : {} } : building;
  });
  const rehab = previous.buildings.find((building) => building.type === "MEDICAL_CENTER" /* MEDICAL_CENTER */);
  const energySegments = rehab ? levelTimeline(rehab, previous.upgrades, from, now) : [{ from, to: now, level: 1 }];
  let energy = Math.min(100, previous.resources.ENERGY);
  let interval = energyIntervalMs(rehab?.level ?? 1);
  let energyProgressMs = Math.min(interval, previous.energyProgressMs ?? 0);
  for (const segment of energySegments) {
    const nextInterval = energyIntervalMs(segment.level);
    energyProgressMs = energyProgressMs / interval * nextInterval;
    interval = nextInterval;
    if (energy >= 100) {
      energyProgressMs = 0;
      continue;
    }
    const total = energyProgressMs + Math.max(0, segment.to - segment.from);
    const ticks = Math.floor((total + 1e-7) / interval);
    energy = Math.min(100, energy + ticks);
    energyProgressMs = energy >= 100 ? 0 : Math.max(0, total - ticks * interval);
  }
  return {
    buildings,
    energyProgressMs,
    heroes: completedJobs.some((job) => job.kind === "hero") ? previous.heroes.map((hero) => {
      const level = completedJobs.filter((job) => job.kind === "hero" && job.key === hero.key).reduce((best, job) => Math.max(best, job.toLevel), hero.level);
      return level !== hero.level ? { ...hero, level } : hero;
    }) : previous.heroes,
    upgrades: completedJobs.length ? previous.upgrades.filter((job) => now < job.finishTime) : previous.upgrades,
    resources: energy !== previous.resources.ENERGY ? { ...previous.resources, ENERGY: energy } : previous.resources
  };
}

// game/fanProgress.ts
var fanMilestoneTotal = (state) => Math.max(state.peakFans ?? 0, state.resources.FANS);
function rallyPreview(state) {
  const energyGain = Math.max(0, Math.min(RALLY_CONFIG.energyGain, 100 - state.resources.ENERGY));
  return { fanCost: RALLY_CONFIG.fanCost, energyGain, canRally: energyGain > 0 && state.resources.FANS >= RALLY_CONFIG.fanCost };
}
function rallyFans(state) {
  const preview = rallyPreview(state);
  if (!preview.canRally) return state;
  const energy = state.resources.ENERGY + preview.energyGain;
  return { ...state, peakFans: fanMilestoneTotal(state), energyProgressMs: energy >= 100 ? 0 : state.energyProgressMs ?? 0, resources: {
    ...state.resources,
    FANS: state.resources.FANS - preview.fanCost,
    ENERGY: energy
  } };
}
var nextFanMilestone = (state, gain) => Math.max(fanMilestoneTotal(state), state.resources.FANS + gain);

// game/campus.ts
function advanceCampus(previous, now) {
  if (!Number.isFinite(now) || now <= previous.lastTick) return previous;
  const seconds = (now - previous.lastTick) / 1e3;
  const movementSeconds = Math.min(seconds, 0.25);
  const random = mulberry32(Math.floor(now));
  const patrolPoint = (player) => {
    const angle = Math.atan2(player.worldPos.y - 55, player.worldPos.x - 55) + 0.45 + random() * 0.5;
    const radius = 20 + random() * 5;
    return { x: Math.min(94, Math.max(6, 55 + Math.cos(angle) * radius)), y: Math.min(94, Math.max(6, 55 + Math.sin(angle) * radius)), z: 0 };
  };
  const economy = advanceEconomy(previous, now);
  const roster = previous.roster.map((player) => {
    if (player.state === "IDLE" /* IDLE */ && TENDENCIES[player.tendency]?.side === "defense") {
      return { ...player, state: "PATROLLING" /* PATROLLING */, targetPos: patrolPoint(player) };
    }
    const dx = player.targetPos.x - player.worldPos.x, dy = player.targetPos.y - player.worldPos.y;
    const distance = Math.hypot(dx, dy);
    const patrolling = player.state === "PATROLLING" /* PATROLLING */;
    const step = (patrolling ? 6.5 : 15) * movementSeconds;
    if (distance > 0.5 && distance > step) {
      return { ...player, worldPos: { x: player.worldPos.x + dx / distance * step, y: player.worldPos.y + dy / distance * step, z: 0 }, state: player.targetPos.z === 1 ? "TRAINING" /* TRAINING */ : patrolling ? "PATROLLING" /* PATROLLING */ : "WALKING" /* WALKING */ };
    }
    const arrived = distance > 0 ? { ...player, worldPos: { x: player.targetPos.x, y: player.targetPos.y, z: 0 } } : player;
    if (patrolling) return { ...arrived, targetPos: patrolPoint(arrived) };
    if (player.state === "WALKING" /* WALKING */ || player.state === "TRAINING" /* TRAINING */ && player.targetPos.z !== 1) {
      return { ...arrived, state: player.targetPos.z === 1 ? "TRAINING" /* TRAINING */ : "IDLE" /* IDLE */ };
    }
    return arrived;
  });
  const date2 = todayKey(now);
  return {
    ...previous,
    ...economy,
    roster,
    peakFans: fanMilestoneTotal(previous),
    dailies: previous.dailies.date === date2 ? previous.dailies : freshDailies(date2),
    gauntlet: previous.gauntlet.date === date2 ? previous.gauntlet : { ...previous.gauntlet, attempts: 3, date: date2 },
    timeOfDay: (previous.timeOfDay + seconds / 60 * 24) % 24,
    lastTick: now
  };
}

// game/campusLayout.ts
var keyOf = ({ gridX, gridY }) => `${gridX},${gridY}`;
var record2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var point = (v) => record2(v) && Number.isInteger(v.gridX) && Number.isInteger(v.gridY);
var ident = (v) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
var compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
var inside = (p) => p.gridX >= 0 && p.gridX <= 9 && p.gridY >= 0 && p.gridY <= 9;
var neighbors = (p) => [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([x, y]) => ({ gridX: p.gridX + x, gridY: p.gridY + y })).filter(inside);
function templateCampusLayout(formation, buildings) {
  return {
    version: 1,
    formation,
    facilities: buildings.map((b) => ({ id: b.id, type: b.type, ...anchorsFor(formation)[b.type] })),
    slots: slotsFor(formation).map((s) => ({ id: s.id, kind: s.kind, gridX: s.gridX, gridY: s.gridY })),
    // All authored walls are reserved. Current wall capacity is applied when taking a defense snapshot.
    walls: wallsFor(formation, 100).map((p) => ({ ...p })),
    bus: { ...busTileFor(formation) },
    gates: gatePostsFor(formation).map((p) => ({ ...p }))
  };
}
function validateCampusLayout(input, buildings) {
  const issues = [];
  const fail2 = (code, message) => issues.push({ code, message });
  if (!record2(input) || input.version !== 1 || !FORMATION_ORDER.includes(input.formation) || !Array.isArray(input.facilities) || input.facilities.length !== Object.values(BuildingType).length || !Array.isArray(input.slots) || input.slots.length !== slotsFor("goalline").length || !Array.isArray(input.walls) || input.walls.length > 44 || !Array.isArray(input.gates) || input.gates.length !== 2 || !point(input.bus) || !input.facilities.every((p) => point(p) && record2(p) && ident(p.id) && Object.values(BuildingType).includes(p.type)) || !input.slots.every((p) => point(p) && record2(p) && ident(p.id) && ident(p.kind)) || !input.walls.every(point) || !input.gates.every((p) => point(p) && record2(p) && ident(p.id) && typeof p.label === "string" && p.label.length <= 60)) {
    return { valid: false, issues: [{ code: "shape", message: "This layout is incomplete or uses an unsupported format." }] };
  }
  const layout2 = input;
  const expectedSlots = slotsFor(layout2.formation);
  if (new Set(layout2.facilities.map((p) => p.type)).size !== Object.values(BuildingType).length || new Set(layout2.facilities.map((p) => p.id)).size !== layout2.facilities.length || new Set([...layout2.facilities, ...layout2.slots].map((p) => p.id)).size !== layout2.facilities.length + layout2.slots.length || layout2.facilities.some((p) => p.id === "team-bus" || p.id.startsWith("wall-")) || buildings && (buildings.length !== layout2.facilities.length || buildings.some((b) => !layout2.facilities.some((p) => p.id === b.id && p.type === b.type))))
    fail2("identity", "Keep every owned facility in the formation exactly once.");
  if (new Set(layout2.slots.map((p) => p.id)).size !== expectedSlots.length || expectedSlots.some((s) => !layout2.slots.some((p) => p.id === s.id && p.kind === s.kind)))
    fail2("identity", "Keep each equipment slot and its equipment type exactly once.");
  if (layout2.gates.map((p) => p.id).sort().join(",") !== gatePostsFor(layout2.formation).map((p) => p.id).sort().join(","))
    fail2("identity", "Both hero gate posts must stay in the formation.");
  if (layout2.walls.length !== wallsFor(layout2.formation, 100).length)
    fail2("identity", "Keep the same number of walls when editing this formation.");
  const occupied = /* @__PURE__ */ new Map();
  const solid = /* @__PURE__ */ new Set();
  const claim = (p, label, permanent = true) => {
    const key = keyOf(p);
    if (p.gridX < 1 || p.gridX > 8 || p.gridY < 1 || p.gridY > 8) fail2("bounds", `${label} must stay inside the open outer boundary.`);
    if (occupied.has(key)) fail2("overlap", `${label} overlaps ${occupied.get(key)} at column ${p.gridX + 1}, row ${p.gridY + 1}.`);
    occupied.set(key, label);
    if (permanent) solid.add(key);
  };
  for (const facility of layout2.facilities) for (const [gridX, gridY] of buildingTiles(facility.gridX, facility.gridY)) claim({ gridX, gridY }, facility.type.replace(/_/g, " "));
  for (const slot of layout2.slots) claim(slot, slot.id);
  layout2.walls.forEach((p, i) => claim(p, `Wall ${i + 1}`, false));
  claim(layout2.bus, "Team bus", false);
  const gatePositions = /* @__PURE__ */ new Set();
  for (const gate of layout2.gates) {
    if (!inside(gate) || gate.gridX === 0 || gate.gridX === 9 || gate.gridY === 0 || gate.gridY === 9) fail2("bounds", `${gate.label} must stay inside the open outer boundary.`);
    if (occupied.has(keyOf(gate)) || gatePositions.has(keyOf(gate))) fail2("overlap", `${gate.label} needs its own open tile.`);
    gatePositions.add(keyOf(gate));
  }
  const flood = (blocked) => {
    const found = /* @__PURE__ */ new Set();
    const queue = [];
    for (let i = 0; i < 10; i++) for (const p of [{ gridX: i, gridY: 0 }, { gridX: i, gridY: 9 }, { gridX: 0, gridY: i }, { gridX: 9, gridY: i }]) {
      if (!blocked.has(keyOf(p)) && !found.has(keyOf(p))) {
        found.add(keyOf(p));
        queue.push(p);
      }
    }
    for (let i = 0; i < queue.length; i++) for (const p of neighbors(queue[i])) if (!blocked.has(keyOf(p)) && !found.has(keyOf(p))) {
      found.add(keyOf(p));
      queue.push(p);
    }
    return found;
  };
  const open = flood(new Set(occupied.keys()));
  for (const gate of layout2.gates) if (!open.has(keyOf(gate))) fail2("gate-access", `${gate.label} needs an open route to the outside of the campus.`);
  const breachable = flood(solid);
  for (const facility of layout2.facilities) {
    const cells = buildingTiles(facility.gridX, facility.gridY).map(([gridX, gridY]) => ({ gridX, gridY }));
    if (!cells.some((p) => neighbors(p).some((n) => breachable.has(keyOf(n))))) fail2("reachability", `${facility.type.replace(/_/g, " ")} needs an approach tile after walls are breached.`);
  }
  return { valid: issues.length === 0, issues };
}
function canonicalCampusLayout(layout2) {
  return {
    version: 1,
    formation: layout2.formation,
    facilities: layout2.facilities.map((p) => ({ id: p.id, type: p.type, gridX: p.gridX, gridY: p.gridY })).sort(compareId),
    slots: layout2.slots.map((p) => ({ id: p.id, kind: p.kind, gridX: p.gridX, gridY: p.gridY })).sort(compareId),
    walls: layout2.walls.map((p) => ({ gridX: p.gridX, gridY: p.gridY })),
    bus: { gridX: layout2.bus.gridX, gridY: layout2.bus.gridY },
    gates: layout2.gates.map((p) => ({ id: p.id, label: p.label, gridX: p.gridX, gridY: p.gridY })).sort(compareId)
  };
}
function parseCampusLayout(input, buildings) {
  return validateCampusLayout(input, buildings).valid ? canonicalCampusLayout(input) : null;
}
function campusLayoutId(layout2) {
  const content = canonicalJson(canonicalCampusLayout(layout2));
  let hash = 14695981039346656037n;
  for (let i = 0; i < content.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(content.charCodeAt(i))) * 1099511628211n);
  return `campus-v1-${hash.toString(16).padStart(16, "0")}`;
}
function campusLayoutForState(state) {
  const saved = parseCampusLayout(state.campusLayout, state.buildings);
  return saved?.formation === state.formation ? saved : canonicalCampusLayout(templateCampusLayout(state.formation, state.buildings));
}
function applyCampusLayout(state, input) {
  const layout2 = parseCampusLayout(input, state.buildings);
  if (!layout2) throw new Error("The formation is not ready to use. Fix its placement issues first.");
  return { ...state, formation: layout2.formation, campusLayout: layout2, buildings: state.buildings.map((b) => ({ ...b, ...layout2.facilities.find((p) => p.id === b.id) })) };
}

// game/authority/clubActions.ts
var fields = {
  sync: [],
  "facility.collect": ["buildingId"],
  "facility.upgrade": ["buildingId"],
  "facility.rush": ["jobId"],
  "builder.hire": [],
  rally: [],
  "training.start": ["drillId", "unit"],
  "training.collect": ["buildingId"],
  "hero.train": ["heroKey"],
  "hero.unlock": ["heroKey"],
  "hero.star": ["heroKey"],
  "hero.scout": [],
  "recruit.refresh": [],
  "recruit.start": ["candidateId"],
  "recruit.rush": [],
  "recruit.sign": [],
  "recruit.cut": ["playerId"],
  "daily.claim": ["questId"],
  "defense.seen": ["ids"],
  "defense.buy-slot": [],
  "defense.upgrade-slot": ["slotId"],
  "formation.set": ["formation"],
  "gate.assign": ["postId", "heroKey"],
  "campus.apply": ["layout"],
  "parking.upgrade": [],
  "club.rename": ["name"]
};
function parseClubAction(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input;
  if (typeof value.type !== "string" || !Object.prototype.hasOwnProperty.call(fields, value.type)) return null;
  const required2 = fields[value.type];
  if (Object.keys(value).length !== required2.length + 1 || Object.keys(value).some((key) => key !== "type" && !required2.includes(key))) return null;
  if (value.type === "campus.apply") {
    const layout2 = parseCampusLayout(value.layout);
    return layout2 ? { type: "campus.apply", layout: layout2 } : null;
  }
  if (value.type === "defense.seen") {
    if (!Array.isArray(value.ids) || value.ids.length > 100 || !value.ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 120) || new Set(value.ids).size !== value.ids.length) return null;
    return { type: "defense.seen", ids: [...value.ids] };
  }
  if (!required2.every((key) => typeof value[key] === "string" && value[key].length > 0 && value[key].length <= 120)) return null;
  if (value.type === "training.start" && !Object.values(UnitGroup).includes(value.unit)) return null;
  if (value.type === "formation.set" && !FORMATION_ORDER.includes(value.formation)) return null;
  if (value.type === "club.rename" && (String(value.name).trim().length < 2 || String(value.name).trim().length > 24 || /[\u0000-\u001f\u007f-\u009f]/u.test(String(value.name)))) return null;
  return { ...value };
}
function settleClubState(previous, clock) {
  const context = typeof clock === "number" ? { now: clock } : clock;
  const { now } = context;
  if (!Number.isFinite(now) || now < previous.lastTick) return previous;
  const date2 = context.calendarDate ?? new Date(now).toISOString().slice(0, 10);
  return {
    ...advanceCampus(previous, now),
    ...advanceEconomy(previous, now),
    lastTick: now,
    peakFans: fanMilestoneTotal(previous),
    dailies: previous.dailies.date === date2 ? previous.dailies : freshDailies(date2),
    gauntlet: previous.gauntlet.date === date2 ? previous.gauntlet : { ...previous.gauntlet, date: date2, attempts: 3 }
  };
}
function progressClubDaily(state, questId, count = 1) {
  const quest = questsForDate(state.dailies.date).find((value) => value.id === questId);
  if (!quest || state.dailies.claimed.includes(questId) || !Number.isFinite(count) || count <= 0) return state;
  const progress = Math.min(quest.target, (state.dailies.progress[questId] ?? 0) + count);
  return { ...state, dailies: { ...state.dailies, progress: { ...state.dailies.progress, [questId]: progress } } };
}
function validBalances(state) {
  return Object.values(ResourceType).every((key) => Number.isFinite(state.resources[key]) && state.resources[key] >= 0) && state.resources.ENERGY <= 100 && Number.isFinite(state.lastTick) && state.buildings.every((value) => Number.isSafeInteger(value.level) && value.level >= 1) && state.heroes.every((value) => Number.isSafeInteger(value.level) && value.level >= 1 && Number.isSafeInteger(value.stars) && value.stars >= 1 && value.stars <= MAX_STARS && Number.isFinite(value.shards) && value.shards >= 0);
}
function recruitBoard(state, now, random) {
  const pick = (values) => values[Math.floor(random() * values.length)];
  const roles = Object.values(PlayerRole);
  const weights = Object.entries(RECRUIT_CONFIG.rarity);
  const total = weights.reduce((sum, [, value]) => sum + value.weight, 0);
  const used = /* @__PURE__ */ new Set([...state.roster.map((value) => value.id), ...state.recruitBoard?.candidates.map((value) => value.id) ?? [], state.recruitSlot?.candidate.id]);
  const candidates = Array.from({ length: RECRUIT_CONFIG.candidateCount }, (_, index) => {
    const role = pick(roles), unit = ROLE_UNIT[role];
    let cursor = random() * total;
    const rarity = weights.find(([, value]) => (cursor -= value.weight) < 0)?.[0] ?? "COMMON" /* COMMON */;
    const tuning = RECRUIT_CONFIG.rarity[rarity];
    const stat = () => Math.max(1, Math.round(tuning.baseStat + (random() * 2 - 1) * tuning.jitter));
    let id = `rec_${now}_${Math.floor(random() * 1e6)}_${index}`;
    while (used.has(id)) id += "_n";
    used.add(id);
    return {
      id,
      name: `${pick(RECRUIT_FIRST_NAMES)} ${pick(RECRUIT_LAST_NAMES)}`,
      role,
      unit,
      rarity,
      level: 1,
      stats: { strength: stat(), speed: stat(), iq: stat() },
      maxStat: RARITY_CONFIG[rarity].maxStat,
      worldPos: { x: 60, y: 12, z: 0 },
      targetPos: { x: 60, y: 12, z: 0 },
      state: "IDLE" /* IDLE */,
      avatarColor: UNIT_COLOR[unit],
      tendency: pick(TENDENCY_KEYS)
    };
  });
  return { candidates, generatedAt: now };
}
function applyClubAction(previous, input, context) {
  const fail2 = (code, message) => ({ ok: false, state: previous, code, message });
  const command = parseClubAction(input);
  if (!command) return fail2("invalid_command", "Choose a valid club action.");
  if (!Number.isSafeInteger(context.now) || context.now < 0 || context.now > 864e13 || context.now < previous.lastTick || context.calendarDate !== void 0 && !/^\d{4}-\d{2}-\d{2}$/.test(context.calendarDate)) return fail2("invalid_clock", "Club time could not be verified.");
  if (!validBalances(previous)) return fail2("invalid_state", "Club progress could not be verified.");
  const state = settleClubState(previous, context);
  const now = context.now;
  const random = () => {
    const value = context.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("Authority random source must return a finite value in [0, 1).");
    return value;
  };
  const success = (next, receipt = {}) => validBalances(next) ? { ok: true, state: next, result: { type: command.type, ...receipt } } : fail2("invalid_state", "This action would produce invalid club progress.");
  const spend = (resource, cost) => Number.isSafeInteger(cost) && cost >= 0 && state.resources[resource] >= cost;
  const stadiumLevel = state.buildings.find((value) => value.type === "STADIUM" /* STADIUM */)?.level ?? 1;
  const makeJob = (kind, key, toLevel, duration) => {
    let id = `${kind === "hero" ? "hj" : "up"}_${now}_${key}_${Math.floor(random() * 1e6)}`;
    while (state.upgrades.some((value) => value.id === id)) id += "_n";
    return { id, kind, key, toLevel, startTime: now, finishTime: now + duration * 1e3 };
  };
  switch (command.type) {
    case "sync":
      return success(state);
    case "defense.seen": {
      const ids = new Set(command.ids);
      return success({ ...state, defenseLog: state.defenseLog.map((entry) => ids.has(entry.id) && !entry.seen ? { ...entry, seen: true } : entry) });
    }
    case "club.rename":
      return success({ ...state, teamName: command.name.trim().replace(/\s+/g, " ") });
    case "facility.collect": {
      const building = state.buildings.find((value) => value.id === command.buildingId);
      const collector = building && COLLECTOR_CONFIG[building.type];
      if (!building || !collector) return fail2("not_found", "That facility does not collect resources.");
      const amount = Math.floor(building.accrued ?? 0);
      if (amount <= 0) return fail2("not_ready", "There are no resources to collect yet.");
      const next = {
        ...state,
        resources: { ...state.resources, [collector.resource]: state.resources[collector.resource] + amount },
        peakFans: nextFanMilestone(state, collector.resource === "FANS" /* FANS */ ? amount : 0),
        buildings: state.buildings.map((value) => value.id === building.id ? { ...value, accrued: 0 } : value)
      };
      return success(collector.resource === "COINS" /* COINS */ ? progressClubDaily(next, "bank_coins", amount) : next, { buildingId: building.id, gained: { [collector.resource]: amount } });
    }
    case "facility.upgrade": {
      const building = state.buildings.find((value) => value.id === command.buildingId);
      if (!building) return fail2("not_found", "That facility was not found.");
      if (state.upgrades.some((value) => value.kind === "building" && value.key === building.id) || state.upgrades.length >= state.builders) return fail2("busy", "Wait for a builder to finish.");
      if (building.type !== "STADIUM" /* STADIUM */ && building.level >= stadiumLevel) return fail2("locked", "Upgrade the Stadium first.");
      const cost = Math.floor(UPGRADE_CONFIG.baseCost * UPGRADE_CONFIG.costMultiplier ** (building.level - 1));
      if (!spend("COINS" /* COINS */, cost)) return fail2("insufficient_resources", "Not enough coins.");
      const job = makeJob("building", building.id, building.level + 1, upgradeDurationSecs(building.level + 1));
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, upgrades: [...state.upgrades, job] }, { buildingId: building.id, jobId: job.id, toLevel: job.toLevel, spent: { COINS: cost } });
    }
    case "facility.rush": {
      const job = state.upgrades.find((value) => value.id === command.jobId);
      if (!job) return fail2("not_found", "That upgrade is already complete or unavailable.");
      const cost = skipGemCost((job.finishTime - now) / 1e3);
      if (!spend("GEMS" /* GEMS */, cost)) return fail2("insufficient_resources", "Not enough Crowns.");
      const purchased = { ...state, resources: { ...state.resources, GEMS: state.resources.GEMS - cost }, upgrades: state.upgrades.map((value) => value.id === job.id ? { ...value, finishTime: now } : value) };
      return success({ ...purchased, ...advanceEconomy(purchased, now) }, { jobId: job.id, toLevel: job.toLevel, spent: { GEMS: cost } });
    }
    case "builder.hire": {
      if (state.builders >= MAX_BUILDERS) return fail2("limit_reached", "All builders are already hired.");
      const cost = builderHireCost(state.builders);
      if (!spend("GEMS" /* GEMS */, cost)) return fail2("insufficient_resources", "Not enough Crowns.");
      return success({ ...state, builders: state.builders + 1, resources: { ...state.resources, GEMS: state.resources.GEMS - cost } }, { spent: { GEMS: cost } });
    }
    case "rally": {
      const preview = rallyPreview(state);
      if (!preview.canRally) return fail2(state.resources.ENERGY >= 100 ? "limit_reached" : "insufficient_resources", state.resources.ENERGY >= 100 ? "Energy is already full." : "Not enough Fans.");
      return success(rallyFans(state), { spent: { FANS: preview.fanCost }, gained: { ENERGY: preview.energyGain } });
    }
    case "training.start": {
      const drill = Object.prototype.hasOwnProperty.call(DRILLS, command.drillId) ? DRILLS[command.drillId] : void 0;
      if (!drill || drill.targetUnit !== "ALL" && drill.targetUnit !== command.unit) return fail2("invalid_command", "That drill does not train this unit.");
      const pitch = state.buildings.find((value) => value.type === "TRAINING_PITCH" /* TRAINING_PITCH */ && value.state === "IDLE" /* IDLE */);
      if (!pitch) return fail2("busy", "The Training Field is busy.");
      if (pitch.level < drill.levelReq) return fail2("locked", "Upgrade the Training Field for this drill.");
      if (!state.roster.some((value) => drill.targetUnit === "ALL" || value.unit === command.unit)) return fail2("not_found", "No players in this training unit.");
      if (!spend("ENERGY" /* ENERGY */, drill.costEnergy)) return fail2("insufficient_resources", "Not enough Energy.");
      const anchor = state.campusLayout ? pitch : displayAnchorOf(pitch);
      return success({
        ...state,
        resources: { ...state.resources, ENERGY: state.resources.ENERGY - drill.costEnergy },
        buildings: state.buildings.map((value) => value.id === pitch.id ? { ...value, state: "ACTIVE" /* ACTIVE */, activeDrillId: drill.id, targetUnit: command.unit, startTime: now, finishTime: now + drill.durationSeconds * 1e3 } : value),
        roster: state.roster.map((value) => drill.targetUnit === "ALL" || value.unit === command.unit ? { ...value, state: "WALKING" /* WALKING */, targetPos: { x: anchor.gridX * 10 + 10 + random() * 6 - 3, y: anchor.gridY * 10 + 10 + random() * 6 - 3, z: 1 } } : value)
      }, { buildingId: pitch.id, spent: { ENERGY: drill.costEnergy } });
    }
    case "training.collect": {
      const pitch = state.buildings.find((value) => value.id === command.buildingId && value.type === "TRAINING_PITCH" /* TRAINING_PITCH */);
      if (!pitch) return fail2("not_found", "The Training Field was not found.");
      const drill = pitch.activeDrillId && Object.prototype.hasOwnProperty.call(DRILLS, pitch.activeDrillId) ? DRILLS[pitch.activeDrillId] : void 0;
      if (!drill || pitch.state !== "COMPLETED" /* COMPLETED */ || pitch.finishTime === null || pitch.finishTime > now) return fail2("not_ready", "The drill is not ready to collect.");
      const coins = Math.round(drill.rewardCoins * trainingYieldMult(pitch.level));
      const warRoomLevel = state.buildings.find((value) => value.type === "TACTICS_ROOM" /* TACTICS_ROOM */)?.level ?? 1;
      const next = {
        ...state,
        resources: { ...state.resources, COINS: state.resources.COINS + coins },
        teamReadiness: Math.min(100, state.teamReadiness + drill.readinessGain * warRoomReadinessMult(warRoomLevel)),
        roster: state.roster.map((value) => drill.targetUnit === "ALL" || value.unit === pitch.targetUnit ? {
          ...value,
          level: value.level + 1,
          stats: { strength: value.stats.strength + 1, speed: value.stats.speed + 1, iq: value.stats.iq + 1 },
          state: "IDLE" /* IDLE */,
          targetPos: { ...value.worldPos, z: 0 }
        } : value),
        buildings: state.buildings.map((value) => value.id === pitch.id ? { ...value, state: "IDLE" /* IDLE */, activeDrillId: null, targetUnit: null, startTime: null, finishTime: null } : value)
      };
      return success(progressClubDaily(next, "drills"), { buildingId: pitch.id, gained: { COINS: coins } });
    }
    case "hero.train": {
      const hero = state.heroes.find((value) => value.key === command.heroKey);
      if (!hero?.unlocked || !HERO_DEFS.some((value) => value.key === hero.key)) return fail2("locked", "Unlock this hero first.");
      if (state.upgrades.some((value) => value.kind === "hero" && value.key === hero.key)) return fail2("busy", "This hero is already training.");
      if (hero.level >= heroMaxLevel(stadiumLevel)) return fail2("locked", "Upgrade the Stadium to train this hero further.");
      const cost = heroUpgradeCost(hero.level);
      if (!spend("COINS" /* COINS */, cost)) return fail2("insufficient_resources", "Not enough coins.");
      const job = makeJob("hero", hero.key, hero.level + 1, Math.round(upgradeDurationSecs(hero.level + 1) * 3));
      return success(progressClubDaily({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, upgrades: [...state.upgrades, job] }, "train_hero"), { heroKey: hero.key, jobId: job.id, toLevel: job.toLevel, spent: { COINS: cost } });
    }
    case "hero.unlock": {
      const def = HERO_DEFS.find((value) => value.key === command.heroKey);
      const hero = state.heroes.find((value) => value.key === command.heroKey);
      if (!def?.unlock || !hero) return fail2("not_found", "That hero cannot be unlocked here.");
      if (hero.unlocked) return fail2("already_claimed", "This hero is already yours.");
      const coins = def.unlock.coins ?? 0, gems = def.unlock.gems ?? 0;
      if (!spend("COINS" /* COINS */, coins) || !spend("GEMS" /* GEMS */, gems)) return fail2("insufficient_resources", "Not enough coins or Crowns.");
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - coins, GEMS: state.resources.GEMS - gems }, heroes: state.heroes.map((value) => value.key === hero.key ? { ...value, unlocked: true } : value) }, { heroKey: hero.key, spent: { COINS: coins, GEMS: gems } });
    }
    case "hero.star": {
      const hero = state.heroes.find((value) => value.key === command.heroKey);
      if (!hero?.unlocked) return fail2("locked", "Unlock this hero first.");
      if (hero.stars >= MAX_STARS) return fail2("limit_reached", "This hero has reached maximum stars.");
      const cost = STAR_UP_COSTS[hero.stars];
      if (!cost || hero.shards < cost) return fail2("insufficient_resources", "Not enough hero shards.");
      return success({ ...state, heroes: state.heroes.map((value) => value.key === hero.key ? { ...value, stars: value.stars + 1, shards: value.shards - cost } : value) }, { heroKey: hero.key, toLevel: hero.stars + 1 });
    }
    case "hero.scout": {
      if (!spend("GEMS" /* GEMS */, ROLL_COST_GEMS)) return fail2("insufficient_resources", "Not enough Crowns.");
      const weights = HERO_DEFS.map((value) => value.starter ? 20 : value.unlock?.gems ? 3 : 10);
      let cursor = random() * weights.reduce((sum, value) => sum + value, 0);
      const index = weights.findIndex((weight) => (cursor -= weight) < 0);
      const def = HERO_DEFS[index < 0 ? HERO_DEFS.length - 1 : index];
      const hero = state.heroes.find((value) => value.key === def.key);
      if (!hero) return fail2("invalid_state", "The hero roster could not be verified.");
      const roll = { key: hero.key, name: def.name, isNew: !hero.unlocked, shards: hero.unlocked ? 14 + Math.floor(random() * 9) : 0 };
      return success(progressClubDaily({ ...state, resources: { ...state.resources, GEMS: state.resources.GEMS - ROLL_COST_GEMS }, heroes: state.heroes.map((value) => value.key === hero.key ? { ...value, unlocked: true, shards: value.shards + roll.shards } : value) }, "scout"), { heroKey: hero.key, roll, spent: { GEMS: ROLL_COST_GEMS } });
    }
    case "recruit.refresh": {
      if (state.recruitSlot) return fail2("busy", "Finish scouting your current player first.");
      return success({ ...state, recruitBoard: recruitBoard(state, now, random) });
    }
    case "recruit.start": {
      if (state.recruitSlot) return fail2("busy", "A player is already being scouted.");
      const academy = state.buildings.find((value) => value.type === "YOUTH_ACADEMY" /* YOUTH_ACADEMY */);
      if (!academy) return fail2("not_found", "The Scouting Dept was not found.");
      if (state.roster.length >= rosterCap(academy.level)) return fail2("limit_reached", "Your roster is full.");
      const candidate = state.recruitBoard?.candidates.find((value) => value.id === command.candidateId);
      if (!candidate || state.roster.some((value) => value.id === candidate.id)) return fail2("not_found", "Refresh the board and choose an available prospect.");
      const cost = recruitCost(candidate);
      if (!spend("COINS" /* COINS */, cost)) return fail2("insufficient_resources", "Not enough coins.");
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, recruitSlot: { candidate: structuredClone(candidate), cost, finishTime: now + recruitSeconds(candidate) * 1e3 }, recruitBoard: { ...state.recruitBoard, candidates: state.recruitBoard.candidates.filter((value) => value.id !== candidate.id) } }, { playerId: candidate.id, spent: { COINS: cost } });
    }
    case "recruit.rush": {
      if (!state.recruitSlot) return fail2("not_found", "No player is being scouted.");
      if (state.recruitSlot.finishTime <= now) return fail2("not_ready", "This player is already ready to sign.");
      const cost = RECRUIT_CONFIG.rushGemCost;
      if (!spend("GEMS" /* GEMS */, cost)) return fail2("insufficient_resources", "Not enough Crowns.");
      return success({ ...state, resources: { ...state.resources, GEMS: state.resources.GEMS - cost }, recruitSlot: { ...state.recruitSlot, finishTime: now } }, { playerId: state.recruitSlot.candidate.id, spent: { GEMS: cost } });
    }
    case "recruit.sign": {
      const slot = state.recruitSlot;
      if (!slot || slot.finishTime > now) return fail2("not_ready", "The prospect is not ready to sign.");
      const academy = state.buildings.find((value) => value.type === "YOUTH_ACADEMY" /* YOUTH_ACADEMY */);
      if (!academy || state.roster.length >= rosterCap(academy.level)) return fail2("limit_reached", "Your roster is full.");
      if (state.roster.some((value) => value.id === slot.candidate.id)) return fail2("already_claimed", "This player is already signed.");
      const spawn = { x: 56 + random() * 10, y: 8 + random() * 10, z: 0 };
      const next = { ...state, recruitSlot: null, roster: [...state.roster, { ...slot.candidate, worldPos: spawn, targetPos: { ...spawn }, state: "IDLE" /* IDLE */ }] };
      return success({ ...next, recruitBoard: recruitBoard(next, now, random) }, { playerId: slot.candidate.id });
    }
    case "recruit.cut": {
      if (state.roster.length <= 6) return fail2("limit_reached", "Keep at least six players on your roster.");
      if (!state.roster.some((value) => value.id === command.playerId)) return fail2("not_found", "That player was not found.");
      return success({ ...state, roster: state.roster.filter((value) => value.id !== command.playerId) }, { playerId: command.playerId });
    }
    case "daily.claim": {
      const slate = questsForDate(state.dailies.date), quest = slate.find((value) => value.id === command.questId);
      if (!quest) return fail2("not_found", "That quest is not on today\u2019s slate.");
      if (state.dailies.claimed.includes(quest.id)) return fail2("already_claimed", "This daily reward was already claimed.");
      if ((state.dailies.progress[quest.id] ?? 0) < quest.target) return fail2("not_ready", "Finish the daily objective first.");
      const claimed = [...state.dailies.claimed, quest.id];
      const sweep = !state.dailies.sweepClaimed && slate.every((value) => claimed.includes(value.id));
      const gems = (quest.reward.gems ?? 0) + (sweep ? SWEEP_BONUS_GEMS : 0), coins = quest.reward.coins ?? 0;
      return success({ ...state, resources: { ...state.resources, GEMS: state.resources.GEMS + gems, COINS: state.resources.COINS + coins }, dailies: { ...state.dailies, claimed, sweepClaimed: state.dailies.sweepClaimed || sweep } }, { gained: { GEMS: gems, COINS: coins } });
    }
    case "defense.buy-slot": {
      if (state.bonusDefSlots >= EXTRA_SLOT_COSTS.length) return fail2("limit_reached", "All extra equipment slots are unlocked.");
      const cost = EXTRA_SLOT_COSTS[state.bonusDefSlots];
      if (!spend("GEMS" /* GEMS */, cost)) return fail2("insufficient_resources", "Not enough Crowns.");
      return success({ ...state, bonusDefSlots: state.bonusDefSlots + 1, resources: { ...state.resources, GEMS: state.resources.GEMS - cost } }, { spent: { GEMS: cost } });
    }
    case "defense.upgrade-slot": {
      const slot = slotById(state.formation, command.slotId);
      if (!slot) return fail2("not_found", "That equipment slot was not found.");
      const toLevel = (state.defenseSlots[slot.id] ?? 0) + 1;
      if (toLevel > MAX_SLOT_LEVEL) return fail2("limit_reached", "This equipment is at maximum level.");
      if (!slotUnlocked(slot, stadiumLevel, state.bonusDefSlots) || toLevel > stadiumLevel) return fail2("locked", "Unlock this slot or upgrade the Stadium first.");
      const cost = slotUpgradeCost(slot.kind, toLevel);
      if (!spend("COINS" /* COINS */, cost)) return fail2("insufficient_resources", "Not enough coins.");
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, defenseSlots: { ...state.defenseSlots, [slot.id]: toLevel } }, { toLevel, spent: { COINS: cost } });
    }
    case "formation.set": {
      if (!formationUnlocked(command.formation, stadiumLevel)) return fail2("locked", "That formation is not available.");
      const anchors = anchorsFor(command.formation);
      return success({ ...state, formation: command.formation, campusLayout: void 0, buildings: state.buildings.map((value) => ({ ...value, ...anchors[value.type] })) });
    }
    case "campus.apply": {
      const layout2 = parseCampusLayout(command.layout, state.buildings);
      if (!layout2) return fail2("invalid_command", "Keep every owned facility and a valid route through the campus.");
      return success(applyCampusLayout(state, layout2));
    }
    case "gate.assign": {
      if (!gatePostsFor(state.formation).some((value) => value.id === command.postId)) return fail2("not_found", "That gate was not found.");
      if (!state.heroes.some((value) => value.key === command.heroKey && value.unlocked)) return fail2("locked", "Unlock this hero first.");
      const gates = Object.fromEntries(Object.entries(state.heroGates).filter(([, hero]) => hero !== command.heroKey));
      gates[command.postId] = command.heroKey;
      return success({ ...state, heroGates: gates }, { heroKey: command.heroKey });
    }
    case "parking.upgrade": {
      if (state.parkingLot >= PARKING_LOT.maxLevel) return fail2("limit_reached", "The Parking Lot is fully paved.");
      const cost = PARKING_LOT.costs[state.parkingLot];
      if (!spend("COINS" /* COINS */, cost)) return fail2("insufficient_resources", "Not enough coins.");
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, parkingLot: state.parkingLot + 1 }, { toLevel: state.parkingLot + 1, spent: { COINS: cost } });
    }
  }
}

// campaign.ts
var coachArt = (slug) => `/assets/coaches/${slug}.webp`;
var COACHES = [
  { name: 'Coach "Salty" Pete Grimes', emoji: "\u{1F920}", art: coachArt("grimes"), color: "#ca8a04", intro: "New coach, huh? We're the worst team in the league and I STILL like our chances.", win: "Well\u2026 shoot. Kid can coach.", loss: "HA! Beat by the Dust Bowl! Tell everyone." },
  { name: "Coach Deb Chalmers", emoji: "\u{1F469}\u200D\u{1F3EB}", art: coachArt("chalmers"), color: "#0ea5e9", intro: "I've already graded your film. It's a D-minus.", win: "Hmph. Extra credit earned. This time.", loss: "As calculated. Study harder, dear." },
  { name: "Coach Sal Marino", emoji: "\u2693", art: coachArt("marino"), color: "#0891b2", intro: "My Hawks eat rookies for breakfast. You're looking real bite-sized.", win: "Rough seas\u2026 you sailed through us. Respect.", loss: "Glub glub. Another one sinks in the Harbor!" },
  { name: 'Coach "Binary" Bob Nakamura', emoji: "\u{1F913}", art: coachArt("nakamura"), color: "#6366f1", intro: "My model gives you a 12.7% chance. I rounded UP to be polite.", win: "Recalibrating\u2026 you broke my model. Impressive.", loss: "The math never lies. 87.3%, as predicted." },
  { name: "Coach June Wilder", emoji: "\u{1F406}", art: coachArt("wilder"), color: "#d97706", intro: "Pumas hunt in the open field. Hope your slow boys can run.", win: "Fast AND tough. Fine \u2014 you've earned the plains.", loss: "Told you. Never outrun a Puma." },
  { name: 'Coach "Icebox" Olsen', emoji: "\u{1F976}", art: coachArt("olsen"), color: "#38bdf8", intro: "Midseason's where pretenders freeze. Bundle up, kid.", win: "You\u2026 thawed us out. Nobody does that.", loss: "Frozen solid at midfield. Classic." },
  { name: "Coach Remy LaRoux", emoji: "\u{1F40A}", art: coachArt("laroux"), color: "#16a34a", intro: "Welcome to the Bayou, cher. Ain't nobody leaves with their lunch money.", win: "Sacre bleu\u2026 take the lunch money. You earned it.", loss: "The swamp keeps what it catches, cher." },
  { name: 'Coach "Bricks" Kowalski', emoji: "\u{1F9F1}", art: coachArt("kowalski"), color: "#78716c", intro: "Iron City don't do finesse. We're gonna lean on you 'til you quit.", win: "You hit harder than my whole front line. Ouch.", loss: "Another soft team bounces off the wall." },
  { name: "Coach Vince Deluxe", emoji: "\u{1F576}\uFE0F", art: coachArt("deluxe"), color: "#a855f7", intro: "Big lights, big stage. You sure you belong on Metro turf, kid?", win: "Bright lights suit you. Don't let it go to your head.", loss: "Stick to the small towns, sweetheart." },
  { name: "Coach Sterling Cross", emoji: "\u{1F451}", art: coachArt("cross"), color: "#eab308", intro: "The Knights have never lost a Divisional at home. Tradition is armor.", win: "The crown\u2026 slips. Wear it well, coach.", loss: "Tradition holds. It always holds." },
  { name: "Coach Vera Voss", emoji: "\u{1FA78}", art: coachArt("voss"), color: "#b91c1c", intro: "The Empire doesn't rebuild. It reloads. You're just the next target.", win: "An Empire falls. Savor it \u2014 I would.", loss: "The Empire feeds on hope like yours." },
  { name: 'Coach Marcus "The GOAT" Hale', emoji: "\u{1F410}", art: coachArt("hale"), color: "#f97316", intro: "Eleven rings. Nobody remembers second place. You won't even be a footnote.", win: "Twelve teams tried. One finished it. Take the ring \u2014 you ARE the story now.", loss: "And THAT is why they call me the GOAT." }
];
var coachForStage = (stage) => COACHES[(stage - 1) % COACHES.length];
var RAID_COACHES = [
  { name: "Coach Buck Tanner", emoji: "\u{1F624}", art: coachArt("tanner"), color: "#dc2626", intro: "You picked the wrong stadium to raid, son.", win: "Take the coins. I want a rematch.", loss: "Not in MY house!" },
  { name: "Coach Rosa Vega", emoji: "\u{1F60F}", art: coachArt("vega"), color: "#db2777", intro: "Cute little squad. Watch them get flattened.", win: "Okay, okay. The squad's not so little.", loss: "Flattened. Like I said." },
  { name: "Coach Duke Holloway", emoji: "\u{1F9D0}", art: coachArt("holloway"), color: "#7c3aed", intro: "I schemed all week for exactly this.", win: "Back to the drawing board\u2026", loss: "Schemed. Executed. Handled." },
  { name: "Coach Mabel Frost", emoji: "\u{1F608}", art: coachArt("frost"), color: "#0284c7", intro: "My defense hasn't given up a TD in weeks.", win: "The streak\u2026 THE STREAK!", loss: "And the streak lives on." },
  { name: "Coach Tony Two-Times", emoji: "\u{1F928}", art: coachArt("twotimes"), color: "#ea580c", intro: "I'll say it twice: go home. GO HOME.", win: "I'll say it once: well played.", loss: "Told ya twice. TOLD YA TWICE." },
  { name: "Coach Grandma Hux", emoji: "\u{1F475}", art: coachArt("hux"), color: "#65a30d", intro: "Sweetie, I've been beating hotshots since before you were born.", win: "Fine, you get a cookie. ONE cookie.", loss: "Respect your elders, dear." }
];
var coachForBase = (baseName) => {
  let h = 0;
  for (let i = 0; i < baseName.length; i++) h = h * 31 + baseName.charCodeAt(i) >>> 0;
  return RAID_COACHES[h % RAID_COACHES.length];
};
var SCHEDULE = [
  ["Preseason Opener", "Dust Bowl Prospects"],
  ["Week 2", "Valley State"],
  ["Week 3", "Harbor Hawks"],
  ["Week 4", "Tech University"],
  ["Week 5", "Prairie Pumas"],
  ["Midseason Clash", "North Sharks"],
  ["Week 7", "Bayou Bandits"],
  ["Week 8", "Iron City"],
  ["Week 9", "Metro Mustangs"],
  ["Divisional Round", "Golden Knights"],
  ["Conference Final", "Crimson Empire"],
  ["THE CHAMPIONSHIP", "The Dynasty"]
];
var CAMPAIGN_STRENGTH = [0.55, 0.74, 2.8, 4.2, 4.9, 5.7, 6.7, 7.8, 9, 10.5, 12, 13.8];
var CAMPAIGN_STAGES = SCHEDULE.map(([name, opponent], i) => {
  const stage = i + 1;
  const mult = CAMPAIGN_STRENGTH[i];
  return {
    stage,
    name,
    opponent,
    mult,
    reward: { coins: Math.round(300 + 240 * mult), fans: Math.round(10 + 9 * mult) },
    firstClear: {
      gems: 6 + stage * 2,
      // 8 → 30 gems across the season
      shardHero: HERO_DEFS[i % HERO_DEFS.length].key,
      // every hero gets fed across 12 weeks
      shards: 8 + stage * 2
    }
  };
});
var CAMPAIGN_TEMPLATE_IDS = [
  "valley",
  "tech",
  "harbor",
  "summit",
  "delta",
  "ridge",
  "valley",
  "tech",
  "harbor",
  "summit",
  "delta",
  "ridge"
];
var campaignBase = (stage) => {
  const st = CAMPAIGN_STAGES[stage - 1];
  const templateId = CAMPAIGN_TEMPLATE_IDS[(stage - 1) % CAMPAIGN_TEMPLATE_IDS.length];
  const template = ENEMY_BASES.find((b) => b.id === templateId) ?? ENEMY_BASES[0];
  const tDmg = Math.round(9 * Math.pow(st.mult, 1.25));
  const buildings = template.buildings.map((b) => ({
    ...b,
    hp: Math.round(b.hp * st.mult),
    damage: b.damage ? tDmg : b.damage
  }));
  const extraSpots = [[30, 50], [70, 50], [50, 32], [50, 68], [38, 62]];
  const extras = stage >= 11 ? 5 : stage >= 9 ? 4 : stage >= 7 ? 3 : stage >= 5 ? 2 : stage >= 3 ? 1 : 0;
  const flavors = ["ref", "tshirt", "sled", "tshirt", "ref"];
  for (let e = 0; e < extras; e++) {
    const [x, y] = extraSpots[e];
    buildings.push({ id: `cd${e}`, kind: "defense", flavor: flavors[e], x, y, hp: Math.round(230 * st.mult), size: 5, damage: tDmg, range: 23 });
  }
  return { id: `camp_${stage}`, name: st.opponent, difficulty: st.mult, reward: st.reward, buildings };
};

// ranks.ts
var trophiesForRaid = (won, stars) => won ? 6 + stars * 7 : -8;

// defense.ts
var ovr = (p) => (p.stats.strength + p.stats.speed + p.stats.iq) / 3;
var defenseTroopBoost = (roster) => {
  const defRaw = roster.reduce((s, p) => {
    const t = TENDENCIES[p.tendency];
    if (!t) return s;
    const w = t.side === "defense" ? 1 : t.side === "balanced" ? 0.5 : 0;
    return s + ovr(p) * w;
  }, 0);
  return 1 + Math.min(0.3, defRaw / 250 * 0.3);
};

// game/combat/actionTiming.ts
function signatureFrameAt(elapsed, windup, recovery) {
  if (elapsed < windup * 0.5) return 0;
  if (elapsed + 1e-9 < windup) return 1;
  if (elapsed + 1e-9 < windup + recovery * 0.5) return 2;
  if (elapsed + 1e-9 < windup + recovery) return 3;
  return void 0;
}

// game/combat/actions.ts
var COMBAT_RULES_VERSION = "hero-actions-3";
function applyBuildingYardage(actor, target, requested) {
  if (target.dead || !Number.isFinite(requested) || requested <= 0) return [];
  const amount = Math.min(Math.max(0, target.hp), requested);
  target.hp = Math.max(0, target.hp - amount);
  actor.dmg = (actor.dmg ?? 0) + amount;
  const events = [{ type: "yardage", actorId: actor.id, targetId: target.id, amount, x: target.x, y: target.y }];
  if (target.hp <= 0) {
    target.dead = true;
    actor.targetId = null;
    events.push({ type: "sacked", actorId: actor.id, targetId: target.id, kind: target.kind, x: target.x, y: target.y });
  }
  return events;
}
function beginHeroAction(actor, buildings, tick) {
  if (actor.dead || !actor.ability || (actor.abilityCd ?? 0) > 0 || actor.activeAction) return null;
  const projectile = actor.ability === "hailmary" || actor.ability === "onside_bomb";
  const target = projectile || actor.ability === "burner_dash" || actor.ability === "truckstick" ? nearestBuilding(actor.x, actor.y, buildings) : void 0;
  if ((projectile || actor.ability === "burner_dash") && !target) return null;
  const action = {
    id: `${actor.id}:signature:${tick}`,
    actorId: actor.id,
    heroKey: actor.heroKey ?? "",
    ability: actor.ability,
    elapsed: 0,
    windup: projectile ? 0.35 : 0.2,
    travel: projectile && target ? Math.max(0.45, Math.min(0.85, dist(actor.x, actor.y, target.x, target.y) / 65)) : 0,
    recovery: projectile ? 0.3 : 0.25,
    released: false,
    resolved: false,
    sx: actor.x,
    sy: actor.y,
    tx: target?.x ?? actor.x,
    ty: target?.y ?? actor.y,
    targetId: target?.id
  };
  actor.activeAction = action.id;
  actor.signatureFrame = 0;
  actor.abilityCd = ABILITY_CD;
  actor.abilityPoseT = 0;
  return action;
}
function recover(actor, target, amount, events = []) {
  if (target.dead || !Number.isFinite(amount) || amount <= 0) return;
  const actual = Math.min(Math.max(0, target.maxHp - target.hp), amount);
  if (actual <= 0) return;
  target.hp += actual;
  actor.healingDone = (actor.healingDone ?? 0) + actual;
  events.push({ type: "recovery", actorId: actor.id, targetId: target.id, amount: actual, x: target.x, y: target.y });
}
function creditHype(actor, targetHp, boostedHit, troops) {
  if (!actor.hypeSource || actor.rageT <= 0 || !Number.isFinite(boostedHit) || boostedHit <= 0 || targetHp <= 0) return;
  const source = troops.find((t) => t.id === actor.hypeSource);
  if (!source || source === actor) return;
  const extra = Math.max(0, Math.min(targetHp, boostedHit) - Math.min(targetHp, boostedHit / 2));
  source.boostedYards = (source.boostedYards ?? 0) + extra;
}
function applyTroopPressure(target, raw, troops) {
  if (target.dead || !Number.isFinite(raw) || raw <= 0) return 0;
  const shield = (target.shieldT ?? 0) > 0;
  const amount = Math.min(target.hp, raw * (shield ? 0.5 : 1));
  if (shield && target.shieldSource) {
    const source = troops.find((t) => t.id === target.shieldSource);
    if (source) source.protectionDone = (source.protectionDone ?? 0) + Math.max(0, Math.min(target.hp, raw) - amount);
  }
  target.hp = Math.max(0, target.hp - amount);
  return amount;
}
function stepHeroActions(actions, troops, buildings, dt) {
  const events = [];
  for (const action of actions) {
    const actor = troops.find((t) => t.id === action.actorId);
    if (!actor) {
      action.elapsed = 99;
      continue;
    }
    if (actor.dead && !action.released) {
      actor.activeAction = void 0;
      actor.signatureFrame = void 0;
      action.elapsed = 99;
      continue;
    }
    action.elapsed += dt;
    actor.signatureFrame = actor.dead ? void 0 : signatureFrameAt(action.elapsed, action.windup, action.recovery);
    if (!action.released && action.elapsed + 1e-9 >= action.windup) {
      action.released = true;
      if (!actor.dead) actor.actionPoseT = action.recovery;
      events.push({ type: "signature-release", actorId: actor.id, heroKey: action.heroKey, ability: action.ability, x: action.sx, y: action.sy });
    }
    if (!action.resolved && action.elapsed + 1e-9 >= action.windup + action.travel) {
      action.resolved = true;
      const target = buildings.find((b) => b.id === action.targetId);
      if (action.ability === "hailmary" && target) events.push(...applyBuildingYardage(actor, target, 300 + actor.dps * 4));
      else if (action.ability === "onside_bomb" && target) {
        events.push(...applyBuildingYardage(actor, target, 500));
        for (const b of buildings) if (b.id !== target.id && dist(target.x, target.y, b.x, b.y) <= 12) events.push(...applyBuildingYardage(actor, b, 250));
      } else if (action.ability === "truckstick") {
        actor.rageT = 6;
        actor.hypeSource = void 0;
        actor.truckT = 1.8;
        recover(actor, actor, actor.maxHp, events);
      } else if (action.ability === "burner_dash") {
        actor.sprintT = 2.5;
        actor.rageT = 2.5;
        actor.hypeSource = void 0;
      } else if (action.ability === "trick_play") events.push({ type: "reinforcements", actorId: actor.id, x: actor.x, y: actor.y });
      else for (const t of troops) {
        if (t.dead) continue;
        const distance = dist(actor.x, actor.y, t.x, t.y);
        if (action.ability === "motivation" && distance <= 20) {
          if (t.rageT < 4) t.hypeSource = actor.id;
          t.rageT = Math.max(t.rageT, 4);
        }
        if (action.ability === "field_medic" && distance <= 18) {
          recover(actor, t, t.maxHp * 0.35, events);
          t.healT = Math.max(t.healT, 5);
          t.healingSource = actor.id;
        }
        if (action.ability === "shield_wall" && distance <= 16) {
          t.shieldT = Math.max(t.shieldT ?? 0, 5);
          t.shieldSource = actor.id;
        }
        if (action.ability === "hall_of_fame") {
          if (t.rageT < 6) t.hypeSource = actor.id;
          t.rageT = Math.max(t.rageT, 6);
          recover(actor, t, t.maxHp, events);
        }
      }
      events.push({ type: "signature-impact", actorId: actor.id, heroKey: action.heroKey, ability: action.ability, x: action.tx, y: action.ty });
    }
    if (action.elapsed + 1e-9 >= action.windup + action.recovery) actor.activeAction = void 0;
  }
  return events;
}
var actionFinished = (action) => action.elapsed + 1e-9 >= action.windup + action.travel + action.recovery;

// game/defenseSnapshot.ts
var clone = (v) => JSON.parse(JSON.stringify(v));
var byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
var reference = (value) => {
  let hash = 14695981039346656037n;
  const encoded = canonicalJson(value);
  for (let i = 0; i < encoded.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(encoded.charCodeAt(i))) * 1099511628211n);
  return `defense-v1-${hash.toString(16).padStart(16, "0")}`;
};
function createDefenseSnapshot(source) {
  const campus = campusLayoutForState(source);
  const buildings = campus.facilities.map((p) => {
    const owned = source.buildings.find((b) => b.id === p.id);
    return { ...owned, gridX: p.gridX, gridY: p.gridY };
  }).sort(byId);
  const stadiumLevel = buildings.find((b) => b.type === "STADIUM" /* STADIUM */)?.level ?? 1;
  const roster = source.roster.map((p) => ({ ...clone(p), worldPos: { x: 0, y: 0, z: 0 }, targetPos: { x: 0, y: 0, z: 0 }, state: "IDLE" /* IDLE */ })).sort(byId);
  const heroes2 = clone(source.heroes).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const equipment = {};
  const unlocked = slotsFor(campus.formation);
  for (const slot of campus.slots) {
    const def = unlocked.find((s) => s.id === slot.id);
    const level = source.defenseSlots[slot.id] ?? 0;
    if (Number.isInteger(level) && level >= 1 && level <= 10 && slotUnlocked(def, stadiumLevel, source.bonusDefSlots)) equipment[slot.id] = level;
  }
  const emplacements = campus.slots.filter((s) => equipment[s.id]).map((s) => ({ ...s, level: equipment[s.id] }));
  const holds = Math.max(0, source.formationMastery[campus.formation] ?? 0);
  const parkingLot = Math.max(0, Math.min(PARKING_LOT.maxLevel, source.parkingLot));
  const fans = Math.max(0, source.resources.FANS);
  const pool = heroesForBattle(heroes2).sort((a, b) => b.hp * b.dps - a.hp * a.dps || (a.key < b.key ? -1 : 1));
  const used = /* @__PURE__ */ new Set();
  const heroGates = {};
  for (const gate of campus.gates) {
    const hero = pool.find((h) => h.key === source.heroGates[gate.id] && !used.has(h.key));
    if (hero) {
      heroGates[gate.id] = hero.key;
      used.add(hero.key);
    }
  }
  for (const gate of campus.gates) if (!heroGates[gate.id]) {
    const hero = pool.find((h) => !used.has(h.key));
    if (hero) {
      heroGates[gate.id] = hero.key;
      used.add(hero.key);
    }
  }
  const squeeze = 1 - PARKING_LOT.compressPerLevel * parkingLot;
  const coordinate = (v) => 50 + (v - 50) * squeeze;
  const assignedHeroes = campus.gates.flatMap((gate) => {
    const h = pool.find((hero) => hero.key === heroGates[gate.id]);
    if (!h) return [];
    const guard = {
      jersey: 0,
      hp: Math.round(h.hp * 0.75),
      dps: Math.round(h.dps * 0.75 * 10) / 10,
      name: h.name,
      art: h.art,
      unit: h.unit,
      x: coordinate(gate.gridX * 10),
      y: coordinate(gate.gridY * 10)
    };
    return [{ gateId: gate.id, heroKey: h.key, guard }];
  });
  const snapshot = {
    version: 1,
    rules: COMBAT_RULES_VERSION,
    layoutId: campusLayoutId(campus),
    campus,
    facilities: buildings.map((b) => ({ id: b.id, type: b.type, level: b.level })),
    buildings: defenseLayoutFromBase(buildings, campus.walls.slice(0, wallCap(stadiumLevel)), defenseTroopBoost(roster) * masteryDefMult(holds), emplacements, campus.bus, parkingLot, wallHpFor(stadiumLevel), campus.formation),
    roster,
    heroStates: heroes2,
    heroGates,
    assignedHeroes,
    equipment,
    bonusDefSlots: source.bonusDefSlots,
    mastery: { formation: campus.formation, holds, tier: masteryLevel(holds) },
    crowd: { fans, parkingLot },
    homeGuards: [...homeDefenders(roster, parkingLot), ...assignedHeroes.map((a) => a.guard)]
  };
  return clone({ ...snapshot, snapshotId: reference(snapshot) });
}
function defenseBattleFields(snapshot) {
  return {
    buildings: clone(snapshot.buildings),
    homeGuards: clone(snapshot.homeGuards),
    fans: snapshot.crowd.fans,
    parkingLot: snapshot.crowd.parkingLot,
    masteryTier: snapshot.mastery.tier,
    defenseLayoutId: snapshot.layoutId,
    defenseSnapshotId: snapshot.snapshotId,
    defenseFormation: snapshot.campus.formation
  };
}

// game/combat/roster.ts
function rosterPreparation(roster, readiness = 0) {
  return Object.fromEntries(Object.values(UnitGroup).map((unit) => {
    const bonus = roster.filter((p) => p.unit === unit).reduce((sum, p) => {
      const side = TENDENCIES[p.tendency]?.side;
      return sum + (side === "offense" ? 0.06 : side === "balanced" ? 0.03 : 0);
    }, 0);
    return [unit, (1 + bonus) * (readiness >= 100 ? 1.15 : 1)];
  }));
}
function rosterTroop(player, id, x, y, boost = 1, jersey = 1) {
  const stats = unitCombatStats(player);
  const hp = Math.round(stats.hp * boost);
  return {
    id,
    unit: player.unit,
    x,
    y,
    hp,
    maxHp: hp,
    dps: stats.dps * boost,
    speed: stats.speed,
    range: stats.range,
    chargeRate: stats.chargeRate,
    role: player.role,
    nameTag: player.name,
    targetId: null,
    dead: false,
    hitFlash: 0,
    rageT: 0,
    healT: 0,
    jersey
  };
}
var routeRefreshSeconds = (actor) => 1.1 / Math.max(0.6, actor.chargeRate ?? 1);

// game/spriteFacing.ts
function spriteFacing(x, y, targetX, targetY, previous = 1) {
  const horizontal = targetX - x - (targetY - y);
  return Math.abs(horizontal) > 0.3 ? Math.sign(horizontal) : previous;
}

// game/spriteMotion.ts
function spriteMotion(from, to, seconds, previousFace = 1, previousStride = 0) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const moving = seconds > 0 && distance > 1e-4;
  const speed = moving ? distance / seconds : 0;
  return {
    // 6.3 field units per stride: subdivision and render cadence cannot change
    // footfall phase. A blocked actor keeps its phase until it moves again.
    stridePhase: moving ? (previousStride + distance / 6.3) % 1 : previousStride,
    moving,
    face: moving ? spriteFacing(0, 0, (to.x - from.x) / seconds, (to.y - from.y) / seconds, previousFace) : previousFace,
    strideSeconds: moving ? Math.max(0.28, Math.min(0.9, 0.42 * 15 / speed)) : 0.42
  };
}

// game/combat/engine.ts
var COMBAT_STEP_SECONDS = 0.05;
var DT = COMBAT_STEP_SECONDS;
function createBattleEngine(input, seed, planKey = "balanced") {
  const config = JSON.parse(JSON.stringify(input));
  const isDefense = config.mode === "defense";
  const isReplay = !!config.replay;
  const povDefense = isDefense || isReplay;
  const modernCombat = true;
  let rejectedCommands = 0;
  const heroes2 = config.heroes ?? [];
  const specials2 = config.specials ?? [];
  let troopUid = 0;
  const gameRand = mulberry32(seed);
  const rand = mulberry32(seed ^ 1597463007);
  const audio = [];
  const sfx = new Proxy({}, { get: (_, name) => () => audio.push({ name: String(name) }) });
  const crowdBedIntensity = (amount) => audio.push({ name: "intensity", amount });
  const actions = { current: [] };
  const planRef = { current: GAME_PLANS.find((p) => p.key === planKey) ?? GAME_PLANS[1] };
  const guardMult = config.aiMult ?? (() => {
    const d = config.buildings.find((b) => b.kind === "defense");
    return d?.damage ? Math.max(0.8, Math.min(3, d.damage / 16)) : 1;
  })();
  const emptyArmy = () => ({
    ["OFFENSE_LINE" /* OFFENSE_LINE */]: 0,
    ["OFFENSE_SKILL" /* OFFENSE_SKILL */]: 0,
    ["DEFENSE_LINE" /* DEFENSE_LINE */]: 0,
    ["DEFENSE_SECONDARY" /* DEFENSE_SECONDARY */]: 0
  });
  const makeTroop = (unit, x, y, mult = 1, rand2 = gameRand, player) => {
    const st = TROOP_STATS[unit];
    const rc = player ? ROLE_COMBAT[player.role] : void 0;
    const hp = Math.round(st.hp * mult * (rc?.hpMult ?? 1));
    return {
      id: `tr${++troopUid}`,
      unit,
      x,
      y,
      hp,
      maxHp: hp,
      dps: st.dps * mult * (rc?.dmgMult ?? 1),
      speed: st.speed * (rc?.speedMult ?? 1),
      range: rc?.range ?? st.range,
      targetId: null,
      dead: false,
      hitFlash: 0,
      rageT: 0,
      healT: 0,
      jersey: 1 + Math.floor(rand2() * 98),
      role: player?.role,
      nameTag: player?.name
    };
  };
  const makeHeroTroop = (h, x, y) => ({
    id: `hero_${h.key}_${++troopUid}`,
    unit: h.unit,
    x,
    y,
    hp: h.hp,
    maxHp: h.hp,
    dps: h.dps,
    speed: h.speed,
    range: h.key === "qb" ? 13 : h.key === "kicker" ? 16 : h.range,
    targetId: null,
    dead: false,
    hitFlash: 0,
    rageT: 0,
    healT: 0,
    isHero: true,
    heroKey: h.key,
    ability: h.ability,
    abilityCd: 0
  });
  const makeSpecialTroop = (def, x, y) => ({
    id: `sp_${def.key}_${++troopUid}`,
    unit: "OFFENSE_SKILL" /* OFFENSE_SKILL */,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    dps: def.dps,
    speed: def.speed,
    range: def.range,
    targetId: null,
    dead: false,
    hitFlash: 0,
    rageT: 0,
    healT: 0,
    special: def.key
  });
  const hashFlavor = (id) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = h * 31 + id.charCodeAt(i) >>> 0;
    return [void 0, "sled", "ref", "tshirt"][h % 4];
  };
  const sim = { current: {
    troops: (config.preTroops || []).map((t) => makeTroop(t.unit, t.x, t.y, config.aiMult ?? 1)),
    // Defense mode: YOUR recruited defenders start the game ringed around the stadium.
    guards: (() => {
      const gs = config.homeGuards ?? [];
      if (!gs.length) return [];
      const hq = config.buildings.find((b) => b.kind === "hq") ?? config.buildings[0];
      return gs.map((g, i) => {
        const a = i / gs.length * Math.PI * 2 + 0.6;
        const gx = g.x ?? hq.x + Math.cos(a) * 10;
        const gy = g.y ?? hq.y + Math.sin(a) * 10;
        return { id: `hg${++troopUid}`, unit: g.unit ?? "DEFENSE_LINE" /* DEFENSE_LINE */, x: gx, y: gy, hp: g.hp, maxHp: g.hp, dps: g.dps, speed: 12, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: g.jersey, guardArt: g.art };
      });
    })(),
    buildings: config.buildings.map((b) => ({ ...b, flavor: b.flavor ?? (b.kind === "defense" ? hashFlavor(b.id) : void 0), maxHp: b.hp, dead: false, cooldown: 0 })),
    shots: [],
    pulses: [],
    fx: [],
    puddles: [],
    shakeT: 0,
    punchT: 0,
    time: BATTLE_SECONDS,
    ended: false,
    guardT: 0,
    warned: false,
    commentary: { text: "", t: 0 },
    momentum: 0,
    pancakes: 0,
    lost: 0,
    bonus: 0,
    freezeT: 0,
    goalLine: false,
    crowdT: 0,
    ticks: 0,
    mascotOut: false,
    mascotT: 0,
    nextWave: 0,
    banner: null
  } };
  const armyRef = { current: { ...config.playerArmy ?? emptyArmy() } };
  const deployedHeroesRef = { current: /* @__PURE__ */ new Set() };
  const specialChargesRef = { current: Object.fromEntries(specials2.map((sp) => [sp.key, sp.charges])) };
  const plays = Object.fromEntries(PLAYBOOK.map((p) => [p.key, p.charges]));
  const masteryTier = Math.min(3, Math.max(0, config.masteryTier ?? 0));
  const defensePlays = { noise: 2 + masteryTier, pkg: 1 + (masteryTier >= 2 ? 1 : 0) + (masteryTier >= 3 ? 1 : 0), timeout: masteryTier >= 3 ? 1 : 0 };
  const squadQueues = { current: {} };
  for (const player of [...config.squad ?? []].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) (squadQueues.current[player.unit] ??= []).push(player);
  const say = (text4) => {
    sim.current.commentary = { text: text4, t: sim.current.time };
  };
  const script = [];
  let result = null;
  let started = isDefense || isReplay;
  let digest = 2166136261;
  const hash = (value) => {
    for (const c of canonicalJson(value)) {
      digest ^= c.charCodeAt(0);
      digest = Math.imul(digest, 16777619) >>> 0;
    }
  };
  hash([COMBAT_RULES_VERSION, { ...config, replay: void 0 }]);
  let planHashed = false;
  const hashPlan = () => {
    if (!planHashed) {
      hash(["plan", planRef.current.key]);
      planHashed = true;
    }
  };
  const endBattle = () => {
    if (sim.current.ended) return;
    const s = sim.current;
    const nw = s.buildings.filter((b) => b.kind !== "wall");
    const pct = nw.length ? Math.round(nw.reduce((sum, b) => sum + (1 - Math.max(0, b.hp) / b.maxHp), 0) / nw.length * 100) : 0;
    const hqDead = s.buildings.find((b) => b.kind === "hq")?.dead ?? false;
    const stars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
    const naturalEnd = s.time <= 0.05 || !s.troops.some((t) => !t.dead);
    const held = pct < 50;
    s.ended = true;
    result = {
      mode: config.mode,
      title: config.title,
      stars,
      pct,
      coins: config.practice ? 0 : Math.round(config.loot.coins * pct / 100) + s.bonus,
      fans: config.practice ? 0 : Math.round(config.loot.fans * pct / 100),
      won: isDefense ? held : stars > 0,
      campaignStage: config.campaignStage,
      pvpTarget: config.pvpTarget,
      isReplay: isReplay || void 0,
      isPractice: config.practice,
      defenseFormation: config.defenseFormation,
      defenseLayoutId: config.defenseLayoutId,
      defenseSnapshotId: config.defenseSnapshotId,
      ...config.gauntlet ? { gauntletTier: config.gauntlet.tier, wavesHeld: !held ? Math.max(0, s.nextWave - 1) : naturalEnd ? s.nextWave : Math.max(0, s.nextWave - 1), gauntletCleared: held && naturalEnd && s.nextWave >= config.gauntlet.waves.length } : {}
    };
  };
  const defFormation = config.buildings.find((b) => b.kind === "hq")?.formation ?? null;
  const counterMultFor = (planKey2) => {
    if (!defFormation || isDefense) return 1;
    const fdef = FORMATIONS[defFormation];
    if (!fdef) return 1;
    if (fdef.counter.weakTo.includes(planKey2)) return COUNTER_WEAK_MULT;
    if (fdef.counter.strongVs.includes(planKey2)) return COUNTER_STRONG_MULT;
    return 1;
  };
  const coach = (t) => {
    if (isDefense) return t;
    const p = planRef.current;
    t.hp = Math.round(t.hp * p.hp);
    t.maxHp = t.hp;
    t.dps *= p.dps * counterMultFor(p.key);
    t.speed *= p.speed;
    return t;
  };
  const doDeployTroop = (unit, x, y) => {
    const player = squadQueues.current[unit]?.shift();
    const troop = modernCombat && player?.stats ? rosterTroop(player, `tr${++troopUid}`, x, y, config.preparation?.[unit] ?? 1, 1 + Math.floor(gameRand() * 98)) : makeTroop(unit, x, y, config.power?.[unit] ?? 1, gameRand, player);
    sim.current.troops.push(coach(troop));
    sim.current.fx.push({ type: "land", x, y, life: 0.45, maxLife: 0.45 });
    sfx.thud();
    if (player) say(`${player.name.toUpperCase()} (${player.role}) \u2014 ${ROLE_COMBAT[player.role]?.power ?? "in the game"}!`);
  };
  const doDeployHero = (key, x, y) => {
    const h = heroes2.find((hh) => hh.key === key);
    if (!h) return;
    sim.current.troops.push(coach({ ...makeHeroTroop(h, x, y), deployedAt: sim.current.ticks }));
    sim.current.fx.push({ type: "land", x, y, life: 0.55, maxLife: 0.55 });
    sfx.thud();
    say(`${h.name.toUpperCase()} TAKES THE FIELD!`);
  };
  const doDeploySpecial = (key, x, y) => {
    const sp = specials2.find((s2) => s2.key === key);
    if (!sp) return;
    for (let i = 0; i < sp.count; i++) {
      const a = i / sp.count * Math.PI * 2;
      const off = sp.count > 1 ? 2.5 : 0;
      sim.current.troops.push(coach(makeSpecialTroop(sp, x + Math.cos(a) * off, y + Math.sin(a) * off)));
    }
    sim.current.fx.push({ type: "land", x, y, life: 0.45, maxLife: 0.45 });
  };
  const doCastPlay = (key, x, y) => {
    const p = PLAYBOOK.find((pp) => pp.key === key);
    if (!p) return;
    sim.current.troops.forEach((t) => {
      if (t.dead) return;
      if (dist(t.x, t.y, x, y) <= p.radius) {
        if (p.key === "blitz") {
          t.rageT = RAGE_SECONDS;
          t.hypeSource = void 0;
        } else if (p.key === "medic") {
          t.healT = HEAL_SECONDS;
          t.healingSource = void 0;
        }
      }
    });
    sim.current.pulses.push({ x, y, r: p.radius, life: 0.5, maxLife: 0.5, color: p.color });
  };
  const consumeCombatEvents = (events) => {
    const s = sim.current;
    for (const event of events) {
      if (event.type === "yardage") {
        const target = s.buildings.find((b) => b.id === event.targetId);
        if (!target) continue;
        target.hitFlash = 0.16;
        if (!s.goalLine && target.kind === "hq" && target.hp < target.maxHp * 0.5 && !target.dead) {
          s.goalLine = true;
          for (let i = 0; i < 2; i++) s.guards.push(makeTroop("DEFENSE_LINE" /* DEFENSE_LINE */, target.x + (i ? 3 : -3), target.y + 2, guardMult, gameRand));
          say("GOAL-LINE STAND \u2014 the defense digs in!");
        }
      } else if (event.type === "sacked" && event.kind !== "wall") {
        const scored = event.kind === "hq";
        s.fx.push({ type: "yards", text: scored ? "TOUCHDOWN!" : "SACKED!", x: event.x, y: event.y, life: 1.2, maxLife: 1.2 });
        s.fx.push({ type: "boom", x: event.x, y: event.y, life: 0.55, maxLife: 0.55 });
        s.pulses.push({ x: event.x, y: event.y, r: scored ? 15 : 10, life: 0.45, maxLife: 0.45, color: "#fde047" });
        s.momentum = Math.min(100, s.momentum + (scored ? 25 : 12) * planRef.current.momentum);
        s.shakeT = scored ? 0.35 : 0.15;
        s.punchT = scored ? 0.3 : 0.12;
        say(scored ? "TOUCHDOWN! Signature or contact \u2014 every yard counts." : "Another facility SACKED!");
        sfx.boom();
        if (scored) {
          s.freezeT = 0.45;
          sfx.airhorn();
        }
      } else if (event.type === "signature-impact") {
        const def = heroes2.find((h) => h.key === event.heroKey);
        const radius = event.ability === "field_medic" ? 18 : event.ability === "shield_wall" ? 16 : event.ability === "motivation" ? 20 : 10;
        s.pulses.push({ x: event.x, y: event.y, r: radius, life: 0.45, maxLife: 0.45, color: def?.color ?? "#fde047" });
        say(`${def?.abilityName.toUpperCase() ?? "SIGNATURE"} \u2014 ${event.ability === "hailmary" || event.ability === "onside_bomb" ? "CONTACT!" : "IN PLAY!"}`);
        sfx.thud();
      } else if (event.type === "recovery") {
        s.fx.push({ type: "dmg", text: `+${Math.round(event.amount)} GRIT`, color: "#86efac", x: event.x, y: event.y - 2, life: 0.8, maxLife: 0.8 });
      } else if (event.type === "reinforcements") {
        const source = s.troops.find((t) => t.id === event.actorId);
        if (source) source.reinforcementsSent = (source.reinforcementsSent ?? 0) + 3;
        for (let i = 0; i < 3; i++) {
          const angle = i / 3 * Math.PI * 2;
          s.troops.push(coach(makeTroop("OFFENSE_SKILL" /* OFFENSE_SKILL */, event.x + Math.cos(angle) * 3, event.y + Math.sin(angle) * 3, config.preparation?.["OFFENSE_SKILL" /* OFFENSE_SKILL */] ?? 1, gameRand)));
        }
      }
    }
  };
  const useAbility = (heroKey) => {
    const s = sim.current;
    const h = s.troops.find((t) => t.heroKey === heroKey && !t.dead);
    if (!h || (h.abilityCd ?? 0) > 0) return false;
    const action = beginHeroAction(h, s.buildings, s.ticks);
    if (!action) return false;
    h.face = spriteFacing(h.x, h.y, action.tx, action.ty, h.face);
    actions.current.push(action);
    const def = heroes2.find((hero) => hero.key === heroKey);
    if (def) {
      say(`${def.name.toUpperCase()} \u2014 ${def.abilityName.toUpperCase()}!`);
      sfx.whoosh();
    }
    return true;
  };
  const stepSim = () => {
    const s = sim.current;
    if (s.ended) return;
    if (config.replay) {
      for (const input2 of config.replay.script) if (input2.tick === s.ticks && !command(input2, true)) rejectedCommands++;
      if (s.ended) return;
    }
    s.ticks++;
    if (s.freezeT > 0) {
      s.freezeT -= DT;
      return;
    }
    for (const b of s.buildings) {
      const bf = b;
      if (bf.hitFlash && bf.hitFlash > 0) bf.hitFlash = Math.max(0, bf.hitFlash - DT);
    }
    if (config.gauntlet && s.nextWave < config.gauntlet.waves.length) {
      const w = config.gauntlet.waves[s.nextWave];
      if (BATTLE_SECONDS - s.time >= w.at) {
        for (const t of w.troops) s.troops.push(makeTroop(t.unit, t.x, t.y, w.mult, rand));
        s.nextWave++;
        s.banner = { label: `WAVE ${s.nextWave} \u2014 ${w.label}`, until: s.time - 2.8, key: s.nextWave };
        say(`\u{1F6E1} WAVE ${s.nextWave}: ${w.label} storm the gates!`);
        sfx.kickoff();
        s.shakeT = 0.2;
      }
    }
    const motionSamples = [...s.troops, ...s.guards].map((actor) => ({ actor, x: actor.x, y: actor.y }));
    for (const { actor } of motionSamples) {
      actor.moving = false;
      actor.attacking = false;
      actor.actionPoseT = Math.max(0, (actor.actionPoseT ?? 0) - DT);
    }
    if (modernCombat) {
      consumeCombatEvents(stepHeroActions(actions.current, s.troops, s.buildings, DT));
      actions.current = actions.current.filter((action) => !actionFinished(action));
    }
    for (const t of s.troops) {
      if (t.dead) continue;
      if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - DT);
      if (t.rageT > 0) t.rageT = Math.max(0, t.rageT - DT);
      if (t.rageT <= 0) t.hypeSource = void 0;
      if (t.healT > 0) {
        t.healT = Math.max(0, t.healT - DT);
        const source = modernCombat && t.healingSource ? s.troops.find((actor) => actor.id === t.healingSource) : void 0;
        if (source) recover(source, t, HEAL_PER_SEC * DT);
        else t.hp = Math.min(t.maxHp, t.hp + HEAL_PER_SEC * DT);
      }
      if (t.shieldT && t.shieldT > 0) t.shieldT = Math.max(0, t.shieldT - DT);
      if (t.slowT && t.slowT > 0) t.slowT = Math.max(0, t.slowT - DT);
      if (t.abilityPoseT) t.abilityPoseT = Math.max(0, t.abilityPoseT - DT);
      if (t.abilityCd && t.abilityCd > 0) t.abilityCd = Math.max(0, t.abilityCd - DT);
      if (t.sprintT) t.sprintT = Math.max(0, t.sprintT - DT);
      if (t.truckT && !t.activeAction) t.truckT = Math.max(0, t.truckT - DT);
      if (modernCombat && t.activeAction) {
        t.attacking = true;
        continue;
      }
      const raging = t.rageT > 0;
      const rc = t.role ? ROLE_COMBAT[t.role] : void 0;
      const catching = rc?.receiver && s.troops.some((o) => !o.dead && (ROLE_COMBAT[o.role ?? ""]?.thrower || o.heroKey === "qb"));
      const dps = t.dps * (raging ? 2 : 1) * (catching ? RECEIVER_BONUS : 1);
      const speed = t.speed * (raging ? 1.5 : 1) * ((t.sprintT ?? 0) > 0 ? 1.7 : (t.truckT ?? 0) > 0 ? 1.6 : 1) * ((t.slowT ?? 0) > 0 ? 0.55 : 1);
      const goal = nearestBuilding(t.x, t.y, s.buildings, t.special ? void 0 : UNIT_PREF[t.unit]);
      if (!goal) continue;
      if (!t.plan || t.plan.goalId !== goal.id || (t.plan.age += DT) > (modernCombat ? routeRefreshSeconds(t) : 1.1)) t.plan = planPath(t.x, t.y, goal, s.buildings);
      const plan = t.plan;
      while (plan.path.length && (dist(t.x, t.y, plan.path[0].x, plan.path[0].y) < 3 || plan.path.length > 1 && losClear(t.x, t.y, plan.path[1].x, plan.path[1].y, plan.blocked))) plan.path.shift();
      let target = goal;
      if (plan.targetWallId) {
        const wb = s.buildings.find((b) => b.id === plan.targetWallId);
        if (!wb || wb.dead) {
          plan.targetWallId = null;
          plan.age = 99;
        } else if (dist(t.x, t.y, wb.x, wb.y) <= t.range + wb.size * 0.5 + 2.5) target = wb;
      }
      if (target === goal) {
        const between = blockingWall(t.x, t.y, t.range, goal, s.buildings);
        if (between) target = between;
      }
      const d = dist(t.x, t.y, target.x, target.y);
      const stopAt = t.range + target.size * 0.5;
      if (d > stopAt) {
        t.attacking = false;
        const wp = target !== goal ? { x: target.x, y: target.y } : plan.path[0] ?? { x: goal.x, y: goal.y };
        const direct = wp.x === target.x && wp.y === target.y;
        const md = Math.max(1e-3, dist(t.x, t.y, wp.x, wp.y));
        const step = direct ? Math.min(speed * DT, d - stopAt) : Math.min(speed * DT, md);
        t.face = spriteFacing(t.x, t.y, wp.x, wp.y, t.face);
        t.x += (wp.x - t.x) / md * step;
        t.y += (wp.y - t.y) / md * step;
        if (rand() < 0.05) s.fx.push({ type: "dust", x: t.x, y: t.y + 1.6, life: 0.4, maxLife: 0.4 });
      } else {
        t.attacking = true;
        t.face = spriteFacing(t.x, t.y, target.x, target.y, t.face);
        if ((t.truckT ?? 0) > 0) {
          t.truckT = 0;
          t.actionPoseT = 0.32;
          consumeCombatEvents(applyBuildingYardage(t, target, 100 + t.dps * 2));
          s.pulses.push({ x: target.x, y: target.y, r: 8, life: 0.35, maxLife: 0.35, color: "#fde047" });
          say("TRUCK STICK \u2014 shoulder down, contact!");
        }
        if (modernCombat) {
          creditHype(t, target.hp, dps * DT, s.troops);
          consumeCombatEvents(applyBuildingYardage(t, target, dps * DT));
        } else {
          target.hp -= dps * DT;
          t.dmg = (t.dmg ?? 0) + dps * DT;
        }
        if (rand() < 0.06) s.fx.push({ type: "impact", x: (t.x + target.x) / 2, y: (t.y + target.y) / 2 - 1, life: 0.3, maxLife: 0.3 });
        t.dmgAcc = (t.dmgAcc ?? 0) + dps * DT;
        t.dmgTimer = (t.dmgTimer ?? 0) + DT;
        if (t.dmgTimer >= 0.65) {
          t.actionPoseT = 0.28;
          s.fx.push({ type: "dmg", text: `+${Math.max(1, Math.round(t.dmgAcc))} YDS`, color: "#fde047", x: target.x + (rand() * 4 - 2), y: target.y - target.size * 0.4, life: 0.7, maxLife: 0.7 });
          target.hitFlash = 0.2;
          if (rc?.thrower || t.heroKey === "qb" || t.heroKey === "kicker") {
            s.fx.push({ type: "ballshot", x: t.x, y: t.y - 2, vx: target.x, vy: target.y - 1, life: 0.4, maxLife: 0.4 });
          }
          t.dmgAcc = 0;
          t.dmgTimer = 0;
        }
        if (!modernCombat && !s.goalLine && target.kind === "hq" && target.hp < target.maxHp * 0.5) {
          s.goalLine = true;
          for (let gi = 0; gi < 2; gi++) s.guards.push({ id: `g${++troopUid}`, unit: "DEFENSE_LINE" /* DEFENSE_LINE */, x: target.x + (gi ? 3 : -3), y: target.y + 2, hp: Math.round(150 * guardMult), maxHp: Math.round(150 * guardMult), dps: 12 * guardMult, speed: 13, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 50 + Math.floor(rand() * 49) });
          say(povDefense ? "\u{1F6A8} GOAL-LINE STAND \u2014 your boys dig in at the goal line!" : "\u{1F6A8} GOAL-LINE STAND \u2014 they're throwing EVERYBODY at you!");
          s.shakeT = 0.25;
        }
        if (rand() < 0.12) s.fx.push({ type: "impact", x: target.x, y: target.y - target.size * 0.3, life: 0.22, maxLife: 0.22 });
        if (!modernCombat && target.hp <= 0) {
          target.hp = 0;
          target.dead = true;
          t.targetId = null;
          if (target.kind !== "wall") {
            const scored = target.kind === "hq";
            s.fx.push({ type: "yards", text: scored ? "TOUCHDOWN!" : "SACKED!", x: target.x, y: target.y, life: scored ? 1.5 : 1, maxLife: scored ? 1.5 : 1 });
            say(scored ? povDefense ? "\u{1F3C8} They score on YOUR house \u2014 the crowd goes dead silent\u2026" : "\u{1F3C8} TOUCHDOWN!! The home crowd goes DEAD silent!" : ["Another facility SACKED!", "They tear through the complex!", "That building is DONE for the day!"][Math.floor(rand() * 3)]);
            s.momentum = Math.min(100, s.momentum + (scored ? 25 : 12) * planRef.current.momentum);
            if (scored) {
              s.freezeT = 0.45;
              if (povDefense) sfx.aww();
              else {
                sfx.airhorn();
                sfx.crowdRoar();
              }
            }
            s.pulses.push({ x: target.x, y: target.y, r: scored ? 15 : 10, life: 0.45, maxLife: 0.45, color: scored ? "#fde047" : "#f8fafc" });
            s.fx.push({ type: "boom", x: target.x, y: target.y - 1, life: 0.55, maxLife: 0.55 });
            sfx.boom();
            for (let di = 0; di < (scored ? 8 : 6); di++) {
              const da = rand() * Math.PI * 2;
              s.fx.push({ type: "debris", x: target.x, y: target.y - 1, vx: Math.cos(da) * (8 + rand() * 8), vy: -6 - rand() * 10, life: 0.8, maxLife: 0.8, color: ["#64748b", "#94a3b8", "#f97316"][di % 3] });
            }
            for (let si = 0; si < 3; si++) s.fx.push({ type: "smoke", x: target.x + (rand() * 6 - 3), y: target.y - 1, vx: rand() * 2 - 1, life: 1.3, maxLife: 1.3 });
            if (scored) for (let ci2 = 0; ci2 < 18; ci2++) {
              const ca2 = rand() * Math.PI * 2;
              s.fx.push({ type: "confetti", x: target.x, y: target.y - 3, vx: Math.cos(ca2) * (6 + rand() * 14), vy: -10 - rand() * 16, life: 1.4, maxLife: 1.4, color: ["#f97316", "#fde047", "#f8fafc", "#38bdf8"][ci2 % 4] });
            }
            for (let ci = 0; ci < (scored ? 7 : 4); ci++) {
              const ca = rand() * Math.PI * 2;
              s.fx.push({ type: "coin", x: target.x, y: target.y, vx: Math.cos(ca) * 9, vy: Math.sin(ca) * 5 - 9, life: 0.7, maxLife: 0.7 });
            }
            s.shakeT = scored ? 0.55 : 0.35;
            s.punchT = scored ? 0.4 : 0.18;
          }
        }
      }
    }
    s.guardT += DT;
    const aliveDef = s.buildings.filter((b) => b.kind === "defense" && !b.dead);
    const aliveGuards = s.guards.filter((g) => !g.dead);
    const spawnEvery = Math.max(4.5, 8 - (BATTLE_SECONDS - s.time) / 15);
    if (s.guardT >= spawnEvery && aliveDef.length > 0 && aliveGuards.length < 3 && s.troops.some((t) => !t.dead)) {
      s.guardT = 0;
      const src = aliveDef[Math.floor(gameRand() * aliveDef.length)];
      s.guards.push({ id: `g${++troopUid}`, unit: "DEFENSE_LINE" /* DEFENSE_LINE */, x: src.x, y: src.y, hp: Math.round(140 * guardMult), maxHp: Math.round(140 * guardMult), dps: 11 * guardMult, speed: 12, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 40 + Math.floor(rand() * 59) });
      say(povDefense ? "YOUR defense sends out a linebacker!" : "The defense sends out a LINEBACKER!");
    }
    if (!s.mascotOut) {
      const hq2 = s.buildings.find((b) => b.kind === "hq");
      if (hq2 && !hq2.dead && hq2.hp < hq2.maxHp * 0.7) {
        s.mascotOut = true;
        s.guards.push({ id: `mas${++troopUid}`, unit: "DEFENSE_LINE" /* DEFENSE_LINE */, x: hq2.x, y: hq2.y + 3, hp: Math.round(560 * guardMult), maxHp: Math.round(560 * guardMult), dps: 10 * guardMult, speed: 8.5, range: 3.4, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 0, guardArt: "/assets/units/mascot.webp", isMascot: true });
        say(povDefense ? "\u{1F42F} YOUR MASCOT charges out of the tunnel \u2014 the crowd comes ALIVE!" : "\u{1F42F} THEIR MASCOT storms out to defend the house!");
        sfx.crowdRoar();
        s.shakeT = 0.25;
      }
    }
    const mas = s.guards.find((g) => !g.dead && g.isMascot);
    if (mas) {
      s.mascotT += DT;
      if (s.mascotT >= 3) {
        s.mascotT = 0;
        for (const g of s.guards) {
          if (!g.dead && g !== mas && dist(mas.x, mas.y, g.x, g.y) <= 14) g.rageT = 2;
        }
        s.pulses.push({ x: mas.x, y: mas.y, r: 14, life: 0.45, maxLife: 0.45, color: povDefense ? "#f97316" : "#ef4444" });
      }
    }
    for (const g of s.guards) {
      if (g.dead) continue;
      if (g.hitFlash > 0) g.hitFlash = Math.max(0, g.hitFlash - DT);
      if (g.rageT > 0) g.rageT = Math.max(0, g.rageT - DT);
      let prey = null, pd = 1e9;
      for (const t of s.troops) {
        if (t.dead) continue;
        const dd = dist(g.x, g.y, t.x, t.y);
        if (dd < pd) {
          pd = dd;
          prey = t;
        }
      }
      if (!prey) continue;
      if (pd > 3.2) {
        g.face = spriteFacing(g.x, g.y, prey.x, prey.y, g.face);
        g.x += (prey.x - g.x) / pd * g.speed * DT;
        g.y += (prey.y - g.y) / pd * g.speed * DT;
        g.attacking = false;
      } else {
        g.attacking = true;
        g.face = spriteFacing(g.x, g.y, prey.x, prey.y, g.face);
        const shieldFactor = prey.shieldT && prey.shieldT > 0 ? 0.5 : 1;
        const preyOut = modernCombat && prey.activeAction ? 0 : prey.dps * (prey.rageT > 0 ? 2 : 1) * 0.55 * DT;
        const pocket = (prey.role === "QB" || prey.role === "RB") && s.troops.some((o) => !o.dead && ROLE_COMBAT[o.role ?? ""]?.protector && dist(o.x, o.y, prey.x, prey.y) < POCKET_RADIUS) ? POCKET_FACTOR : 1;
        const frenzy = g.rageT > 0 ? 1.35 : 1;
        if (modernCombat) applyTroopPressure(prey, g.dps * frenzy * pocket * DT, s.troops);
        else prey.hp -= g.dps * frenzy * shieldFactor * pocket * DT;
        prey.hitFlash = 0.12;
        const effectiveCounter = modernCombat ? Math.min(Math.max(0, g.hp), preyOut) : preyOut;
        if (modernCombat) creditHype(prey, g.hp, preyOut, s.troops);
        g.hp -= effectiveCounter;
        g.hitFlash = 0.12;
        prey.dmg = (prey.dmg ?? 0) + effectiveCounter;
        g.dmgAcc = (g.dmgAcc ?? 0) + g.dps * frenzy * shieldFactor * DT;
        g.dmgTimer = (g.dmgTimer ?? 0) + DT;
        if (g.dmgTimer >= 0.65) {
          g.actionPoseT = 0.28;
          s.fx.push({ type: "dmg", text: `${Math.max(1, Math.round(g.dmgAcc))}`, color: "#f87171", x: prey.x + (rand() * 3 - 1.5), y: prey.y - 2.5, life: 0.7, maxLife: 0.7 });
          g.dmgAcc = 0;
          g.dmgTimer = 0;
        }
        if (prey.hp <= 0) {
          prey.hp = 0;
          prey.dead = true;
          s.lost++;
          s.momentum = Math.max(0, s.momentum - 10);
          say(povDefense ? `Your defense STUFFS #${prey.jersey ?? "??"} at the line!` : prey.isHero ? `${(heroes2.find((h) => h.key === prey.heroKey)?.name || "Your hero").toUpperCase()} IS DOWN!` : `#${prey.jersey ?? "??"} gets STUFFED at the line!`);
          s.fx.push({ type: "impact", x: prey.x, y: prey.y, life: 0.3, maxLife: 0.3 });
          s.fx.push({ type: "down", text: `${prey.jersey ?? ""}`, color: isDefense ? "#b91c1c" : "#111827", x: prey.x, y: prey.y, life: 1.1, maxLife: 1.1 });
        }
        if (g.hp <= 0) {
          g.hp = 0;
          g.dead = true;
          prey.kills = (prey.kills ?? 0) + 1;
          if (g.isMascot) {
            s.fx.push({ type: "boom", x: g.x, y: g.y - 1, life: 0.5, maxLife: 0.5 });
            sfx.aww();
            if (!isDefense) {
              s.bonus += 50;
              s.momentum = Math.min(100, s.momentum + 15);
              say(isReplay ? "\u{1F4A5} They flatten your mascot \u2014 the stands go quiet\u2026" : "\u{1F4A5} Their MASCOT hits the TURF \u2014 the stands go QUIET! (+50 loot)");
              for (let ci = 0; ci < 4; ci++) {
                const ca = rand() * Math.PI * 2;
                s.fx.push({ type: "coin", x: g.x, y: g.y, vx: Math.cos(ca) * 8, vy: Math.sin(ca) * 4 - 8, life: 0.6, maxLife: 0.6 });
              }
            } else {
              say("Your mascot gets flattened \u2014 the crowd GASPS!");
            }
          } else {
            s.fx.push({ type: "down", text: `${g.jersey ?? ""}`, color: isDefense ? "#111827" : "#b91c1c", x: g.x, y: g.y, life: 1.1, maxLife: 1.1 });
            if (!isDefense) {
              s.pancakes++;
              s.bonus += 25;
              s.momentum = Math.min(100, s.momentum + 10 * planRef.current.momentum);
              say(isReplay ? `\u{1F4A5} They PANCAKE your linebacker!` : `\u{1F4A5} TAKEAWAY! Linebacker PANCAKED \u2014 bonus loot! (+25)`);
              for (let ci = 0; ci < 3; ci++) {
                const ca = rand() * Math.PI * 2;
                s.fx.push({ type: "coin", x: g.x, y: g.y, vx: Math.cos(ca) * 8, vy: Math.sin(ca) * 4 - 8, life: 0.6, maxLife: 0.6 });
              }
            } else {
              say(`Your #${g.jersey ?? "??"} gets flattened \u2014 they keep coming!`);
            }
          }
          s.fx.push({ type: "impact", x: g.x, y: g.y, life: 0.3, maxLife: 0.3 });
        }
      }
    }
    for (const { actor, x, y } of motionSamples) {
      const motion = spriteMotion({ x, y }, actor, DT, actor.face, actor.stridePhase);
      actor.moving = !actor.dead && motion.moving;
      actor.strideSeconds = motion.strideSeconds;
      actor.stridePhase = motion.stridePhase;
      if (motion.moving) actor.face = motion.face;
    }
    if (Math.round(s.time * 20) % 20 === 0) {
      const nw2 = s.buildings.filter((b) => b.kind !== "wall");
      const gone = nw2.length ? nw2.reduce((sum, b) => sum + (1 - Math.max(0, b.hp) / b.maxHp), 0) / nw2.length : 0;
      crowdBedIntensity(Math.max(0.08, 1 - gone));
    }
    if (!isDefense) {
      s.momentum = Math.max(0, s.momentum - 1.5 * DT);
      if (s.momentum >= 100) {
        s.momentum = 30;
        s.troops.forEach((t) => {
          if (!t.dead) {
            if (t.rageT < 4) t.hypeSource = void 0;
            t.rageT = Math.max(t.rageT, 4);
          }
        });
        say("\u{1F525} MOMENTUM SHIFT \u2014 the whole squad is ROLLING!");
        sfx.crowdRoar();
        s.shakeT = 0.2;
      }
    }
    if ((isDefense || !!config.defenseSnapshotId) && (config.fans ?? 0) >= CROWD_PULSE.minFans) {
      s.crowdT = (s.crowdT ?? 0) + DT;
      if (s.crowdT >= CROWD_PULSE.intervalSecs) {
        s.crowdT = 0;
        const stall = CROWD_PULSE.slowSecs(config.fans);
        s.troops.forEach((t) => {
          if (!t.dead) t.slowT = Math.max(t.slowT ?? 0, stall);
        });
        say(`\u{1F50A} ${config.fans.toLocaleString()} fans ERUPT \u2014 the drive stalls!`);
        sfx.crowdRoar();
        crowdBedIntensity(1);
        s.shakeT = 0.2;
      }
    }
    if (!s.warned && s.time <= 15) {
      s.warned = true;
      say("\u23F1 FINAL SECONDS \u2014 finish the drive!");
    }
    for (const m of s.troops) {
      if (m.dead || m.special !== "mascot") continue;
      const def = specials2.find((sp) => sp.key === "mascot");
      const r = def?.aura?.radius ?? 16;
      const keep = def?.aura?.keepRageT ?? 1.1;
      for (const t of s.troops) {
        if (t.dead || t === m || t.special === "mascot") continue;
        if (dist(m.x, m.y, t.x, t.y) <= r) {
          if (t.rageT < keep) t.hypeSource = void 0;
          t.rageT = Math.max(t.rageT, keep);
        }
      }
      if (rand() < 0.08) s.pulses.push({ x: m.x, y: m.y, r, life: 0.4, maxLife: 0.4, color: "#f97316" });
    }
    const hitTroop = (t, raw) => {
      const hit = modernCombat ? applyTroopPressure(t, raw, s.troops) : Math.round(raw * (t.shieldT && t.shieldT > 0 ? 0.5 : 1));
      if (!modernCombat) t.hp -= hit;
      t.hitFlash = 0.15;
      s.fx.push({ type: "dmg", text: `${Math.round(hit)}`, color: "#f87171", x: t.x + (rand() * 3 - 1.5), y: t.y - 2.5, life: 0.7, maxLife: 0.7 });
      if (rand() < 0.3) s.fx.push({ type: "impact", x: t.x, y: t.y - 0.5, life: 0.28, maxLife: 0.28 });
      if (t.hp <= 0) {
        t.hp = 0;
        t.dead = true;
        s.lost++;
        s.momentum = Math.max(0, s.momentum - 6);
        s.fx.push({ type: "down", text: `${t.jersey ?? ""}`, color: isDefense ? "#b91c1c" : "#111827", x: t.x, y: t.y, life: 1.1, maxLife: 1.1 });
      }
    };
    for (const b of s.buildings) {
      if (b.dead || b.kind !== "defense" || !b.damage || !b.range) continue;
      if ((b.level ?? 0) >= 10) {
        const bb = b;
        if (bb.sigT === void 0) {
          let hh = 0;
          for (let i = 0; i < b.id.length; i++) hh = hh * 31 + b.id.charCodeAt(i) >>> 0;
          bb.sigT = 2.5 + hh % 40 / 10;
        }
        bb.sigT -= DT;
        if (bb.sigT <= 0) {
          const sp = nearestTroop(b.x, b.y, s.troops, b.range * 1.25);
          if (!sp) bb.sigT = 0.6;
          else if (b.flavor === "sled") {
            const dd = Math.max(0.01, dist(b.x, b.y, sp.x, sp.y));
            if (dd <= 9) {
              sp.x = Math.min(98, Math.max(2, sp.x + (sp.x - b.x) / dd * 11));
              sp.y = Math.min(98, Math.max(2, sp.y + (sp.y - b.y) / dd * 11));
              sp.slowT = Math.max(sp.slowT ?? 0, 1.8);
              hitTroop(sp, b.damage * 1.4);
              s.fx.push({ type: "boom", x: sp.x, y: sp.y, life: 0.5, maxLife: 0.5 });
              if (rand() < 0.5) say("\u{1F4A5} PANCAKE BLOCK \u2014 he gets sent FLYING!");
              bb.sigT = 8;
            } else bb.sigT = 0.6;
          } else if (b.flavor === "ref") {
            for (const t of s.troops) {
              if (!t.dead && dist(b.x, b.y, t.x, t.y) <= b.range) {
                t.slowT = Math.max(t.slowT ?? 0, 2.2);
                hitTroop(t, b.damage * 0.6);
              }
            }
            s.pulses.push({ x: b.x, y: b.y, r: Math.min(18, b.range * 0.6), life: 0.5, maxLife: 0.5, color: "#fde047" });
            if (rand() < 0.5) say("\u{1F6A9} BOOTH REVIEW \u2014 everybody HOLDS!");
            bb.sigT = 11;
          } else if (b.flavor === "tshirt") {
            for (const t of s.troops) {
              if (!t.dead && dist(t.x, t.y, sp.x, sp.y) <= 12) {
                hitTroop(t, b.damage * 0.9);
                t.slowT = Math.max(t.slowT ?? 0, 2);
              }
            }
            s.pulses.push({ x: sp.x, y: sp.y, r: 12, life: 0.5, maxLife: 0.5, color: "#f472b6" });
            for (let si = 0; si < 3; si++) s.shots.push({ sx: b.x, sy: b.y, tx: sp.x + (rand() * 8 - 4), ty: sp.y + (rand() * 8 - 4), t: -si * 0.08, dur: 0.34, rot: rand() * 360, flavor: "tshirt" });
            if (rand() < 0.5) say("\u{1F455} T-SHIRT STORM!");
            bb.sigT = 10;
          } else if (b.flavor === "cooler") {
            s.puddles.push({ x: sp.x, y: sp.y, r: 13, life: 5, maxLife: 5 });
            s.pulses.push({ x: sp.x, y: sp.y, r: 13, life: 0.5, maxLife: 0.5, color: "#f97316" });
            s.shots.push({ sx: b.x, sy: b.y, tx: sp.x, ty: sp.y, t: 0, dur: 0.4, rot: rand() * 360, flavor: "cooler" });
            if (rand() < 0.5) say("\u{1F30A} FLOOD ZONE \u2014 the turf turns to orange soup!");
            bb.sigT = 10;
          } else {
            hitTroop(sp, b.damage * 2.2);
            for (let si = 0; si < 3; si++) s.shots.push({ sx: b.x, sy: b.y, tx: sp.x, ty: sp.y, t: -si * 0.09, dur: 0.3, rot: rand() * 360 });
            if (rand() < 0.5) say("\u{1F525} JUGS OVERDRIVE \u2014 the whole hopper unloads!");
            bb.sigT = 9;
          }
        }
      }
      b.cooldown -= DT;
      if (b.cooldown > 0) continue;
      const prey = nearestTroop(b.x, b.y, s.troops, b.range);
      if (!prey) {
        b.cooldown = 0.1;
        continue;
      }
      const fl = b.flavor;
      if (fl === "cooler") {
        hitTroop(prey, b.damage);
        s.puddles.push({ x: prey.x, y: prey.y, r: 7, life: 3.5, maxLife: 3.5 });
        b.cooldown = 2.6;
      } else if (fl === "tshirt") {
        for (const t of s.troops) {
          if (!t.dead && dist(t.x, t.y, prey.x, prey.y) <= 7) {
            hitTroop(t, b.damage * 0.7);
            t.slowT = Math.max(t.slowT ?? 0, 1.5);
          }
        }
        s.pulses.push({ x: prey.x, y: prey.y, r: 7, life: 0.35, maxLife: 0.35, color: "#f472b6" });
        b.cooldown = 1.15;
      } else if (fl === "ref") {
        hitTroop(prey, b.damage);
        prey.slowT = 2.2;
        b.cooldown = 0.9;
      } else if (fl === "sled") {
        hitTroop(prey, b.damage * 1.35);
        b.cooldown = 1.1;
      } else {
        hitTroop(prey, b.damage);
        b.cooldown = fl === "jugs" ? 0.55 : 0.7;
      }
      s.shots.push({ sx: b.x, sy: b.y, tx: prey.x, ty: prey.y, t: 0, dur: 0.3, rot: rand() * 360, flavor: fl });
    }
    if (s.shots.length) s.shots = s.shots.filter((sh) => (sh.t += DT) < sh.dur);
    if (s.puddles.length) {
      s.puddles = s.puddles.filter((p) => (p.life -= DT) > 0);
      for (const p of s.puddles) for (const t of s.troops) {
        if (!t.dead && dist(t.x, t.y, p.x, p.y) <= p.r) t.slowT = Math.max(t.slowT ?? 0, 0.3);
      }
    }
    if (s.pulses.length) s.pulses = s.pulses.filter((p) => (p.life -= DT) > 0);
    if (s.fx.length) {
      for (const f of s.fx) {
        if (f.type === "coin" || f.type === "debris" || f.type === "confetti") {
          f.x += (f.vx ?? 0) * DT;
          f.y += (f.vy ?? 0) * DT;
          f.vy = (f.vy ?? 0) + 42 * DT;
        } else if (f.type === "smoke") {
          f.y -= 5 * DT;
          f.x += (f.vx ?? 0) * DT;
        }
      }
      s.fx = s.fx.filter((f) => (f.life -= DT) > 0);
    }
    for (const b of s.buildings) {
      if (!b.dead && b.kind !== "wall" && b.hp < b.maxHp * 0.45 && rand() < 0.035) {
        s.fx.push({ type: "smoke", x: b.x + (rand() * 4 - 2), y: b.y - 2, vx: rand() * 2 - 1, life: 1.1, maxLife: 1.1 });
      }
    }
    if (s.shakeT > 0) s.shakeT = Math.max(0, s.shakeT - DT);
    if (s.punchT > 0) s.punchT = Math.max(0, s.punchT - DT);
    s.time -= DT;
    const allDead = s.buildings.filter((b) => b.kind !== "wall").every((b) => b.dead);
    const anyTroopAlive = s.troops.some((t) => !t.dead);
    const anyToDeploy = UNIT_ORDER.some((u) => armyRef.current[u] > 0) || heroes2.some((h) => !deployedHeroesRef.current.has(h.key)) || specials2.some((sp) => (specialChargesRef.current[sp.key] ?? 0) > 0);
    const wavesPending = !!config.gauntlet && s.nextWave < config.gauntlet.waves.length;
    if (config.gauntlet) {
      const nonWallB = s.buildings.filter((b) => b.kind !== "wall");
      const dmgFrac = nonWallB.length ? nonWallB.reduce((sum, b) => sum + (1 - Math.max(0, b.hp) / (b.maxHp || 1)), 0) / nonWallB.length : 0;
      if (dmgFrac >= 0.5) {
        endBattle();
        return;
      }
    }
    const ballInPlay = modernCombat && actions.current.some((action) => action.released && !action.resolved);
    if (allDead || s.time <= 0 || !wavesPending && !ballInPlay && s.troops.length > 0 && !anyTroopAlive && !anyToDeploy) endBattle();
  };
  const coordinate = (n) => typeof n === "number" && Number.isFinite(n) && n >= 2 && n <= 98;
  const perimeterOk = (x, y) => !sim.current.buildings.some((b) => !b.dead && dist(x, y, b.x, b.y) < 14);
  const command = (a, playback = false) => {
    if (sim.current.ended || !playback && isReplay || a.tick !== sim.current.ticks) return false;
    if (a.k === "e") {
      hashPlan();
      endBattle();
    } else if (a.k === "d") {
      if (!isDefense || !started || !["noise", "pkg", "timeout"].includes(a.key ?? "")) return false;
      const key = a.key;
      if (defensePlays[key] <= 0) return false;
      if (key === "pkg") {
        const hq = sim.current.buildings.find((b) => b.kind === "hq" && !b.dead);
        if (!hq) return false;
        for (let i = 0; i < 2; i++) sim.current.guards.push(makeTroop("DEFENSE_LINE" /* DEFENSE_LINE */, hq.x + (i ? 3.5 : -3.5), hq.y + 2, guardMult, gameRand));
        say("GOAL-LINE PACKAGE \u2014 fresh legs take the field!");
      } else {
        for (const t of sim.current.troops) if (!t.dead) t.slowT = Math.max(t.slowT ?? 0, key === "timeout" ? 3.5 : 2.5);
        say(key === "timeout" ? "TIMEOUT \u2014 stall their drive!" : "The home crowd ERUPTS!");
      }
      defensePlays[key]--;
    } else if (isDefense) return false;
    else if (a.k === "a") {
      if (!started || !useAbility(a.key ?? "")) return false;
    } else {
      if (!coordinate(a.x) || !coordinate(a.y)) return false;
      if (a.k !== "p" && !perimeterOk(a.x, a.y)) return false;
      if (a.k === "t") {
        if (!a.u || !(armyRef.current[a.u] > 0)) return false;
        armyRef.current[a.u]--;
        doDeployTroop(a.u, a.x, a.y);
      } else if (a.k === "h") {
        if (!heroes2.some((h) => h.key === a.key) || deployedHeroesRef.current.has(a.key)) return false;
        deployedHeroesRef.current.add(a.key);
        doDeployHero(a.key, a.x, a.y);
      } else if (a.k === "s") {
        if (!a.key || !(specialChargesRef.current[a.key] > 0)) return false;
        specialChargesRef.current[a.key]--;
        doDeploySpecial(a.key, a.x, a.y);
      } else if (a.k === "p") {
        if (!started || !a.key || !(plays[a.key] > 0)) return false;
        plays[a.key]--;
        doCastPlay(a.key, a.x, a.y);
      } else return false;
      started = true;
    }
    hashPlan();
    script.push({ ...a });
    hash(["command", a]);
    return true;
  };
  const advance = () => {
    if (!started || sim.current.ended) return;
    hashPlan();
    const previousTick = sim.current.ticks;
    stepSim();
    if (sim.current.ticks === previousTick) return;
    const s = sim.current;
    hash([
      s.ticks,
      s.time,
      s.momentum,
      s.bonus,
      s.nextWave,
      s.buildings.map((b) => [b.id, b.hp, b.cooldown]),
      [...s.troops, ...s.guards].map((t) => [t.id, t.x, t.y, t.hp, t.rageT, t.healT, t.shieldT, t.slowT, t.abilityCd, t.dmg, t.healingDone, t.protectionDone])
    ]);
  };
  const getReplay = () => ({
    v: 2,
    rules: COMBAT_RULES_VERSION,
    seed,
    plan: planRef.current.key,
    power: config.power,
    heroes: JSON.parse(JSON.stringify(heroes2)),
    specials: JSON.parse(JSON.stringify(specials2)),
    layout: JSON.parse(JSON.stringify(config.buildings)),
    script: script.map((a) => ({ ...a })),
    squad: JSON.parse(JSON.stringify(config.squad ?? [])),
    snapshot: JSON.parse(JSON.stringify({ ...config, replay: void 0 })),
    finalHash: digest.toString(16).padStart(8, "0"),
    ticks: sim.current.ticks
  });
  return {
    state: sim.current,
    actions,
    army: armyRef.current,
    deployedHeroes: deployedHeroesRef.current,
    specialCharges: specialChargesRef.current,
    plays,
    defensePlays,
    command,
    advance,
    finish: () => command({ k: "e", tick: sim.current.ticks }),
    setPlan: (key) => {
      if (started) return false;
      const plan = GAME_PLANS.find((p) => p.key === key);
      if (!plan) return false;
      planRef.current = plan;
      return true;
    },
    get rejectedCommands() {
      return rejectedCommands;
    },
    get result() {
      return result;
    },
    get started() {
      return started;
    },
    get hash() {
      return digest.toString(16).padStart(8, "0");
    },
    getReplay,
    drainAudio: () => audio.splice(0)
  };
}
function replayMatch(replay) {
  if (replay.v !== 2 || !replay.snapshot || replay.rules !== COMBAT_RULES_VERSION) throw new Error("Unsupported match rules");
  const engine = createBattleEngine({ ...replay.snapshot, replay: { seed: replay.seed, planKey: replay.plan, script: replay.script, version: 2 } }, replay.seed, replay.plan);
  for (let i = 0; i < 1400 && !engine.state.ended; i++) engine.advance();
  return { result: engine.result, hash: engine.hash, matches: engine.state.ended && engine.rejectedCommands === 0 && engine.hash === replay.finalHash && engine.state.ticks === replay.ticks && engine.getReplay().script.length === replay.script.length, engine };
}

// game/combat/replay.ts
var record3 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var finite = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
var text = (v, max = 100) => typeof v === "string" && v.length > 0 && v.length <= max;
var units = Object.values(UnitGroup);
var kit = (v) => record3(v) && finite(v.hp, 1, 1e5) && finite(v.dps, 0, 1e4) && finite(v.speed, 0, 100) && finite(v.range, 0, 100);
var asset = (v) => typeof v === "string" && /^\/assets\/[\w./-]+$/.test(v) && !v.includes("..");
var layout = (v) => Array.isArray(v) && v.length > 0 && v.length <= 256 && new Set(v.map((b) => b?.id)).size === v.length && v.every((b) => record3(b) && text(b.id) && ["hq", "defense", "building", "wall"].includes(b.kind) && finite(b.x, 0, 100) && finite(b.y, 0, 100) && finite(b.hp, 1, 1e6) && finite(b.size, 0.1, 40) && (b.art === void 0 || asset(b.art)) && (b.damage === void 0 || finite(b.damage, 0, 1e4)) && (b.range === void 0 || finite(b.range, 0, 100)) && (b.level === void 0 || finite(b.level, 1, 100)));
var multiplier = (v) => v === void 0 || record3(v) && Object.entries(v).every(([k, n]) => units.includes(k) && finite(n, 0, 100));
var heroes = (v) => Array.isArray(v) && v.length <= 9 && new Set(v.map((h) => h?.key)).size === v.length && v.every((h) => kit(h) && HERO_DEFS.some((d) => d.key === h.key && d.ability === h.ability) && text(h.name) && text(h.abilityName) && asset(h.art) && units.includes(h.unit));
var specials = (v) => Array.isArray(v) && v.length <= 2 && new Set(v.map((h) => h?.key)).size === v.length && v.every((h) => kit(h) && SPECIALS.some((d) => d.key === h.key) && finite(h.count, 1, 40) && finite(h.charges, 1, 10) && asset(h.art) && (h.aura === void 0 || record3(h.aura) && finite(h.aura.radius, 0, 100) && finite(h.aura.keepRageT, 0, 20)));
var squad = (v, modern) => v === void 0 || Array.isArray(v) && v.length <= 150 && new Set(v.map((p) => p?.id)).size === v.length && v.every((p) => record3(p) && text(p.id) && text(p.name) && text(p.role, 30) && units.includes(p.unit) && (!modern || record3(p.stats) && ["strength", "speed", "iq"].every((k) => finite(p.stats[k], 1, 1e3)) && finite(p.level, 1, 100)));
var commands = (v, modern) => Array.isArray(v) && v.length <= 1500 && v.every((a, i) => record3(a) && Number.isInteger(a.tick) && finite(a.tick, 0, 1400) && (i === 0 || a.tick >= v[i - 1].tick) && ["t", "h", "s", "p", "a", "e", ...modern ? ["d"] : []].includes(a.k) && (["t", "h", "s", "p"].includes(a.k) ? finite(a.x, 0, 100) && finite(a.y, 0, 100) : true) && (a.k !== "t" || units.includes(a.u)) && (!["h", "a"].includes(a.k) || HERO_DEFS.some((h) => h.key === a.key)) && (a.k !== "s" || SPECIALS.some((s) => s.key === a.key)) && (a.k !== "p" || PLAYBOOK.some((p) => p.key === a.key)) && (a.k !== "d" || ["noise", "pkg", "timeout"].includes(a.key)));
function validateReplay(value) {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > 45e4) return null;
    const v = JSON.parse(serialized);
    if (!record3(v) || ![1, 2].includes(v.v) || !Number.isInteger(v.seed) || !finite(v.seed, 0, 4294967295) || !GAME_PLANS.some((p) => p.key === v.plan) || !layout(v.layout) || !heroes(v.heroes) || !specials(v.specials) || !multiplier(v.power) || !squad(v.squad, v.v === 2) || !commands(v.script, v.v === 2)) return null;
    if (v.v === 2) {
      if (v.script.some((a) => a.tick > v.ticks)) return null;
      const c = v.snapshot;
      if (v.rules !== COMBAT_RULES_VERSION || !text(v.finalHash, 8) || !/^[0-9a-f]{8}$/.test(v.finalHash) || !Number.isInteger(v.ticks) || !finite(v.ticks, 0, 1400) || !record3(c) || !["attack", "defense"].includes(c.mode) || !text(c.title, 160) || c.replay !== void 0 || !layout(c.buildings) || !heroes(c.heroes ?? []) || !specials(c.specials ?? []) || !squad(c.squad, true) || !multiplier(c.power) || !multiplier(c.preparation) || !multiplier(c.playerArmy) || !record3(c.loot) || !finite(c.loot.coins, 0, 1e6) || !finite(c.loot.fans, 0, 1e6)) return null;
      if (c.aiMult !== void 0 && !finite(c.aiMult, 0.1, 20)) return null;
      if (c.fans !== void 0 && !finite(c.fans, 0, 1e8)) return null;
      if (c.masteryTier !== void 0 && !finite(c.masteryTier, 0, 3)) return null;
      if (c.homeGuards !== void 0 && (!Array.isArray(c.homeGuards) || c.homeGuards.length > 80 || !c.homeGuards.every((g) => record3(g) && finite(g.hp, 1, 1e5) && finite(g.dps, 0, 1e4) && (g.x === void 0 || finite(g.x, 0, 100)) && (g.y === void 0 || finite(g.y, 0, 100)) && (g.art === void 0 || asset(g.art))))) return null;
      const troops = (ts) => Array.isArray(ts) && ts.length <= 150 && ts.every((t) => record3(t) && units.includes(t.unit) && finite(t.x, 0, 100) && finite(t.y, 0, 100));
      if (c.preTroops !== void 0 && !troops(c.preTroops)) return null;
      if (c.gauntlet !== void 0 && (!record3(c.gauntlet) || !finite(c.gauntlet.tier, 1, 20) || !Array.isArray(c.gauntlet.waves) || c.gauntlet.waves.length > 10 || !c.gauntlet.waves.every((w) => record3(w) && finite(w.at, 0, 60) && finite(w.mult, 0.1, 20) && troops(w.troops)))) return null;
      if (canonicalJson(v.layout) !== canonicalJson(c.buildings) || canonicalJson(v.heroes) !== canonicalJson(c.heroes ?? []) || canonicalJson(v.specials) !== canonicalJson(c.specials ?? []) || canonicalJson(v.squad ?? []) !== canonicalJson(c.squad ?? [])) return null;
    }
    return v;
  } catch {
    return null;
  }
}

// game/authority/matches.ts
var MatchRuleError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "MatchRuleError";
  }
};
var fail = (code, message) => {
  throw new MatchRuleError(code, message);
};
var uuid2 = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function parseMatchChoice(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("invalid_choice", "Choose a game.");
  const v = value;
  const keys2 = Object.keys(v).sort().join(",");
  if (v.kind === "campaign" && keys2 === "kind,stage" && Number.isInteger(v.stage) && Number(v.stage) >= 1 && Number(v.stage) <= CAMPAIGN_STAGES.length) return v;
  if (v.kind === "road" && keys2 === "choice,kind" && Number.isInteger(v.choice) && Number(v.choice) >= 0 && Number(v.choice) <= 2) return v;
  if (v.kind === "rival" && keys2 === "kind,target" && uuid2(v.target)) return v;
  if (v.kind === "gauntlet" && keys2 === "kind") return { kind: "gauntlet" };
  return fail("invalid_choice", "That game choice is unavailable.");
}
function authorityRoadTargets(state, owner, now) {
  let seed = 2166136261;
  for (const char of `${owner}:${state.trophies}:${new Date(now).toISOString().slice(0, 10)}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return generateRaidTargets(state.trophies, mulberry32(seed));
}
function issueMatch(input) {
  const { owner, id, seed, now, choice, target } = input;
  if (!uuid2(owner) || !uuid2(id) || !Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) return fail("invalid_identity", "The match could not be issued.");
  let state = settleClubState(input.state, { now });
  const cost = choice.kind === "gauntlet" ? 0 : RAID_ENERGY;
  if (state.resources.ENERGY < cost) return fail("energy", `This game needs ${cost} Energy.`);
  const power = armyStrength(state.roster);
  if (state.teamReadiness >= 100) for (const unit of Object.keys(power)) power[unit] = Math.min(4.5, power[unit] * 1.15);
  const common = { attackerName: state.teamName, squad: structuredClone(state.roster), playerArmy: armyFromRoster(state.roster), power, preparation: rosterPreparation(state.roster, state.teamReadiness), heroes: heroesForBattle(state.heroes), specials: specialsForBattle(state.resources.FANS) };
  let config;
  if (choice.kind === "campaign") {
    if (choice.stage > state.campaign.unlocked) return fail("stage_locked", "Win the previous game first.");
    const stage = CAMPAIGN_STAGES[choice.stage - 1], base = campaignBase(choice.stage);
    config = { ...common, mode: "attack", title: `${stage.name} \u2014 ${stage.opponent}`, buildings: base.buildings, loot: base.reward, campaignStage: choice.stage, rival: coachForStage(choice.stage) };
  } else if (choice.kind === "road") {
    const base = authorityRoadTargets(state, owner, now)[choice.choice];
    config = { ...common, mode: "attack", title: `Attacking ${base.name}`, buildings: base.buildings, loot: base.reward, rival: coachForBase(base.name) };
  } else if (choice.kind === "rival") {
    if (choice.target === owner) return fail("self_attack", "Choose another club.");
    if (!target) return fail("target_missing", "That club is unavailable.");
    if ((target.shieldUntil ?? 0) > now) return fail("shielded", "That club is protected right now.");
    if (state.currentMatch < 3 || target.currentMatch < 3) return fail("beginner_protection", "Play the first two Season games before live rival games.");
    const snapshot = createDefenseSnapshot(target);
    config = { ...common, ...defenseBattleFields(snapshot), mode: "attack", title: `Raiding ${target.teamName}`, loot: { coins: 500 + Math.min(target.trophies, 1e4) * 3, fans: 25 }, pvpTarget: choice.target };
  } else {
    if (state.gauntlet.attempts <= 0) return fail("attempts", "Your Gauntlet attempts return tomorrow.");
    const tier = Math.min(GAUNTLET_MAX_TIER, state.gauntlet.best + 1);
    config = { ...defenseBattleFields(createDefenseSnapshot(state)), mode: "defense", title: `The Gauntlet \u2014 Night ${tier}`, gauntlet: { tier, waves: gauntletWaves(tier) }, loot: { coins: 0, fans: 0 } };
    state = { ...state, gauntlet: { ...state.gauntlet, attempts: state.gauntlet.attempts - 1 } };
  }
  const expiresAt = now + 15 * 6e4;
  config.authority = { matchId: id, seed, rules: COMBAT_RULES_VERSION, issuedAt: now, expiresAt };
  state = { ...state, resources: { ...state.resources, ENERGY: state.resources.ENERGY - cost } };
  return { state, match: { id, owner, seed, issuedAt: now, expiresAt, cost, choice, config } };
}
function verifyMatch(match, value, now) {
  if (now > match.expiresAt) return fail("expired", "This match has expired.");
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("invalid_film", "The match commands are missing.");
  const v = value;
  if (Object.keys(v).sort().join(",") !== "finalHash,plan,script,ticks" || !GAME_PLANS.some((p) => p.key === v.plan)) return fail("invalid_film", "The match commands are invalid.");
  if (!Number.isSafeInteger(v.ticks) || Number(v.ticks) < 0 || Number(v.ticks) > 1400 || Number(v.ticks) * 50 > now - match.issuedAt + 1e3) return fail("invalid_time", "The match timing is invalid.");
  const template = createBattleEngine(match.config, match.seed, String(v.plan)).getReplay();
  const film = validateReplay({ ...template, script: v.script, ticks: v.ticks, finalHash: v.finalHash });
  if (!film) return fail("invalid_film", "The match commands are invalid.");
  const checked = replayMatch(film);
  if (!checked.matches || !checked.result) return fail("simulation_mismatch", "The match could not be verified. Your reserved game remains available.");
  return { result: { ...checked.result, isReplay: false, replay: film, defenseLayoutId: match.config.defenseLayoutId, defenseSnapshotId: match.config.defenseSnapshotId }, replay: film };
}
function settleMatchRewards(input, result, now) {
  let state = settleClubState(input, { now });
  if (result.isPractice || result.isReplay) return fail("non_progression", "Practice and film do not award rewards.");
  if (result.mode === "attack") {
    const stage = result.campaignStage ? CAMPAIGN_STAGES[result.campaignStage - 1] : null;
    const first = !!stage && result.won && !state.campaign.claimed.includes(stage.stage);
    const gems = stage ? 0 : result.stars >= 3 ? 5 : result.stars === 2 ? 2 : result.stars === 1 ? 1 : 0;
    const trophyDelta = stage ? 0 : trophiesForRaid(result.won, result.stars);
    state = {
      ...state,
      resources: { ...state.resources, COINS: state.resources.COINS + result.coins, FANS: state.resources.FANS + result.fans, GEMS: state.resources.GEMS + gems + (first ? stage.firstClear.gems : 0) },
      peakFans: nextFanMilestone(state, result.fans),
      heroes: first ? state.heroes.map((h) => h.key === stage.firstClear.shardHero ? { ...h, shards: h.shards + stage.firstClear.shards } : h) : state.heroes,
      campaign: stage ? { unlocked: result.won ? Math.max(state.campaign.unlocked, Math.min(CAMPAIGN_STAGES.length, stage.stage + 1)) : state.campaign.unlocked, stars: { ...state.campaign.stars, [stage.stage]: Math.max(state.campaign.stars[stage.stage] ?? 0, result.stars) }, claimed: first ? [...state.campaign.claimed, stage.stage] : state.campaign.claimed } : state.campaign,
      matchHistory: [{ week: state.currentMatch, opponent: result.title, ourScore: result.stars, theirScore: 0, won: result.won, reward: result.coins }, ...state.matchHistory].slice(0, 50),
      currentMatch: state.currentMatch + 1,
      trophies: Math.max(0, state.trophies + trophyDelta),
      teamReadiness: Math.max(0, state.teamReadiness - 20),
      shieldUntil: 0
    };
    if (result.won) state = progressClubDaily(state, "win_attack", 1);
    if (result.stars > 0) state = progressClubDaily(state, "game_balls", result.stars);
  } else if (result.gauntletTier !== void 0) {
    const pay = gauntletReward(result.gauntletTier, result.wavesHeld ?? 0, !!result.gauntletCleared);
    const first = !!result.gauntletCleared && result.gauntletTier > state.gauntlet.best;
    state = { ...state, resources: { ...state.resources, COINS: state.resources.COINS + pay.coins, FANS: state.resources.FANS + pay.fans, GEMS: state.resources.GEMS + (first ? 5 : 0) }, peakFans: nextFanMilestone(state, pay.fans), gauntlet: { ...state.gauntlet, best: result.gauntletCleared ? Math.max(state.gauntlet.best, result.gauntletTier) : state.gauntlet.best } };
  } else return fail("non_progression", "Defense practice does not award rewards.");
  return state;
}
function cancelReservation(state, match) {
  if (match.choice.kind === "gauntlet") return { ...state, gauntlet: { ...state.gauntlet, attempts: Math.min(3, state.gauntlet.attempts + 1) } };
  return { ...state, resources: { ...state.resources, ["ENERGY" /* ENERGY */]: Math.min(100, state.resources.ENERGY + match.cost) } };
}

// game/initialState.ts
var TEAM_SUFFIXES = ["Dynasty", "United", "Stampede", "Storm", "Legion", "Express"];
var genTeamName = () => `${RECRUIT_LAST_NAMES[Math.floor(Math.random() * RECRUIT_LAST_NAMES.length)]} ${TEAM_SUFFIXES[Math.floor(Math.random() * TEAM_SUFFIXES.length)]}`;
var createInitialState = (now = Date.now()) => ({
  resources: {
    ["COINS" /* COINS */]: 500,
    ["GEMS" /* GEMS */]: 10,
    ["ENERGY" /* ENERGY */]: 100,
    ["FANS" /* FANS */]: 0
  },
  seasonPhase: "OFF_SEASON" /* OFF_SEASON */,
  teamReadiness: 0,
  currentMatch: 1,
  matchHistory: [],
  // Snap to the starter formation even for brand-new saves — fresh players never
  // pass through loadState's migration, so anchor drift here would ship scrambled.
  buildings: INITIAL_BUILDINGS.map((b) => ({ ...b, gridX: anchorsFor("goalline")[b.type].gridX, gridY: anchorsFor("goalline")[b.type].gridY })),
  roster: structuredClone(INITIAL_ROSTER),
  bonusOrbs: [],
  lastTick: now,
  energyProgressMs: 0,
  peakFans: 0,
  timeOfDay: 12,
  // Noon start
  recruitSlot: null,
  walls: structuredClone(INITIAL_WALLS),
  heroes: HERO_DEFS.map((d) => ({ key: d.key, level: 1, unlocked: !!d.starter, stars: 1, shards: 0 })),
  builders: INITIAL_BUILDERS,
  upgrades: [],
  defenseLog: [],
  trophies: 0,
  campaign: { unlocked: 1, stars: {}, claimed: [] },
  teamName: genTeamName(),
  dailies: freshDailies(todayKey(now)),
  defenses: [{ id: "def-1", kind: "jugs", gridX: 5, gridY: 4 }],
  // starter JUGS machine
  inventory: { sleds: 0, defenses: [], bus: false },
  bus: { gridX: 6, gridY: 9 },
  // LEGACY — bus is a fixed fixture at BUS_TILE now
  parkingLot: 0,
  bonusDefSlots: 0,
  defenseSlots: { D1: 1 },
  // starter JUGS machine lives in its fixed slot
  formation: "goalline",
  // starter scheme; Cover 3 @ Stadium L3, Max Protect @ L5
  heroGates: {},
  // gate posts auto-fill with your strongest heroes until assigned
  formationMastery: {},
  // holds per formation — tiers at 3/8/15 (+3% defense each)
  gauntlet: { best: 0, attempts: 3, date: todayKey(now) }
  // 🛡 attempts refill daily on load
});

// game/saveValidation.ts
var SaveLoadError = class extends Error {
  cause;
  constructor(message, options) {
    super(message);
    this.name = "SaveLoadError";
    this.cause = options?.cause;
  }
};
var object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var number = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
var text2 = (v) => typeof v === "string";
var point2 = (v) => object(v) && ["x", "y", "z"].every((k) => typeof v[k] === "number" && Number.isFinite(v[k]));
var numericMap = (v) => object(v) && Object.values(v).every(number);
var stringArray = (v) => Array.isArray(v) && v.every(text2);
function parseSavedClub(raw) {
  const s = JSON.parse(raw);
  if (!object(s)) throw new SaveLoadError("The save must contain a club.");
  const require2 = (ok, field) => {
    if (!ok) throw new SaveLoadError(`Invalid saved ${field}.`);
  };
  require2(object(s.resources) && ["COINS", "GEMS", "ENERGY", "FANS"].every((k) => number(s.resources[k])), "resources");
  require2(Array.isArray(s.buildings) && s.buildings.every((b) => object(b) && text2(b.id) && Object.values(BuildingType).includes(b.type) && number(b.level) && b.level >= 1 && Number.isInteger(b.level) && Number.isFinite(b.gridX) && Number.isFinite(b.gridY) && Object.values(DrillState).includes(b.state)), "facilities");
  require2(Array.isArray(s.roster) && s.roster.every((p) => object(p) && text2(p.id) && text2(p.name) && number(p.level) && point2(p.worldPos) && point2(p.targetPos) && Object.values(UnitGroup).includes(p.unit) && Object.values(PlayerRole).includes(p.role) && Object.values(PlayerState).includes(p.state) && object(p.stats) && ["strength", "speed", "iq"].every((k) => number(p.stats[k]))), "roster");
  for (const field of ["lastTick", "timeOfDay", "trophies", "builders", "parkingLot", "bonusDefSlots", "shieldUntil", "energyProgressMs", "peakFans"]) {
    if (field in s) require2(number(s[field]), field);
  }
  if (s.teamName != null) require2(text2(s.teamName), "team name");
  if (s.heroes != null) require2(Array.isArray(s.heroes) && s.heroes.every((h) => object(h) && text2(h.key) && number(h.level)), "heroes");
  if ("upgrades" in s) require2(Array.isArray(s.upgrades) && s.upgrades.every((u) => object(u) && text2(u.id) && text2(u.key) && ["building", "hero"].includes(u.kind) && number(u.toLevel) && number(u.startTime) && number(u.finishTime)), "upgrades");
  if (s.campaign != null) require2(object(s.campaign) && number(s.campaign.unlocked) && s.campaign.unlocked >= 1 && numericMap(s.campaign.stars) && Array.isArray(s.campaign.claimed) && s.campaign.claimed.every(number), "campaign");
  if (s.dailies != null) require2(object(s.dailies) && text2(s.dailies.date) && numericMap(s.dailies.progress) && stringArray(s.dailies.claimed) && typeof s.dailies.sweepClaimed === "boolean", "daily practice");
  if (s.gauntlet != null) require2(object(s.gauntlet) && text2(s.gauntlet.date) && number(s.gauntlet.best) && number(s.gauntlet.attempts), "Gauntlet");
  for (const field of ["defenseSlots", "formationMastery"]) if (s[field] != null) require2(numericMap(s[field]), field);
  for (const field of ["defenseLog", "walls", "bonusOrbs", "matchHistory", "defenses"]) if (field in s) require2(Array.isArray(s[field]) && s[field].every(object), field);
  if (s.defenseInbox != null) require2(object(s.defenseInbox) && typeof s.defenseInbox.ownerId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.defenseInbox.ownerId) && typeof s.defenseInbox.createdAt === "string" && Number.isFinite(Date.parse(s.defenseInbox.createdAt)) && Number.isSafeInteger(s.defenseInbox.id) && s.defenseInbox.id >= 0, "live defense cursor");
  if (s.inventory != null) require2(object(s.inventory) && Array.isArray(s.inventory.defenses), "inventory");
  if (s.heroGates != null) require2(object(s.heroGates) && Object.values(s.heroGates).every(text2), "hero assignments");
  if (s.campusLayout !== void 0) {
    const layout2 = parseCampusLayout(s.campusLayout, s.buildings);
    require2(!!layout2 && layout2.formation === s.formation, "campus formation");
    s.campusLayout = layout2;
  }
  return s;
}

// game/authority/protection.ts
var KEY = "fhq_authority_protection_v1";
var uuid3 = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
var sessionProtection = null;
var storageFailed = false;
function read(storage) {
  if (!storage && storageFailed) return sessionProtection;
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(KEY) ?? "null");
    if (!value || !uuid3(value.viewOwner) || typeof value.pending !== "boolean" || !Array.isArray(value.owners) || !value.owners.every(uuid3)) return null;
    return value;
  } catch {
    return storage ? null : sessionProtection;
  }
}
function authorityProtectionRequired(storage) {
  return read(storage) !== null;
}

// game/persistence.ts
var SAVE_KEY = "fhq_save_v1";
var loadState = (storage, now = Date.now()) => {
  const INITIAL_STATE = createInitialState(now);
  let raw;
  try {
    storage ??= localStorage;
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return INITIAL_STATE;
  }
  try {
    if (raw) {
      const saved = parseSavedClub(raw);
      if (authorityProtectionRequired(storage)) {
        try {
          storage.setItem("fhq_save_backup_boot", raw);
        } catch {
        }
        return saved;
      }
      const buildings = (saved.buildings || INITIAL_BUILDINGS).map((b) => {
        let gridX = Math.min(8, Math.max(2, b.gridX));
        let gridY = Math.min(8, Math.max(2, b.gridY));
        if (b.id === "tactics-1" && (gridX === 3 && gridY === 3 || gridX === 8 && gridY === 5)) {
          gridX = 3;
          gridY = 8;
        }
        if (b.id === "med-1" && (gridX === 2 && gridY === 6 || gridX === 3 && gridY === 6)) {
          gridX = 3;
          gridY = 5;
        }
        return { ...b, gridX, gridY };
      });
      const presentIds = new Set(buildings.map((b) => b.id));
      for (const ib of INITIAL_BUILDINGS) {
        if (!presentIds.has(ib.id)) buildings.push({ ...ib });
      }
      const roster = (saved.roster || INITIAL_ROSTER).map((p) => ({ ...p, state: "IDLE" /* IDLE */, targetPos: { ...p.worldPos }, tendency: p.tendency ?? tendencyFromId(p.id) }));
      const heroes2 = (saved.heroes || []).map((h) => ({
        ...h,
        unlocked: h.unlocked ?? HERO_DEFS.find((d) => d.key === h.key)?.starter ?? false,
        stars: h.stars ?? 1,
        shards: h.shards ?? 0
      }));
      const presentHeroKeys = new Set(heroes2.map((h) => h.key));
      for (const dh of HERO_DEFS) {
        if (!presentHeroKeys.has(dh.key)) {
          heroes2.push({ key: dh.key, level: 1, unlocked: !!dh.starter, stars: 1, shards: 0 });
        }
      }
      const campaign = saved.campaign ?? { unlocked: 1, stars: {}, claimed: [] };
      const dailies = saved.dailies && saved.dailies.date === todayKey(now) ? saved.dailies : freshDailies(todayKey(now));
      const teamName = saved.teamName || genTeamName();
      const defenses = [...saved.defenses ?? [{ id: "def-1", kind: "jugs", gridX: 5, gridY: 4 }]];
      const inventory = { ...saved.inventory ?? { sleds: 0, defenses: [], bus: false } };
      inventory.defenses = [...inventory.defenses];
      let bus = saved.bus !== void 0 ? saved.bus : inventory.bus ? null : { gridX: 6, gridY: 9 };
      const parkingLot = saved.parkingLot ?? 0;
      const bonusDefSlots = saved.bonusDefSlots ?? 0;
      const stadiumLvlNow = buildings.find((b) => b.type === "STADIUM" /* STADIUM */)?.level ?? 1;
      let formation = saved.formation ?? "goalline";
      if (!FORMATIONS[formation] || !formationUnlocked(formation, stadiumLvlNow)) formation = "goalline";
      const campusLayout = saved.campusLayout ? parseCampusLayout(saved.campusLayout, buildings) ?? void 0 : void 0;
      for (const b of buildings) {
        const a = campusLayout?.facilities.find((p) => p.id === b.id) ?? anchorsFor(formation)[b.type];
        if (a) {
          b.gridX = a.gridX;
          b.gridY = a.gridY;
        }
      }
      const migratedWalls = saved.walls || INITIAL_WALLS;
      let slotRefund = 0;
      let defenseSlots;
      if (saved.defenseSlots) {
        defenseSlots = { ...saved.defenseSlots };
      } else {
        defenseSlots = {};
        const ownedKinds = [...defenses.map((d) => d.kind), ...inventory.defenses.map((d) => d.kind)];
        for (const kind of ownedKinds) {
          const slot = slotsFor(formation).find((s) => s.kind === kind && !defenseSlots[s.id] && slotUnlocked(s, stadiumLvlNow, bonusDefSlots));
          if (slot) defenseSlots[slot.id] = 1;
          else slotRefund += DEFENSE_TYPES.find((t) => t.kind === kind)?.cost ?? 0;
        }
      }
      const formationMastery = { ...saved.formationMastery ?? {} };
      const defenseLog = [...saved.defenseLog || []];
      const coins = (saved.resources?.["COINS" /* COINS */] ?? INITIAL_STATE.resources["COINS" /* COINS */]) + slotRefund;
      const shieldUntil = saved.shieldUntil || 0;
      const trophies = saved.trophies || 0;
      const resources = { ...INITIAL_STATE.resources, ...saved.resources || {}, ["COINS" /* COINS */]: coins };
      const gauntlet = saved.gauntlet && saved.gauntlet.date === todayKey(now) ? saved.gauntlet : { best: saved.gauntlet?.best ?? 0, attempts: 3, date: todayKey(now) };
      try {
        storage.setItem("fhq_save_backup_boot", raw);
      } catch {
      }
      return advanceCampus({ ...INITIAL_STATE, ...saved, buildings, roster, heroes: heroes2, campaign, dailies, teamName, defenses, inventory, bus, parkingLot, bonusDefSlots, defenseSlots, formation, campusLayout, heroGates: saved.heroGates ?? {}, formationMastery, gauntlet, walls: migratedWalls, resources, defenseLog, shieldUntil, trophies, lastTick: saved.lastTick ?? now, energyProgressMs: saved.energyProgressMs ?? 0, peakFans: fanMilestoneTotal(saved) }, now);
    }
  } catch (e) {
    throw new SaveLoadError("Your saved club could not be read.", { cause: e });
  }
  return INITIAL_STATE;
};

// server/authorityAdmission.ts
var bounded = (n, lo, hi) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
var integer2 = (n, lo, hi) => bounded(n, lo, hi) && Number.isSafeInteger(n);
var object2 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var text3 = (value, length = 100) => typeof value === "string" && value.length > 0 && value.length <= length && !/[\u0000-\u001f\u007f]/u.test(value);
var date = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
var point3 = (value) => object2(value) && ["x", "y", "z"].every((key) => bounded(value[key], -1e3, 1e3));
var reject = () => {
  throw new MatchRuleError("invalid_legacy", "This club needs recovery before online protection can be enabled. Your local club has been kept.");
};
var validPlayer = (p) => object2(p) && text3(p.id) && text3(p.name) && integer2(p.level, 1, 100) && Object.prototype.hasOwnProperty.call(ROLE_UNIT, p.role) && ROLE_UNIT[p.role] === p.unit && object2(p.stats) && ["strength", "speed", "iq"].every((key) => bounded(p.stats[key], 1, 1e3)) && point3(p.worldPos) && point3(p.targetPos) && (p.rarity === void 0 || Object.values(PlayerRarity).includes(p.rarity)) && (p.maxStat === void 0 || bounded(p.maxStat, 1, 1e3));
function validatePending(saved, now) {
  const jobs = saved.upgrades ?? [];
  if (jobs.length > 20 || new Set(jobs.map((job) => job.id)).size !== jobs.length || new Set(jobs.map((job) => `${job.kind}:${job.key}`)).size !== jobs.length) return reject();
  for (const job of jobs) {
    const target = job.kind === "building" ? saved.buildings.find((b) => b.id === job.key) : saved.heroes?.find((h) => h.key === job.key);
    if (!text3(job.id) || !target || !integer2(job.toLevel, target.level, target.level + 1) || !integer2(job.startTime, 0, now) || !integer2(job.finishTime, job.startTime, now + 7 * 864e5)) return reject();
  }
  for (const building of saved.buildings) {
    if (building.state === "ACTIVE" /* ACTIVE */ || building.state === "COMPLETED" /* COMPLETED */) {
      const drill = building.activeDrillId && Object.prototype.hasOwnProperty.call(DRILLS, building.activeDrillId) ? DRILLS[building.activeDrillId] : null;
      if (building.type !== "TRAINING_PITCH" /* TRAINING_PITCH */ || !drill || !Object.values(ROLE_UNIT).includes(building.targetUnit) || !integer2(building.startTime, 0, now) || !integer2(building.finishTime, building.startTime, now + 7 * 864e5) || building.state === "COMPLETED" /* COMPLETED */ && building.finishTime > now) return reject();
    }
  }
  if (saved.recruitSlot != null) {
    const slot = saved.recruitSlot;
    if (!object2(slot) || !validPlayer(slot.candidate) || !bounded(slot.cost, 0, 1e9) || !integer2(slot.finishTime, 0, now + 7 * 864e5) || saved.roster.some((p) => p.id === slot.candidate.id)) return reject();
  }
}
function pristine(saved, now) {
  const fresh = createInitialState(now);
  return saved.currentMatch === 1 && saved.trophies === 0 && saved.teamReadiness === 0 && saved.resources.COINS <= 500 && saved.resources.GEMS <= 10 && saved.resources.FANS === 0 && (saved.peakFans ?? 0) === 0 && (saved.builders ?? fresh.builders) === fresh.builders && (saved.parkingLot ?? 0) === 0 && (saved.bonusDefSlots ?? 0) === 0 && !saved.campusLayout && (!saved.formation || saved.formation === "goalline") && !saved.recruitSlot && !saved.recruitBoard && !saved.upgrades?.length && !saved.matchHistory?.length && !saved.defenseLog?.length && saved.buildings.length === fresh.buildings.length && saved.buildings.every((b) => b.level === 1 && b.state === "IDLE" /* IDLE */) && saved.roster.length === INITIAL_ROSTER.length && saved.roster.every((p) => {
    const initial = INITIAL_ROSTER.find((value) => value.id === p.id);
    return initial && p.level === 1 && p.role === initial.role && p.unit === initial.unit && p.rarity === initial.rarity && ["strength", "speed", "iq"].every((k) => p.stats[k] === initial.stats[k]);
  }) && (!saved.heroes || saved.heroes.length === HERO_DEFS.length && saved.heroes.every((h) => h.level === 1 && (h.stars ?? 1) === 1 && (h.shards ?? 0) === 0 && (h.unlocked ?? !!HERO_DEFS.find((d) => d.key === h.key)?.starter) === !!HERO_DEFS.find((d) => d.key === h.key)?.starter)) && (!saved.campaign || saved.campaign.unlocked === 1 && !Object.keys(saved.campaign.stars).length && !saved.campaign.claimed.length) && (!saved.gauntlet || saved.gauntlet.best === 0 && saved.gauntlet.attempts === 3) && (!saved.dailies || !Object.values(saved.dailies.progress).some((n) => n > 0) && !saved.dailies.claimed.length && !saved.dailies.sweepClaimed) && (!saved.formationMastery || !Object.values(saved.formationMastery).some((n) => n > 0)) && (!saved.defenseSlots || Object.entries(saved.defenseSlots).every(([key, n]) => key === "D1" ? n === 1 : n === 0));
}
function admitClub(legacy, createdAt, activationAt, now) {
  if (!integer2(now, 0, 864e13) || !integer2(createdAt, 0, now) || !integer2(activationAt, 0, 864e13)) return reject();
  if (legacy === void 0) return { state: createInitialState(now), origin: "new" };
  let raw, saved;
  try {
    raw = JSON.stringify(legacy);
    if (raw.length > 45e4) return reject();
    saved = parseSavedClub(raw);
  } catch {
    return reject();
  }
  if (!(createdAt < activationAt)) {
    if (!pristine(saved, now)) throw new MatchRuleError("legacy_ineligible", "This local club predates its online account. Keep playing locally; online protection cannot replace its progress.");
    const state2 = createInitialState(now);
    state2.teamName = (saved.teamName || state2.teamName).trim().slice(0, 40);
    return { state: state2, origin: "new" };
  }
  if (!bounded(saved.resources.COINS, 0, 1e9) || !bounded(saved.resources.GEMS, 0, 1e7) || !bounded(saved.resources.FANS, 0, 1e8) || !bounded(saved.resources.ENERGY, 0, 100) || !integer2(saved.lastTick, 0, now) || !integer2(saved.currentMatch, 1, 1e7) || !bounded(saved.teamReadiness, 0, 100) || !integer2(saved.trophies, 0, 1e7) || saved.peakFans !== void 0 && !bounded(saved.peakFans, 0, 1e8) || saved.energyProgressMs !== void 0 && !bounded(saved.energyProgressMs, 0, 864e5) || saved.shieldUntil !== void 0 && !integer2(saved.shieldUntil, 0, now + 7 * 864e5) || !bounded(saved.timeOfDay, 0, 24) || !Object.values(SeasonPhase).includes(saved.seasonPhase) || saved.buildings.length > 20 || new Set(saved.buildings.map((b) => b.id)).size !== saved.buildings.length || !saved.buildings.every((b) => INITIAL_BUILDINGS.some((owned) => owned.id === b.id && owned.type === b.type) && bounded(b.level, 1, 100) && (b.accrued === void 0 || bounded(b.accrued, 0, 1e7))) || !saved.roster.length || saved.roster.length > 150 || new Set(saved.roster.map((p) => p.id)).size !== saved.roster.length || !saved.roster.every(validPlayer)) return reject();
  validatePending(saved, now);
  let normalized;
  try {
    const memory = { getItem: (key) => key === SAVE_KEY ? raw : null, setItem: () => {
    } };
    normalized = loadState(memory, now);
  } catch {
    return reject();
  }
  if (!integer2(normalized.builders, 1, MAX_BUILDERS) || !integer2(normalized.parkingLot, 0, 3) || !integer2(normalized.bonusDefSlots, 0, 3) || !Object.prototype.hasOwnProperty.call(FORMATIONS, normalized.formation) || normalized.heroes.length !== HERO_DEFS.length || new Set(normalized.heroes.map((h) => h.key)).size !== HERO_DEFS.length || !normalized.heroes.every((h) => HERO_DEFS.some((d) => d.key === h.key) && integer2(h.level, 1, 100) && integer2(h.stars, 1, 5) && integer2(h.shards, 0, 1e7) && typeof h.unlocked === "boolean") || Object.entries(normalized.defenseSlots).some(([key, n]) => !FORMATION_ORDER.some((f) => slotsFor(f).some((slot) => slot.id === key)) || !integer2(n, 0, MAX_SLOT_LEVEL)) || Object.entries(normalized.formationMastery).some(([key, n]) => !FORMATION_ORDER.includes(key) || !integer2(n, 0, 1e7)) || Object.entries(normalized.heroGates).some(([post, hero]) => !FORMATION_ORDER.some((f) => gatePostsFor(f).some((p) => p.id === post)) || !normalized.heroes.some((h) => h.key === hero && h.unlocked)) || !integer2(normalized.gauntlet.best, 0, 20) || !integer2(normalized.gauntlet.attempts, 0, 3) || !date(normalized.gauntlet.date) || !integer2(normalized.campaign.unlocked, 1, CAMPAIGN_STAGES.length) || Object.entries(normalized.campaign.stars).some(([key, n]) => !integer2(Number(key), 1, CAMPAIGN_STAGES.length) || !integer2(n, 0, 3)) || normalized.campaign.claimed.some((n) => !integer2(n, 1, CAMPAIGN_STAGES.length)) || new Set(normalized.campaign.claimed).size !== normalized.campaign.claimed.length || !date(normalized.dailies.date) || Object.entries(normalized.dailies.progress).some(([key, n]) => !ALL_QUESTS.some((q) => q.id === key) || !bounded(n, 0, 1e8)) || normalized.dailies.claimed.some((key) => !ALL_QUESTS.some((q) => q.id === key)) || new Set(normalized.dailies.claimed).size !== normalized.dailies.claimed.length || normalized.upgrades.length > 20 || normalized.upgrades.some((j) => !bounded(j.toLevel, 1, 100) || !bounded(j.startTime, 0, now) || !bounded(j.finishTime, j.startTime, now + 7 * 864e5))) return reject();
  const state = createInitialState(now);
  for (const key of Object.keys(state)) state[key] = normalized[key];
  state.campusLayout = normalized.campusLayout;
  state.roster = normalized.roster.map((p) => ({ ...p, rarity: p.rarity ?? "COMMON" /* COMMON */, maxStat: p.maxStat ?? RARITY_CONFIG[p.rarity ?? "COMMON" /* COMMON */].maxStat, avatarColor: UNIT_COLOR[p.unit], tendency: text3(p.tendency, 50) ? p.tendency : tendencyFromId(p.id) }));
  state.recruitSlot = normalized.recruitSlot ? structuredClone(normalized.recruitSlot) : null;
  state.recruitBoard = void 0;
  state.defenseLog = [];
  state.bonusOrbs = [];
  if (!Array.isArray(state.matchHistory) || state.matchHistory.some((m) => !object2(m) || !integer2(m.week, 1, 1e7) || !text3(m.opponent, 200) || !bounded(m.ourScore, 0, 1e3) || !bounded(m.theirScore, 0, 1e3) || typeof m.won !== "boolean" || !bounded(m.reward, 0, 1e9))) return reject();
  state.matchHistory = state.matchHistory.slice(0, 50);
  state.teamName = state.teamName.trim().slice(0, 40) || "Football Club";
  state.lastTick = now;
  return { state, origin: "legacy" };
}

// server/authorityService.ts
var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var object3 = (x) => !!x && typeof x === "object" && !Array.isArray(x);
var invalid = () => {
  throw new MatchRuleError("invalid_request", "That club request is invalid.");
};
var keys = (v, allowed) => {
  if (Object.keys(v).some((k) => !allowed.includes(k))) invalid();
};
var messages = {
  revision_conflict: "Your club changed on another device. The latest progress has been loaded; review it before trying again.",
  operation_conflict: "That request identifier was already used for another action.",
  match_conflict: "This game has already changed. Refresh to continue from its saved status.",
  not_found: "Your protected club could not be found."
};
var hashRequest = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value))))).map((n) => n.toString(16).padStart(2, "0")).join("");
var uint32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
var issued = (match) => ({ ...match, cost: Number(match.metadata.cost), choice: parseMatchChoice(match.metadata.choice) });
var visibleMatch = (match) => match ? { ...match, metadata: { choice: match.metadata.choice, cost: match.metadata.cost } } : null;
function createAuthorityService(store2, options = {}) {
  const clock = options.now ?? Date.now, random = options.randomUint32 ?? uint32, newId = options.uuid ?? (() => crypto.randomUUID());
  return async (identity, input) => {
    const now = clock();
    try {
      if (!Number.isSafeInteger(now) || now < 0 || now > 864e13 || !UUID2.test(identity.owner) || !Number.isSafeInteger(identity.createdAt) || identity.createdAt < 0 || identity.createdAt > now || !object3(input) || !Object.prototype.hasOwnProperty.call(input, "kind") || typeof input.kind !== "string" || JSON.stringify(input).length > 45e4) return invalid();
      const owner = identity.owner;
      let club = await store2.getClub(owner);
      if (input.kind === "bootstrap") {
        keys(input, ["kind", "legacy"]);
        if (!club) {
          const config = await store2.getConfiguration();
          const admitted = admitClub(input.legacy, identity.createdAt, config.activationAt, now);
          club = await store2.createClub(owner, admitted.state, admitted.origin);
        }
        return { ok: true, club, serverNow: now, match: visibleMatch(club.activeMatch ? await store2.getMatch(owner, club.activeMatch) : null) };
      }
      if (input.kind === "status") {
        keys(input, ["kind"]);
        return { ok: true, club, serverNow: now, match: visibleMatch(club?.activeMatch ? await store2.getMatch(owner, club.activeMatch) : null), rivals: club ? await store2.listRivals(owner) : [], roadTargets: club ? authorityRoadTargets(club.state, owner, now) : [] };
      }
      if (input.kind === "leaderboard") {
        keys(input, ["kind"]);
        return { ok: true, club, serverNow: now, leaderboard: await store2.getLeaderboard() };
      }
      if (!club) throw new MatchRuleError("not_found", messages.not_found);
      if (input.kind === "film") {
        keys(input, ["kind", "matchId"]);
        if (typeof input.matchId !== "string" || !UUID2.test(input.matchId)) return invalid();
        const film = await store2.getMatchForParticipant(owner, input.matchId);
        if (!film || film.status !== "settled") throw new MatchRuleError("film_unavailable", "That film is unavailable.");
        return { ok: true, club, serverNow: now, result: film.result };
      }
      if (typeof input.operationId !== "string" || !UUID2.test(input.operationId) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return invalid();
      const common = ["kind", "operationId", "expectedRevision"];
      const allowed = { action: [...common, "action"], "match.reserve": [...common, "choice"], "match.begin": [...common, "matchId"], "match.cancel": [...common, "matchId"], "match.finish": [...common, "matchId", "submission"] };
      if (!Object.prototype.hasOwnProperty.call(allowed, input.kind)) return invalid();
      keys(input, allowed[input.kind]);
      const requestHash = await hashRequest(input);
      const previous = await store2.findOperation(owner, input.operationId);
      if (previous) {
        if (previous.requestHash !== requestHash) throw new MatchRuleError("operation_conflict", messages.operation_conflict);
        const latest = await store2.getClub(owner);
        return { ok: true, club: latest, serverNow: now, result: previous.result, match: visibleMatch(latest?.activeMatch ? await store2.getMatch(owner, latest.activeMatch) : null) };
      }
      if (club.revision !== input.expectedRevision) return { ok: false, code: "revision_conflict", message: messages.revision_conflict, club, serverNow: now };
      const commit = { owner, expectedRevision: club.revision, operationId: input.operationId, requestHash, nextState: club.state, result: null };
      if (input.kind === "action") {
        if (club.activeMatch) throw new MatchRuleError("active_match", "Finish or cancel your reserved game before changing the club.");
        const outcome = applyClubAction(club.state, input.action, { now, random: () => random() / 4294967296 });
        if (!outcome.ok) throw new MatchRuleError(outcome.code, outcome.message);
        commit.nextState = outcome.state;
        commit.result = outcome.result;
      } else if (input.kind === "match.reserve") {
        if (club.activeMatch) throw new MatchRuleError("active_match", "Continue or cancel your existing game first.");
        const choice = parseMatchChoice(input.choice);
        const target = choice.kind === "rival" ? await store2.getClub(choice.target) : null;
        if (target?.activeMatch) throw new MatchRuleError("target_busy", "That club is playing a game. Choose another rival.");
        const created = issueMatch({ state: club.state, owner, id: newId(), seed: random(), now, choice, target: target?.state });
        const match = { ...created.match, status: "reserved", metadata: { choice, cost: created.match.cost, targetOwner: target?.owner, defenseFormation: target?.state.formation } };
        commit.nextState = created.state;
        commit.match = match;
        commit.result = { type: "match.reserve", matchId: match.id };
        if (target) commit.target = { owner: target.owner, expectedRevision: target.revision, nextState: target.state };
      } else {
        if (typeof input.matchId !== "string" || !UUID2.test(input.matchId)) return invalid();
        const match = await store2.getMatch(owner, input.matchId);
        if (!match || club.activeMatch !== match.id) throw new MatchRuleError("match_conflict", messages.match_conflict);
        if (input.kind === "match.begin") {
          if (match.status !== "reserved") throw new MatchRuleError("match_conflict", messages.match_conflict);
          if (now > match.expiresAt) throw new MatchRuleError("expired", "This game expired. Cancel it to release the reservation.");
          if (match.config.mode === "attack") commit.nextState = { ...club.state, shieldUntil: 0 };
          commit.match = { ...match, status: "started", expectedStatus: "reserved" };
          commit.result = { type: "match.begin", matchId: match.id };
        } else if (input.kind === "match.cancel") {
          if (!["reserved", "started"].includes(match.status)) throw new MatchRuleError("match_conflict", messages.match_conflict);
          commit.nextState = match.status === "reserved" ? cancelReservation(settleClubState(club.state, { now }), issued(match)) : settleClubState(club.state, { now });
          commit.match = { ...match, status: "cancelled", expectedStatus: match.status };
          commit.result = { type: "match.cancel", matchId: match.id, refunded: match.status === "reserved" };
        } else {
          if (match.status !== "started") throw new MatchRuleError("match_not_started", "Start your issued game before submitting its film.");
          const verified = verifyMatch(issued(match), input.submission, now);
          commit.nextState = settleMatchRewards(club.state, verified.result, now);
          commit.match = { ...match, status: "settled", expectedStatus: "started", result: { replay: verified.replay, battleResult: verified.result } };
          commit.result = { type: "match.finish", matchId: match.id, battleResult: verified.result };
          if (typeof match.metadata.targetOwner === "string") {
            const target = await store2.getClub(match.metadata.targetOwner);
            if (target) {
              const state = settleClubState(target.state, { now });
              const lost = Math.min(verified.result.coins, Math.floor(state.resources.COINS * 0.12));
              const formation = String(match.metadata.defenseFormation);
              const nextState = {
                ...state,
                resources: { ...state.resources, COINS: state.resources.COINS - lost },
                trophies: Math.max(0, state.trophies - (verified.result.won ? Math.max(1, verified.result.stars) * 3 : 0)),
                shieldUntil: verified.result.won ? Math.max(state.shieldUntil ?? 0, now + 2 * 36e5) : state.shieldUntil,
                formationMastery: verified.result.stars === 0 ? { ...state.formationMastery, [formation]: (state.formationMastery[formation] ?? 0) + 1 } : state.formationMastery,
                defenseLog: [{ id: match.id, attacker: match.config.attackerName ?? "Rival Club", attackerPid: owner, at: now, stars: verified.result.stars, pct: verified.result.pct, coinsLost: lost, seen: false, authorityMatchId: match.id, defenseLayoutId: match.config.defenseLayoutId }, ...state.defenseLog].slice(0, 30)
              };
              commit.target = { owner: target.owner, expectedRevision: target.revision, nextState };
            }
          }
        }
      }
      const result = await store2.commit(commit);
      if (!result.ok) return { ...result, message: messages[result.code], serverNow: now };
      return { ok: true, club: result.club, result: result.result, serverNow: now, match: visibleMatch(result.club.activeMatch ? await store2.getMatch(owner, result.club.activeMatch) : null) };
    } catch (error) {
      if (error instanceof MatchRuleError) return { ok: false, code: error.code, message: error.message, serverNow: now };
      return { ok: false, code: "unavailable", message: "Online protection is temporarily unavailable. Your club has been kept. Retry to check whether the request completed.", serverNow: now };
    }
  };
}

// server/authorityHttp.ts
var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
var headers = { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
var reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
function createAuthorityHttp(options) {
  const send = options.fetch ?? fetch;
  return async (request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ ok: false, code: "method", message: "Use a club request." }, 405);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ ok: false, code: "content_type", message: "A JSON club request is required." }, 415);
    const bearer = request.headers.get("authorization");
    if (!bearer || !/^Bearer [A-Za-z0-9._-]+$/.test(bearer) || bearer.length > 12e3) return reply({ ok: false, code: "unauthorized", message: "Reconnect your club to continue." }, 401);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 1e4);
    try {
      const auth = await send(new URL("/auth/v1/user", options.url), { headers: { Authorization: bearer, apikey: options.publicKey }, redirect: "error", cache: "no-store", signal: controller.signal });
      if (!auth.ok) return reply({ ok: false, code: "unauthorized", message: "Reconnect your club to continue." }, 401);
      const user = await auth.json();
      if (typeof user.id !== "string" || typeof user.created_at !== "string" || !Number.isFinite(Date.parse(user.created_at))) return reply({ ok: false, code: "unauthorized", message: "Reconnect your club to continue." }, 401);
      const reader = request.body?.getReader();
      if (!reader) return reply({ ok: false, code: "invalid_request", message: "The club request is missing." }, 400);
      const decoder = new TextDecoder();
      let length = 0, text4 = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 45e4) {
          await reader.cancel();
          return reply({ ok: false, code: "too_large", message: "This club request is too large." }, 413);
        }
        text4 += decoder.decode(part.value, { stream: true });
      }
      text4 += decoder.decode();
      let body;
      try {
        body = JSON.parse(text4);
      } catch {
        return reply({ ok: false, code: "invalid_request", message: "The club request could not be read." }, 400);
      }
      return reply(await options.service({ owner: user.id, createdAt: Date.parse(user.created_at) }, body));
    } catch {
      return reply({ ok: false, code: "unavailable", message: "Online protection is temporarily unavailable. Your club has been kept." }, 503);
    } finally {
      clearTimeout(timer);
    }
  };
}

// supabase/functions/club-authority/index.ts
var required = (key) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error("Missing club service configuration.");
  return value;
};
var url = required("SUPABASE_URL");
var store = createSupabaseAuthorityStore({ url, serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY") });
Deno.serve(createAuthorityHttp({ url, publicKey: required("SUPABASE_ANON_KEY"), service: createAuthorityService(store) }));
