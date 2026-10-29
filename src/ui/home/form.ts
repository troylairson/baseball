import { rate3, type BatLog, type PitLog } from '../../engine';

/** A hitting line from game logs (slugging is close: triples count as doubles). */
export function batLine(logs: BatLog[]) {
  let pa = 0, ab = 0, h = 0, hr = 0, xbh = 0, bb = 0, rbi = 0;
  for (const g of logs) {
    pa += g.pa; ab += g.ab; h += g.h; hr += g.hr; xbh += g.xbh; bb += g.bb; rbi += g.rbi;
  }
  const avg = ab ? h / ab : 0;
  const obp = ab + bb ? (h + bb) / (ab + bb) : 0;
  const slg = ab ? (h + xbh + 2 * hr) / ab : 0;
  return { pa, ab, h, hr, rbi, bb, avg, obp, slg, ops: obp + slg, games: logs.length };
}

export function pitLine(logs: PitLog[]) {
  let outs = 0, er = 0, so = 0, bb = 0, h = 0, sv = 0, gs = 0;
  for (const g of logs) {
    outs += g.outs; er += g.er; so += g.so; bb += g.bb; h += g.h; sv += g.sv; gs += g.gs;
  }
  return { outs, er, so, bb, h, sv, gs, era: outs ? (er * 27) / outs : 0, whip: outs ? ((h + bb) * 3) / outs : 0, games: logs.length };
}

export const ipText = (outs: number) => `${Math.floor(outs / 3)}${outs % 3 ? `.${outs % 3}` : ''}`;

export function batText(l: ReturnType<typeof batLine>): string {
  return `${rate3(l.avg)}/${rate3(l.obp)}/${rate3(l.slg)} · ${l.hr} HR · ${l.rbi} RBI`;
}

export function pitText(l: ReturnType<typeof pitLine>): string {
  return `${l.era.toFixed(2)} ERA · ${ipText(l.outs)} IP · ${l.so} K${l.sv ? ` · ${l.sv} SV` : ''}`;
}
