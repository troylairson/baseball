import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lastSaveId, useGame } from '../state/game';
import { AppShell } from './layout/AppShell';
import { FreeAgents } from './screens/FreeAgents';
import { FrontOffice } from './screens/FrontOffice';
import { Games } from './screens/Games';
import { Home } from './screens/Home';
import { League } from './screens/League';
import { NewCareer } from './screens/NewCareer';
import { Offseason } from './screens/Offseason';
import { Roster } from './screens/Roster';
import { Welcome } from './screens/Welcome';

export function App() {
  const [booting, setBooting] = useState(true);
  const load = useGame((s) => s.load);
  const hasSave = useGame((s) => s.save !== null);

  // Resume the most recent career automatically.
  useEffect(() => {
    const id = lastSaveId();
    (id ? load(id) : Promise.resolve(false)).finally(() => setBooting(false));
  }, [load]);

  if (booting) return <div className="grid min-h-dvh place-items-center text-muted">Loading…</div>;

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={hasSave ? <Navigate to="/play/home" replace /> : <Welcome />} />
        <Route path="/new" element={<NewCareer />} />
        <Route path="/play" element={<AppShell />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="roster" element={<Roster />} />
          <Route path="games" element={<Games />} />
          <Route path="office" element={<FrontOffice />} />
          <Route path="league" element={<League />} />
          <Route path="offseason" element={<Offseason />} />
          <Route path="free-agents" element={<FreeAgents />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
