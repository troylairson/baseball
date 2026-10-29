import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lastSaveId, useGame } from '../state/game';
import { AppShell } from './layout/AppShell';
import { FreeAgents } from './screens/FreeAgents';
import { FrontOffice } from './screens/FrontOffice';
import { Contracts } from './screens/Contracts';
import { Games } from './screens/Games';
import { Home } from './screens/Home';
import { League } from './screens/League';
import { LiveGame } from './screens/LiveGame';
import { NewCareer } from './screens/NewCareer';
import { Offseason } from './screens/Offseason';
import { Roster } from './screens/Roster';
import { Staff } from './screens/Staff';
import { Trades } from './screens/Trades';
import { Welcome } from './screens/Welcome';

/**
 * Each screen opens at the top. The browser keeps one scroll position for the
 * whole app, so without this a new screen inherits wherever the last one was
 * scrolled to. Keyed on the path only, so opening a player or box score sheet
 * (a search param) leaves the page where it is.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  const [booting, setBooting] = useState(true);
  const load = useGame((s) => s.load);
  const hasSave = useGame((s) => s.save !== null);

  // Resume the most recent career automatically.
  useEffect(() => {
    const id = lastSaveId();
    (id ? load(id) : Promise.resolve(false)).finally(() => setBooting(false));
  }, [load]);

  if (booting) return <div className="grid grid-cols-1 min-h-dvh place-items-center text-muted">Loading…</div>;

  return (
    <HashRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={hasSave ? <Navigate to="/play/home" replace /> : <Welcome />} />
        <Route path="/new" element={<NewCareer />} />
        <Route path="/play" element={<AppShell />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="roster" element={<Roster />} />
          <Route path="games" element={<Games />} />
          <Route path="office" element={<FrontOffice />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="league" element={<League />} />
          <Route path="offseason" element={<Offseason />} />
          <Route path="free-agents" element={<FreeAgents />} />
          <Route path="trades" element={<Trades />} />
          <Route path="staff" element={<Staff />} />
          <Route path="live" element={<LiveGame />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
