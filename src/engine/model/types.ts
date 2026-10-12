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
  /** Completed MLB seasons; 0 = rookie. */
  experience?: number;
  retired?: boolean;
  /** In the current amateur draft pool. */
  draftProspect?: boolean;
  /** What a free agent (or expiring player) is asking for. */
  demand?: Contract | null;
  /** Current injury; injured players can't play and sit on the injured list. */
  injury?: Injury | null;
}

export interface Injury {
  /** Days until healthy. */
  days: number;
  description: string;
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
  /** Owner's payroll budget in $K. */
  budget?: number;
  /** Scouting spend: 0 low, 1 standard, 2 high. */
  scoutingLevel?: number;
  wins: number;
  losses: number;
  runsScored: number;
  runsAllowed: number;
  /** Index into the rotation of the pitcher due to start next. */
  rotationSlot: number;
  /** Manager's saved lineup and staff; null = let the AI decide each game. */
  plan?: SavedPlan | null;
}

/** Same shape as the sim's GamePlan; kept structural to avoid an import cycle. */
export interface SavedPlan {
  lineup: { playerId: number; position: FieldPosition | 'DH' | 'P' }[];
  rotation: number[];
  closer: number | null;
  setup: number[];
  middle: number[];
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
  /** Set for postseason games. */
  seriesId?: number;
  date: string;
  homeId: number;
  awayId: number;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  innings: number | null;
}

export interface PlayoffSeries {
  id: number;
  /** 1 = first round. */
  round: number;
  /** Conference bracket this series belongs to; null for the final. */
  conferenceId: number | null;
  bestOf: number;
  /** Team with home-field advantage (better seed). Null until feeders finish. */
  highId: number | null;
  lowId: number | null;
  highSeed: number;
  lowSeed: number;
  highWins: number;
  lowWins: number;
  winnerId: number | null;
  /** Earlier-round series whose winners meet here. */
  feeders: number[];
}

export interface PlayoffState {
  series: PlayoffSeries[];
  championId: number | null;
}

export interface Award {
  name: string;
  playerId: number;
  teamId: number | null;
  summary: string;
}

export interface SeasonRecord {
  season: number;
  championId: number | null;
  runnerUpId: number | null;
  standings: { teamId: number; wins: number; losses: number }[];
  awards: Award[];
  userTeamId: number;
}

export type NewsKind = 'league' | 'team' | 'transaction' | 'award' | 'owner' | 'draft';

export interface NewsItem {
  id: number;
  date: string;
  kind: NewsKind;
  title: string;
  body?: string;
  playerId?: number;
  teamId?: number;
  /** Involves the user's team. */
  mine?: boolean;
}

export interface OwnerState {
  /** 0–100; reaching 0 gets you fired. */
  jobSecurity: number;
  targetWins: number;
  expectation: string;
  fired: boolean;
  lastReview: string | null;
}

export type OffseasonStage = 'review' | 'resign' | 'freeAgency' | 'draft';

export interface DraftPick {
  overall: number;
  round: number;
  teamId: number;
  playerId: number | null;
}

export interface DraftState {
  picks: DraftPick[];
  /** Index into picks of the team on the clock. */
  current: number;
}

export interface League {
  settings: LeagueSettings;
  conferences: Conference[];
  divisions: Division[];
  season: number;
  phase: SeasonPhase;
  /** ISO date string of the current in-game day. */
  date: string;
  playoffs?: PlayoffState | null;
  offseason?: OffseasonStage | null;
  draft?: DraftState | null;
  history?: SeasonRecord[];
  news?: NewsItem[];
  nextNewsId?: number;
  owner?: OwnerState;
  /** All coaches/scouts, employed or available. */
  staff?: import('../season/staff').StaffMember[];
}
