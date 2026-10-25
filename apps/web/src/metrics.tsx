import { useState } from "react";
import { useData } from "./hooks";
import { label } from "./api";
export function OperationalMetrics() {
  const [days, setDays] = useState(30);
  const { data, error, reload } = useData(`/metrics/operations?days=${days}`);
  const duration = (v: number | null) =>
    v == null ? "No observations" : `${Math.round(v / 60)} min`;
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Operational metrics</h1>
          <p>
            Observed records within your authorized department and jurisdiction.
          </p>
        </div>
        <button onClick={() => void reload()}>Refresh metrics</button>
      </header>
      <label>
        Reporting period
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data ? (
        <>
          <section className="panel">
            <h2>Incident outcomes</h2>
            <div className="two-columns">
              {["reported", "open", "resolved", "escalated"].map((k) => (
                <p key={k}>
                  {label(k)}: <strong>{data.summary[k]}</strong>
                </p>
              ))}
            </div>
            <h3>Average time from the current response cycle</h3>
            <p>
              Only incidents with recorded milestones contribute. Reopened
              incidents start a new cycle; missing milestones are not counted as
              zero.
            </p>
            {[
              "acknowledgement_seconds",
              "dispatch_seconds",
              "arrival_seconds",
              "resolution_seconds",
            ].map((k) => (
              <p key={k}>
                {label(k.replace("_seconds", ""))}:{" "}
                <strong>{duration(data.summary[k])}</strong>
              </p>
            ))}
            <p>
              {data.summary.acknowledged_samples} acknowledgement observations ·{" "}
              {data.summary.arrival_samples} arrival observations
            </p>
            <h3>Categories</h3>
            {data.categories.map((c: any) => (
              <p key={c.label}>
                {c.label}: {c.count}
              </p>
            ))}
          </section>
          <section className="panel table-wrap">
            <h2>Team workload</h2>
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Duty</th>
                  <th>Active / capacity</th>
                  <th>Completed in period</th>
                </tr>
              </thead>
              <tbody>
                {data.teams.map((t: any) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{label(t.availability)}</td>
                    <td>
                      {t.active_assignments} / {t.capacity}
                    </td>
                    <td>{t.completed_assignments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel table-wrap">
            <h2>Current resource utilization</h2>
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Status</th>
                  <th>Allocated / total</th>
                </tr>
              </thead>
              <tbody>
                {data.resources.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{label(r.status)}</td>
                    <td>
                      {r.allocated} / {r.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <small>Updated {new Date(data.asOf).toLocaleString()}</small>
        </>
      ) : (
        !error && <p>Loading metrics…</p>
      )}
    </>
  );
}
