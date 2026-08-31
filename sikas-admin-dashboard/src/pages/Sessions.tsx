import { useEffect, useState, useCallback } from "react";
import { admin, type SessionRow } from "../lib/api";
import { relativeTime, absoluteTime, describeAgent } from "../lib/format";

export function Sessions() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  const currentId = sessionStorage.getItem("sikas_session_id");

  const load = useCallback(async () => {
    try {
      const d = await admin.sessions();
      setSessions(d.sessions);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(id: string) {
    setRevoking(id);
    try {
      await admin.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke session");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Your active sessions</h2>
      </div>

      {error && <div className="alert alert-error" style={{ margin: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-block"><span className="spinner" /> Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="empty">No active sessions.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>IP</th>
                <th>MFA</th>
                <th>Last active</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const isCurrent = s.id === currentId;
                return (
                  <tr key={s.id}>
                    <td>
                      {describeAgent(s.user_agent)}
                      {isCurrent && (
                        <span className="pill pill-neutral" style={{ marginLeft: 8 }}>
                          this device
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>{s.ip_address || "—"}</td>
                    <td>
                      <span className={`pill ${s.is_mfa_verified ? "pill-ok" : "pill-neutral"}`}>
                        {s.is_mfa_verified ? "verified" : "pending"}
                      </span>
                    </td>
                    <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                      {relativeTime(s.last_activity_at)}
                    </td>
                    <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>
                      {absoluteTime(s.expires_at)}
                    </td>
                    <td className="row-actions">
                      <button disabled={revoking === s.id} onClick={() => revoke(s.id)}>
                        {revoking === s.id ? "…" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
