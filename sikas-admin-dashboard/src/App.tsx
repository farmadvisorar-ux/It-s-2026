import { useEffect, useState } from "react";
import { auth, tokens, type AdminUser } from "./lib/api";
import { Login, ThemeToggle } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { AuditLog } from "./pages/AuditLog";
import { Sessions } from "./pages/Sessions";
import { Admins } from "./pages/Admins";

type Tab = "overview" | "audit" | "sessions" | "admins";

const TABS: { id: Tab; label: string; title: string }[] = [
  { id: "overview", label: "Overview", title: "Overview" },
  { id: "audit", label: "Audit log", title: "Audit log" },
  { id: "sessions", label: "Sessions", title: "Sessions" },
  { id: "admins", label: "Admins", title: "Admin accounts" },
];

export default function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  // Resume an existing session on reload rather than forcing a fresh sign-in.
  useEffect(() => {
    if (!tokens.access) {
      setChecking(false);
      return;
    }
    auth
      .me()
      .then((d) => setUser(d.user))
      .catch(() => tokens.clear())
      .finally(() => setChecking(false));
  }, []);

  async function signOut() {
    const sid = sessionStorage.getItem("sikas_session_id");
    if (sid) await auth.logout(sid).catch(() => {});
    tokens.clear();
    sessionStorage.removeItem("sikas_session_id");
    setUser(null);
  }

  if (checking) {
    return (
      <div className="auth-shell">
        <span className="spinner" />
      </div>
    );
  }

  if (!user) return <Login onSignedIn={setUser} />;

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-mark">
          Sik<span>Ads</span>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="who">{user.email}</div>
          <div>{user.role.replace(/_/g, " ")}</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{current.title}</h1>
          <div className="topbar-actions">
            <ThemeToggle />
            <button className="btn btn-quiet" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">
          {tab === "overview" && <Overview />}
          {tab === "audit" && <AuditLog />}
          {tab === "sessions" && <Sessions />}
          {tab === "admins" && <Admins />}
        </main>
      </div>
    </div>
  );
}
