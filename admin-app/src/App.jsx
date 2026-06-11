import { useState } from 'react';
import { auth, pageStore } from './api';
import { warmBackend } from './components/WarmUp.jsx';
import Login from './components/Login.jsx';
import Clients from './components/Clients.jsx';
import Pilots from './components/Pilots.jsx';
import Projects from './components/Projects.jsx';

warmBackend();

export default function App() {
  const [user, setUser] = useState(auth.user());
  const [section, setSection] = useState(pageStore.getSection);

  function logout() {
    auth.clear();
    setUser(null);
  }

  function switchSection(s) {
    setSection(s);
    pageStore.setSection(s);
  }

  if (!user) return <Login onLogin={setUser} />;

  const nav = [
    { id: 'projects', label: 'Projects' },
    { id: 'clients', label: 'Clients' },
    { id: 'pilots', label: 'Pilots' },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.png" alt="" style={{ height: 24, marginRight: 8, verticalAlign: 'middle', borderRadius: 4 }} />
          प्रतिबिम्ब <span className="muted">· Admin</span>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={section === n.id ? 'nav active' : 'nav'}
              onClick={() => switchSection(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <button className="logout" onClick={logout}>Logout</button>
      </aside>

      <main className="main">
        {section === 'projects' && <Projects />}
        {section === 'clients' && <Clients />}
        {section === 'pilots' && <Pilots />}
      </main>
    </div>
  );
}
