/**
 * Known guaranteed MLB contracts, from public reporting (as of spring 2026).
 * The Stats API has no contract data, so the real-rosters pack uses these
 * for the players listed and estimates everyone else from service time
 * (see initialContract). Club and player options are left out: only the
 * guaranteed years count. Average annual value is in $M; Ohtani's uses the
 * present value of his heavily deferred deal.
 *
 * To correct or extend: edit a row (name as on the roster, first and last
 * guaranteed season, total value), or add one.
 */
export interface KnownContract {
  name: string;
  from: number;
  through: number;
  /** Total guaranteed value, $M. */
  total: number;
  /** Average annual value override, $M (deferred-money deals). */
  aav?: number;
}

const rows: [string, number, number, number, number?][] = [
  // Mega-deals
  ['Juan Soto', 2025, 2039, 765],
  ['Shohei Ohtani', 2024, 2033, 700, 46.1],
  ['Vladimir Guerrero Jr.', 2026, 2039, 500],
  ['Mike Trout', 2019, 2030, 426.5],
  ['Aaron Judge', 2023, 2031, 360],
  ['Mookie Betts', 2021, 2032, 365],
  ['Manny Machado', 2023, 2033, 350],
  ['Francisco Lindor', 2022, 2031, 341],
  ['Fernando Tatis Jr.', 2021, 2034, 340],
  ['Bryce Harper', 2019, 2031, 330],
  ['Corey Seager', 2022, 2031, 325],
  ['Yoshinobu Yamamoto', 2024, 2035, 325],
  ['Giancarlo Stanton', 2015, 2027, 325],
  ['Gerrit Cole', 2020, 2028, 324],
  ['Rafael Devers', 2024, 2033, 313.5],
  ['Trea Turner', 2023, 2033, 300],
  ['Bobby Witt Jr.', 2024, 2034, 288.8],
  ['Xander Bogaerts', 2023, 2033, 280],
  ['Nolan Arenado', 2020, 2027, 260],
  ['Kyle Tucker', 2026, 2029, 240],
  ['Max Fried', 2025, 2032, 218],
  ['Christian Yelich', 2020, 2028, 215],
  ['Austin Riley', 2023, 2032, 212],
  ['Corbin Burnes', 2025, 2030, 210],
  ['Dylan Cease', 2026, 2032, 210],
  ['Julio Rodríguez', 2023, 2034, 209.3],
  ['Carlos Correa', 2023, 2028, 200],
  ['Jacob deGrom', 2023, 2027, 185],
  ['Blake Snell', 2025, 2029, 182],
  ['Willy Adames', 2025, 2031, 182],
  ['Kris Bryant', 2022, 2028, 182],
  ['Dansby Swanson', 2023, 2029, 177],
  ['Alex Bregman', 2026, 2030, 175],
  ['Marcus Semien', 2022, 2028, 175],
  ['Aaron Nola', 2024, 2030, 172],
  ['Garrett Crochet', 2026, 2031, 170],
  ['Matt Olson', 2022, 2029, 168],
  ['Cody Bellinger', 2026, 2030, 162.5],
  ['Freddie Freeman', 2022, 2027, 162],
  ['Brandon Nimmo', 2023, 2030, 162],
  ['Carlos Rodón', 2023, 2028, 162],
  ['Pete Alonso', 2026, 2030, 155],
  ['Matt Chapman', 2025, 2030, 151],
  ['Kyle Schwarber', 2026, 2030, 150],
  ['Javier Báez', 2022, 2027, 140],
  ['Jackson Merrill', 2025, 2033, 135],
  ['José Berríos', 2023, 2029, 131],
  ['Ranger Suárez', 2026, 2030, 130],
  ['Bo Bichette', 2026, 2028, 126],
  ['Zack Wheeler', 2025, 2027, 126],
  ['Jose Altuve', 2025, 2029, 125],
  ['Framber Valdez', 2026, 2028, 115],
  ['Jung Hoo Lee', 2024, 2029, 113],
  ['Corbin Carroll', 2024, 2031, 111],
  ['Kevin Gausman', 2022, 2026, 110],
  ['Andrés Giménez', 2023, 2029, 106.5],
  ['Cal Raleigh', 2025, 2030, 105],
  ['Byron Buxton', 2022, 2028, 100],
  ['Ronald Acuña Jr.', 2019, 2026, 100],
  ['Joe Musgrove', 2023, 2027, 100],
  ['Josh Naylor', 2026, 2030, 92.5],
  ['Masataka Yoshida', 2023, 2027, 90],
  ['Logan Webb', 2024, 2028, 90],
  ['Willson Contreras', 2023, 2027, 87.5],
  ['Seiya Suzuki', 2022, 2026, 85],
  ['Jackson Chourio', 2025, 2032, 82],
  ['Jake Cronenworth', 2024, 2030, 80],
  ['Kodai Senga', 2023, 2027, 75],
  ['Spencer Strider', 2023, 2028, 75],
  ['Nathan Eovaldi', 2025, 2027, 75],
  ['Michael King', 2026, 2028, 75],
  ['Sonny Gray', 2024, 2026, 75],
  ['Tommy Edman', 2025, 2029, 74],
  ['Pablo López', 2024, 2027, 73.5],
  ['Michael Harris II', 2023, 2030, 72],
  ['Edwin Díaz', 2026, 2028, 69],
  ['Teoscar Hernández', 2025, 2027, 66],
  ['Ian Happ', 2024, 2026, 61],
  ['Kazuma Okamoto', 2026, 2029, 60],
  ['Sandy Alcantara', 2022, 2026, 56],
  ['Tatsuya Imai', 2026, 2028, 54],
  ['Hunter Greene', 2023, 2028, 53],
  ['Devin Williams', 2026, 2028, 51],
  ['Chris Sale', 2025, 2026, 38],
  ['Nico Hoerner', 2024, 2026, 35],
  ['Munetaka Murakami', 2026, 2027, 34],
  // More multi-year deals
  ['Tyler Glasnow', 2024, 2028, 136.5],
  ['Will Smith', 2024, 2033, 140],
  ['George Springer', 2021, 2026, 150],
  ['Yordan Alvarez', 2023, 2028, 115],
  ['Robbie Ray', 2022, 2026, 115],
  ['Luis Castillo', 2023, 2027, 108],
  ['Bryan Reynolds', 2023, 2030, 106.75],
  ['Josh Hader', 2024, 2028, 95],
  ['Anthony Santander', 2025, 2029, 92.5],
  ['Eduardo Rodriguez', 2024, 2027, 80],
  ['Sean Manaea', 2025, 2027, 75],
  ['Andrew Benintendi', 2023, 2027, 75],
  ['Tanner Scott', 2025, 2028, 72],
  ["Ke'Bryan Hayes", 2022, 2029, 70],
  ['Ryan McMahon', 2022, 2027, 70],
  ['Luis Severino', 2025, 2027, 67],
  ['Kyle Freeland', 2022, 2026, 64.5],
  ['Ezequiel Tovar', 2024, 2030, 63.5],
  ['Christian Walker', 2025, 2027, 60],
  ['Brent Rooker', 2025, 2029, 60],
  ['Nick Pivetta', 2025, 2028, 55],
  ['Michael Wacha', 2025, 2027, 51],
  ['J.P. Crawford', 2022, 2026, 51],
  ['Jeff McNeil', 2023, 2026, 50],
  ['Jordan Hicks', 2024, 2027, 44],
  ['Clay Holmes', 2025, 2027, 38],
  ['Jeff Hoffman', 2025, 2027, 33],
];

export const KNOWN_CONTRACTS: KnownContract[] = rows.map(([name, from, through, total, aav]) => ({ name, from, through, total, aav }));

/** Loose name key: no accents, punctuation or suffixes. */
export function nameKey(first: string, last: string): string {
  return `${first} ${last}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\b(jr|sr|ii|iii)\b/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

const byName = new Map(KNOWN_CONTRACTS.map((c) => {
  const [first, ...rest] = c.name.split(' ');
  return [nameKey(first!, rest.join(' ')), c];
}));

/** A player's known contract as of `season`, in game terms ($K per season, seasons left including this one). */
export function knownContract(first: string, last: string, season: number): { salary: number; years: number } | null {
  const c = byName.get(nameKey(first, last));
  if (!c || c.through < season || c.from > season) return null;
  const aav = c.aav ?? c.total / (c.through - c.from + 1);
  return { salary: Math.round(aav * 1000), years: c.through - season + 1 };
}
