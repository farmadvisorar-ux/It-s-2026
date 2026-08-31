import { useEffect, useState } from "react";
import { admin, ApiRequestError, type AdminUser } from "../lib/api";
import { relativeTime, absoluteTime } from "../lib/format";

export function Admins() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let live = true;
    admin
      .users()
      .then((d) => live && setUsers(d.users))
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiRequestError && err.status === 403) setForbidden(true);
        else setError(err.message);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  if (forbidden) {
    return (
      <div className="card">
        <div className="card-head"><h2>Admins</h2></div>
        <div className="empty">
          Only owners and platform admins can view the admin roster.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Admin accounts</h2>
      </div>

      {error && <div className="alert alert-error" style={{ margin: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-block"><span className="spinner" /> Loading…</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>2FA</th>
                <th>Sessions</th>
                <th>Last sign-in</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td><span className="pill pill-neutral">{u.role.replace(/_/g, " ")}</span></td>
                  <td>
                    <span className={`pill ${u.status === "active" ? "pill-ok" : "pill-crit"}`}>
                      {u.status}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${u.totp_verified ? "pill-ok" : "pill-crit"}`}>
                      {u.totp_verified ? "enrolled" : "not set up"}
                    </span>
                  </td>
                  <td className="mono">{u.active_sessions ?? 0}</td>
                  <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                    {relativeTime(u.last_login_at)}
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>
                    {u.created_at ? absoluteTime(u.created_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
