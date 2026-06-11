import { useEffect, useState } from 'react';
import { api, auth, pageStore } from './api';
import { warmBackend } from './components/WarmUp.jsx';
import Login from './components/Login.jsx';
import StartEndDay from './components/StartEndDay.jsx';
import DataUpdate from './components/DataUpdate.jsx';

warmBackend();

export default function App() {
  const [user, setUser] = useState(auth.user());
  const [tab, setTab] = useState(pageStore.getTab);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(pageStore.getProject);

  useEffect(() => {
    if (!user) return;
    api
      .get('/pilot/projects')
      .then((r) => setProjects(r.data.projects))
      .catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function logout() {
    auth.clear();
    setUser(null);
  }

  function switchTab(id) {
    setTab(id);
    pageStore.setTab(id);
  }

  function switchProject(id) {
    setProjectId(id);
    pageStore.setProject(id);
  }

  if (!user) return <Login onLogin={setUser} />;

  const tabs = [
    { id: 'start', label: 'Start Day' },
    { id: 'end', label: 'End Day' },
    { id: 'data', label: 'Data Update' },
  ];

  const sharedProps = { projects, projectId, onProjectChange: switchProject };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.png" alt="" style={{ height: 24, marginRight: 8, verticalAlign: 'middle', borderRadius: 4 }} />
          प्रतिबिम्ब:<span className="muted">· Pilot</span>
        </div>
        <div className="topbar-right">
          <span className="who">{user.name}</span>
          <button className="ghost" onClick={logout}>Logout</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'start' && (
          <StartEndDay mode="start" onDayEnded={() => switchTab('data')} {...sharedProps} />
        )}
        {tab === 'end' && (
          <StartEndDay mode="end" onDayEnded={() => switchTab('data')} {...sharedProps} />
        )}
        {tab === 'data' && <DataUpdate user={user} {...sharedProps} />}
      </main>
    </div>
  );
}
