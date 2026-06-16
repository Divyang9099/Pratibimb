import { useState } from 'react';
import { auth, pageStore } from './api';
import { warmBackend } from './components/WarmUp.jsx';
import Login from './components/Login.jsx';
import Clients from './components/Clients.jsx';
import Pilots from './components/Pilots.jsx';
import Projects from './components/Projects.jsx';

warmBackend();

const nav = [
  { id: 'projects', label: 'Projects' },
  { id: 'clients', label: 'Clients' },
  { id: 'pilots', label: 'Pilots' },
];

export default function App() {
  const [user, setUser] = useState(auth.user());
  const [section, setSection] = useState(pageStore.getSection);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function logout() {
    auth.clear();
    setUser(null);
  }

  function switchSection(s) {
    setSection(s);
    pageStore.setSection(s);
    setSidebarOpen(false);
  }

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="shell">
      {/* Sidebar drawer */}
      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <img src="/logo.png" alt="" className="logo-img" />
            प्रतिबिम्ब: <span className="muted">· Admin</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>
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

      {/* Backdrop for mobile */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* Main content area */}
      <div className="main-wrap">
        {/* Top navbar (visible on mobile, hidden on desktop where sidebar is always visible) */}
        <header className="admin-topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <span /><span /><span />
          </button>
          <div className="brand admin-topbar-brand">
            <img src="/logo.png" alt="" className="logo-img" />
            प्रतिबिम्ब:
          </div>
          <div className="admin-topbar-section">{nav.find(n => n.id === section)?.label}</div>
        </header>

        <main className="main">
          {section === 'projects' && <Projects />}
          {section === 'clients' && <Clients />}
          {section === 'pilots' && <Pilots />}
        </main>
      </div>
    </div>
  );
}
