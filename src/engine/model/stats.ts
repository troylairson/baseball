export interface BattingLine {
  g: number;
  pa: number;
  ab: number;
  r: number;
  h: number;
  d: number;
  t: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  hbp: number;
  sf: number;
  sb: number;
  cs: number;
  gidp: number;
  /** Sacrifice bunts. */
  sh: number;
  /** Intentional walks (also counted in bb). */
  ibb: number;
}

export interface PitchingLine {
  g: number;
  gs: number;
  w: number;
  l: number;
  sv: number;
  /** Outs recorded (IP × 3). */
  outs: number;
  bf: number;
  h: number;
  r: number;
  er: number;
  hr: number;
  bb: number;
  so: number;
  hbp: number;
  pitches: number;
  /** Holds, blown saves, quality starts, complete games, shutouts, intentional walks. */
  hld: number;
  bs: number;
  qs: number;
  cg: number;
  sho: number;
  ibb: number;
}

export interface PlayerSeasonStats {
  playerId: number;
  season: number;
  teamId: number;
  bat: BattingLine;
  pit: PitchingLine;
  /** Postseason totals, kept apart from the regular season. */
  post?: { bat: BattingLine; pit: PitchingLine };
  /** Lines for earlier clubs this season when a player changed teams (teamId is his latest). */
  prior?: { teamId: number; bat: BattingLine; pit: PitchingLine }[];
}

export function emptyBatting(): BattingLine {
  return { g: 0, pa: 0, ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0, hbp: 0, sf: 0, sb: 0, cs: 0, gidp: 0, sh: 0, ibb: 0 };
}

export function emptyPitching(): PitchingLine {
  return { g: 0, gs: 0, w: 0, l: 0, sv: 0, outs: 0, bf: 0, h: 0, r: 0, er: 0, hr: 0, bb: 0, so: 0, hbp: 0, pitches: 0, hld: 0, bs: 0, qs: 0, cg: 0, sho: 0, ibb: 0 };
}

/** Add every numeric field of `src` into `dst` (fields missing from older saves count as zero). */
export function addLine<T extends BattingLine | PitchingLine>(dst: T, src: T): void {
  for (const key of Object.keys(src) as (keyof T)[]) {
    (dst[key] as number) = ((dst[key] as number | undefined) ?? 0) + (((src[key] as number | undefined) ?? 0));
  }
}

/** `a - b`, field by field. */
export function subtractLine<T extends BattingLine | PitchingLine>(a: T, b: T): T {
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof T)[]) (out[key] as number) = ((a[key] as number) ?? 0) - ((b[key] as number | undefined) ?? 0);
  return out;
}

/**
 * A player's season split by club: earlier clubs from `prior`, the rest to
 * his current club. Single-team seasons return one entry.
 */
export function linesByTeam(s: PlayerSeasonStats): { teamId: number; bat: BattingLine; pit: PitchingLine }[] {
  if (!s.prior?.length) return [{ teamId: s.teamId, bat: s.bat, pit: s.pit }];
  let bat = s.bat;
  let pit = s.pit;
  for (const seg of s.prior) {
    bat = subtractLine(bat, seg.bat);
    pit = subtractLine(pit, seg.pit);
  }
  return [...s.prior, { teamId: s.teamId, bat, pit }];
}

export const singles = (b: BattingLine) => b.h - b.d - b.t - b.hr;
export const avg = (b: BattingLine) => (b.ab ? b.h / b.ab : 0);
export const obp = (b: BattingLine) => {
  const denom = b.ab + b.bb + b.hbp + b.sf;
  return denom ? (b.h + b.bb + b.hbp) / denom : 0;
};
export const slg = (b: BattingLine) => (b.ab ? (singles(b) + 2 * b.d + 3 * b.t + 4 * b.hr) / b.ab : 0);
export const ops = (b: BattingLine) => obp(b) + slg(b);

export const era = (p: PitchingLine) => (p.outs ? (p.er * 27) / p.outs : 0);
export const whip = (p: PitchingLine) => (p.outs ? ((p.bb + p.h) * 3) / p.outs : 0);
export const per9 = (n: number, p: PitchingLine) => (p.outs ? (n * 27) / p.outs : 0);

/** Innings pitched in baseball notation: 6.2 = six and two-thirds. */
export function ipString(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

/** .312 style rate. */
export function rate3(x: number): string {
  return x.toFixed(3).replace(/^0(?=\.)/, '');
}
