import { useEffect, useState } from "react";
import { admin, type AuditEvent } from "../lib/api";
import { absoluteTime, actionLabel } from "../lib/format";

const PAGE = 25;

export function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<"" | "success" | "failure">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    admin
      .auditLog({ limit: PAGE, offset, status: filter || undefined })
      .then((d) => {
        if (!live) return;
        setEvents(d.events);
        setTotal(d.total);
        setError("");
      })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [offset, filter]);

  function changeFilter(next: "" | "success" | "failure") {
    setFilter(next);
    setOffset(0); // a new filter means a new result set; page 1 is the only safe page
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Audit log</h2>
        <div className="filters">
          <button aria-pressed={filter === ""} onClick={() => changeFilter("")}>
            All
          </button>
          <button aria-pressed={filter === "success"} onClick={() => changeFilter("success")}>
            Succeeded
          </button>
          <button aria-pressed={filter === "failure"} onClick={() => changeFilter("failure")}>
            Failed
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ margin: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-block"><span className="spinner" /> Loading…</div>
      ) : events.length === 0 ? (
        <div className="empty">No events match this filter.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Result</th>
                <th>Admin</th>
                <th>IP</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                    {absoluteTime(e.created_at)}
                  </td>
                  <td>{actionLabel(e.action)}</td>
                  <td>
                    <span className={`pill ${e.status === "success" ? "pill-ok" : "pill-crit"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td>{e.admin_email || <span style={{ color: "var(--muted)" }}>unknown</span>}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{e.ip_address || "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{e.error_msg || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pager">
        <span className="mono">
          {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + PAGE, total)}`} of {total}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Previous
          </button>
          <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            Next
          </button>
        </span>
      </div>
    </div>
  );
}
