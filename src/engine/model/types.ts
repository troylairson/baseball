export type Hand = 'L' | 'R';
export type BatSide = Hand | 'S';

export const FIELD_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
export type FieldPosition = (typeof FIELD_POSITIONS)[number];
export type Position = FieldPosition | 'DH' | 'SP' | 'RP';

/** All ratings use the 20–80 scout scale (50 = MLB average). */
export type Rating = number;

export interface BattingRatings {
  contact: Rating;
  power: Rating;
  eye: Rating;
  speed: Rating;
}

export interface PitchingRatings {
  stuff: Rating;
  control: Rating;
  movement: Rating;
  stamina: Rating;
}

export interface FieldingRatings {
  /** Overall glove/range at the player's primary position. */
  defense: Rating;
  arm: Rating;
}

export interface Personality {
  workEthic: Rating;
  leadership: Rating;
  loyalty: Rating;
  greed: Rating;
}

export interface Contract {
  /** Annual salary in thousands of dollars. */
  salary: number;
  /** Seasons remaining including the current one. */
  years: number;
}

export type RosterLevel = 'MLB' | 'AAA';

export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
  bats: BatSide;
  throws: Hand;
  position: Position;
  /** Defensive ability by position (only positions the player can handle). */
  positionRatings: Partial<Record<FieldPosition, Rating>>;
  batting: BattingRatings;
  battingPotential: BattingRatings;
  fielding: FieldingRatings;
  pitching: PitchingRatings | null;
  pitchingPotential: PitchingRatings | null;
  personality: Personality;
  /** Hidden 0–1 injury risk. */
  injuryProneness: number;
  teamId: number | null;
  level: RosterLevel;
  contract: Contract | null;
  /** Per-player seed used to produce stable scouting noise. */
  scoutSeed: number;
  /** Accumulated pitching workload (0 = fully rested). Recovers daily. */
  fatigue: number;
}

export interface Team {
  id: number;
  city: string;
  name: string;
  abbr: string;
  primaryColor: string;
  secondaryColor: string;
  conferenceId: number;
  divisionId: number;
  /** 1 (small market) – 5 (large market). */
  market: number;
  wins: number;
  losses: number;
  runsScored: number;
  runsAllowed: number;
  /** Index into the rotation of the pitcher due to start next. */
  rotationSlot: number;
}

export interface Division {
  id: number;
  conferenceId: number;
  name: string;
}

export interface Conference {
  id: number;
  name: string;
  abbr: string;
}

export type SeasonPhase = 'preseason' | 'regular' | 'playoffs' | 'offseason';

export interface LeagueSettings {
  name: string;
  teamCount: number;
  conferences: number;
  divisionsPerConference: number;
  gamesPerSeason: number;
  designatedHitter: boolean;
}

export interface ScheduledGame {
  id: number;
  date: string;
  homeId: number;
  awayId: number;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  innings: number | null;
}

export interface League {
  settings: LeagueSettings;
  conferences: Conference[];
  divisions: Division[];
  season: number;
  phase: SeasonPhase;
  /** ISO date string of the current in-game day. */
  date: string;
}
