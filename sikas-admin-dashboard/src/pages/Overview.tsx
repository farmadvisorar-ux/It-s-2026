import { useEffect, useState } from "react";
import { admin, type Stats, type ActivityDay, type AuditEvent } from "../lib/api";
import { ActivityChart } from "../components/Chart";
import { relativeTime, actionLabel } from "../lib/format";

export function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [recent, setRecent] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [s, a, l] = await Promise.all([
          admin.stats(),
          admin.activity(),
          admin.auditLog({ limit: 8 }),
        ]);
        if (!live) return;
        setStats(s.stats);
        setActivity(a.activity);
        setRecent(l.events);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "Could not load");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (loading) return <div className="loading-block"><span className="spinner" /> Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const twoFaGap = stats ? stats.active_admins - stats.admins_with_2fa : 0;

  return (
    <>
      <div className="stat-grid">
        <Stat label="Active admins" value={stats?.active_admins ?? 0} />
        <Stat
          label="With 2FA"
          value={stats?.admins_with_2fa ?? 0}
          note={twoFaGap > 0 ? `${twoFaGap} without` : "full coverage"}
          tone={twoFaGap > 0 ? "crit" : "ok"}
        />
        <Stat label="Live sessions" value={stats?.active_sessions ?? 0} />
        <Stat label="Sign-ins, 7d" value={stats?.logins_7d ?? 0} />
        <Stat label="Events, 24h" value={stats?.events_24h ?? 0} />
        <Stat
          label="Failures, 24h"
          value={stats?.failures_24h ?? 0}
          tone={(stats?.failures_24h ?? 0) > 0 ? "crit" : "ok"}
        />
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head">
            <h2>Authentication events — 14 days</h2>
          </div>
          <div className="card-body">
            <ActivityChart data={activity} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Latest activity</h2>
          </div>
          {recent.length === 0 ? (
            <div className="empty">No events recorded yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {recent.map((e) => (
                    <tr key={e.id}>
                      <td>{actionLabel(e.action)}</td>
                      <td>
                        <span className={`pill ${e.status === "success" ? "pill-ok" : "pill-crit"}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="mono" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {relativeTime(e.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "ok" | "crit";
}) {
  return (
    <div className={`stat ${tone ? `is-${tone}` : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value.toLocaleString()}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}
