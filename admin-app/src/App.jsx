import { useEffect, useState } from 'react';
import { auth, pageStore } from './api';
import { warmBackend } from './components/WarmUp.jsx';
import Login from './components/Login.jsx';
import Clients from './components/Clients.jsx';
import Pilots from './components/Pilots.jsx';
import Projects from './components/Projects.jsx';
import { socket } from './socket';

// Kick off a silent background ping so the free Render server wakes up
// before the admin submits their credentials.
warmBackend();

export default function App() {
  const [user, setUser] = useState(auth.user());
  const [section, setSection] = useState(pageStore.getSection);

  useEffect(() => {
    if (!user) {
      socket.disconnect();
      return;
    }
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [user]);

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
          <span className="logo">◢</span> प्रतिविम्ब <span className="muted">· Admin</span>
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
