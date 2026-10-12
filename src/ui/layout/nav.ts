import type { IconName } from '../components/Icon';

export const NAV_ITEMS: { to: string; label: string; icon: IconName }[] = [
  { to: '/play/home', label: 'Home', icon: 'home' },
  { to: '/play/roster', label: 'Roster', icon: 'roster' },
  { to: '/play/games', label: 'Games', icon: 'games' },
  { to: '/play/office', label: 'Front Office', icon: 'office' },
  { to: '/play/league', label: 'League', icon: 'league' },
];
