import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ClipboardList,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useData } from "./hooks";
import { label } from "./api";
import { OperationsMap } from "./operations-map";
const statusOptions = [
  "SUBMITTED",
  "NEEDS_VERIFICATION",
  "ACKNOWLEDGED",
  "DISPATCHED",
  "TEAM_EN_ROUTE",
  "TEAM_ON_SCENE",
  "RESOLVED",
  "CANCELLED",
  "DUPLICATE",
  "UNABLE_TO_RESPOND",
  "REOPENED",
];
function Badge({ value }: { value: string }) {
  return <span className={`badge ${value.toLowerCase()}`}>{label(value)}</span>;
}
function TeamSnapshot() {
  const teams = useData("/teams", 10000);
  return (
    <section className="panel team-snapshot">
      <div className="section-heading">
        <h2>Your response unit</h2>
        <Link to="/teams">
          Duty & equipment <ArrowUpRight size={16} />
        </Link>
      </div>
      {teams.error && <p role="alert">{teams.error}</p>}
      {teams.data?.items.map((t: any) => (
        <div className="team-summary" key={t.id}>
          <div>
            <strong>{t.name}</strong>
            <p>
              {t.department} · {t.vehicle || "No vehicle recorded"}
            </p>
            <span className="muted">
              Capabilities: {t.capabilities.join(", ") || "None recorded"} ·
              Concurrent capacity: {t.capacity} · Active members:{" "}
              {t.active_members} · Current assignments: {t.active_assignments}
            </span>
          </div>
          <Badge value={t.availability} />
        </div>
      ))}
      {teams.data && !teams.data.items.length && (
        <p>No team membership is configured. Contact an administrator.</p>
      )}
      <p className="muted">
        Accepting an offer does not authorize dispatch. Start duty and share a
        fresh location from Teams & resources.
      </p>
    </section>
  );
}
function AdminSnapshot() {
  const health = useData("/admin/health", 10000);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Service oversight</h2>
        <Link to="/admin">
          Manage system <ArrowUpRight size={16} />
        </Link>
      </div>
      {health.error ? (
        <p role="alert">{health.error}</p>
      ) : health.data ? (
        <div className="integration-grid">
          <div>
            <span>Database</span>
            <strong>{health.data.database}</strong>
          </div>
          <div>
            <span>Identity</span>
            <strong>{health.data.authentication}</strong>
          </div>
          <div>
            <span>Pending events</span>
            <strong>{health.data.outboxPending}</strong>
          </div>
          <div>
            <span>Notification problems</span>
            <strong>{health.data.notificationProblems}</strong>
          </div>
          <div>
            <span>Evidence / maps</span>
            <strong>
              {health.data.evidenceConfigured ? "Configured" : "Not configured"}{" "}
              / {health.data.mapsConfigured ? "Configured" : "Not configured"}
            </strong>
          </div>
          <div>
            <span>Delivery transport</span>
            <strong>{health.data.notificationTransport}</strong>
          </div>
        </div>
      ) : (
        <p role="status">Checking application status…</p>
      )}
      <p className="muted">
        Configured providers require live acceptance checks. Provider
        credentials are managed outside this interface.
      </p>
    </section>
  );
}
export function OperationalDashboard({
  role,
  queueOnly = false,
}: {
  role: string;
  queueOnly?: boolean;
}) {
  const citizen = role === "CITIZEN",
    rescuer = role === "RESCUER";
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState("");
  const query = new URLSearchParams(filters).toString();
  const reports = useData(
      `/incidents?${query}&limit=20&offset=${offset}`,
      5000,
    ),
    summary = useData(`/incidents/summary?${query}`, 5000),
    activity = useData(`/incidents/activity?${query}`, 10000),
    catalog = useData("/catalog");
  const change = (name: string, value: string) => {
    setOffset(0);
    setSelected("");
    setFilters((old) => {
      const next = { ...old };
      if (value) next[name] = value;
      else delete next[name];
      return next;
    });
  };
  const items = reports.data?.items ?? [],
    current = items.find((i: any) => i.id === selected);
  const title = queueOnly
    ? citizen
      ? "My reports"
      : rescuer
        ? "Assignment history"
        : "Incident command queue"
    : citizen
      ? "My reports and assistance"
      : rescuer
        ? "Responder workspace"
        : role === "ADMIN"
          ? "Administration overview"
          : "Operations overview";
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">
            {citizen
              ? "Citizen services"
              : rescuer
                ? "Field response"
                : "Emergency coordination"}
          </div>
          <h1>{title}</h1>
          <p>
            {citizen
              ? "Submit a report and follow each response update."
              : rescuer
                ? "Review your assignments, availability and operational next steps."
                : "Prioritize incoming incidents and coordinate your authorized response area."}
          </p>
        </div>
        <div className="button-row">
          {citizen && (
            <Link className="button primary" to="/report?kind=EMERGENCY">
              <Plus size={18} />
              Need help
            </Link>
          )}
          <button
            aria-label="Refresh dashboard"
            onClick={() => {
              void reports.reload();
              void summary.reload();
              void activity.reload();
            }}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </header>
      {!queueOnly && citizen && (
        <div className="citizen-actions">
          <Link to="/report?kind=EMERGENCY" className="action-card emergency">
            <AlertTriangle />
            <div>
              <h2>Request emergency assistance</h2>
              <p>Report the situation and where help is needed.</p>
            </div>
            <ArrowUpRight />
          </Link>
          <Link to="/report?kind=REPORT" className="action-card">
            <MapPin />
            <div>
              <h2>Report a problem</h2>
              <p>Share a hazard or incident for review.</p>
            </div>
            <ArrowUpRight />
          </Link>
        </div>
      )}
      {!queueOnly && rescuer && <TeamSnapshot />}
      {!queueOnly && role === "ADMIN" && <AdminSnapshot />}
      <div className="ops-stats" aria-label="Incident summary">
        {[
          ["active", "Active incidents"],
          ["critical", "Critical / active"],
          ["unassigned", "Unassigned / active"],
          ["resolved", "Resolved"],
        ].map(([key, name]) => (
          <div className={`ops-stat ${key}`} key={key}>
            <span>{name}</span>
            <strong>{summary.data?.[key] ?? "—"}</strong>
            <small>In your authorized scope</small>
          </div>
        ))}
      </div>
      {(reports.error || summary.error) && (
        <div role="alert" className="notice error">
          {reports.error || summary.error}{" "}
          <button
            onClick={() => {
              void reports.reload();
              void summary.reload();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {!citizen &&
        (summary.data?.critical_unassigned > 0 ||
          summary.data?.overdue > 0) && (
          <div className="attention-bar">
            <AlertTriangle />
            <span>
              <strong>Coordinator attention</strong> ·{" "}
              {summary.data.critical_unassigned} unassigned critical ·{" "}
              {summary.data.overdue} scheduled responses overdue
            </span>
            <button onClick={() => change("view", "overdue")}>
              Review overdue
            </button>
          </div>
        )}
      <section className="panel queue-controls" aria-label="Incident filters">
        <form
          className="search-field"
          onSubmit={(e) => {
            e.preventDefault();
            change("q", search);
          }}
        >
          <Search size={18} />
          <input
            aria-label="Search incident ID or location"
            placeholder="Search incident ID or location"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button>Search</button>
        </form>
        <div className="ops-filters">
          <label>
            Category
            <select
              aria-label="Category"
              value={filters.category ?? ""}
              onChange={(e) => change("category", e.target.value)}
            >
              <option value="">All categories</option>
              {catalog.data?.categories.map((c: any) => (
                <option value={c.code} key={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Severity
            <select
              aria-label="Severity"
              value={filters.severity ?? ""}
              onChange={(e) => change("severity", e.target.value)}
            >
              <option value="">All severities</option>
              {["CRITICAL", "HIGH", "MODERATE", "LOW"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Status"
              value={filters.status ?? ""}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          {!citizen && (
            <label>
              Department
              <select
                aria-label="Department"
                value={filters.department ?? ""}
                onChange={(e) => change("department", e.target.value)}
              >
                <option value="">All authorized</option>
                {catalog.data?.departments.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Reported
            <select
              aria-label="Reported"
              value={filters.hours ?? ""}
              onChange={(e) => change("hours", e.target.value)}
            >
              <option value="">Any time</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
              <option value="720">Last 30 days</option>
            </select>
          </label>
          <label>
            Order
            <select
              aria-label="Order"
              value={filters.sort ?? "priority"}
              onChange={(e) => change("sort", e.target.value)}
            >
              <option value="priority">Priority first</option>
              <option value="recent">Newest first</option>
            </select>
          </label>
        </div>
        <div className="filter-row">
          {[
            ["", "All incidents"],
            ["active", "Active"],
            ["unassigned", "Unassigned"],
            ["overdue", "Overdue"],
          ].map(([v, t]) => (
            <button
              key={t}
              className={(filters.view ?? "") === v ? "selected" : ""}
              onClick={() => change("view", v)}
            >
              {t}
            </button>
          ))}
          <button
            onClick={() => {
              setFilters({});
              setSearch("");
              setOffset(0);
            }}
          >
            Clear filters
          </button>
        </div>
      </section>
      <div className={citizen ? "" : "operations-layout"}>
        <section className="panel queue-panel">
          <div className="section-heading">
            <h2>{rescuer ? "Assigned incidents" : "Incident queue"}</h2>
            <span className="muted">
              {reports.data ? `${reports.data.total} matching` : "Loading…"}
            </span>
          </div>
          {!reports.data && !reports.error && (
            <p role="status">Loading authorized reports…</p>
          )}
          {reports.data && !items.length && (
            <div className="empty">
              <ClipboardList />
              <h3>No matching incidents</h3>
              <p>
                {citizen
                  ? "Your submitted reports will appear here."
                  : "New incidents in your scope will appear automatically."}{" "}
                Try clearing filters.
              </p>
              {citizen && <Link to="/report">Create a report</Link>}
            </div>
          )}
          <div className="operational-queue">
            {items.map((i: any) => (
              <article
                className={`queue-item ${selected === i.id ? "is-selected" : ""}`}
                key={i.id}
              >
                <div className="queue-item-head">
                  <Link to={`/incidents/${i.id}`}>
                    <strong>{i.label}</strong>
                    <small>#{i.id.slice(0, 8)}</small>
                  </Link>
                  <Badge value={i.severity} />
                </div>
                <p>
                  <MapPin size={14} />
                  {i.address ||
                    `${Number(i.latitude).toFixed(4)}, ${Number(i.longitude).toFixed(4)}`}
                </p>
                <div className="queue-meta">
                  <Badge value={i.status} />
                  {i.overdue && (
                    <span className="badge high">Overdue review</span>
                  )}
                  <time dateTime={i.created_at}>
                    {new Date(i.created_at).toLocaleString()}
                  </time>
                </div>
                <div className="queue-footer">
                  <span>
                    {i.assigned_teams
                      .map((t: any) => `${t.name} · ${label(t.status)}`)
                      .join(", ") || "No active team assignment"}
                  </span>
                  <div>
                    {!citizen && (
                      <button
                        aria-label={`Locate incident ${i.id.slice(0, 8)}`}
                        onClick={() => setSelected(i.id)}
                      >
                        <MapPin size={16} />
                      </button>
                    )}
                    <Link to={`/incidents/${i.id}`} className="button">
                      Open <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {reports.data?.total > 20 && (
            <div className="pagination">
              <button
                disabled={offset === 0}
                onClick={() => setOffset((n) => n - 20)}
              >
                Previous
              </button>
              <span>
                {offset + 1}–{Math.min(offset + 20, reports.data.total)} of{" "}
                {reports.data.total}
              </span>
              <button
                disabled={offset + 20 >= reports.data.total}
                onClick={() => setOffset((n) => n + 20)}
              >
                Next
              </button>
            </div>
          )}
          <p className="refresh-caption">
            {reports.data
              ? `Last fetched ${new Date(reports.data.asOf).toLocaleTimeString()} · refreshes every 5 seconds`
              : "Waiting for the backend"}
            . Counts include all matching reports; map shows this page.
          </p>
        </section>
        {!citizen && (
          <div className="map-column">
            <OperationsMap
              items={items}
              selected={selected}
              onSelect={setSelected}
            />
            {current && (
              <section className="panel selected-incident">
                <strong>
                  {current.label} · #{current.id.slice(0, 8)}
                </strong>
                <p>
                  {current.address || "Coordinates recorded"} ·{" "}
                  {label(current.status)}
                </p>
                <Link to={`/incidents/${current.id}`}>
                  Open incident and dispatch actions <ArrowUpRight size={16} />
                </Link>
              </section>
            )}
            <section className="panel activity-panel">
              <h2>
                <Activity size={18} /> Recent activity
              </h2>
              {activity.error && <p role="alert">{activity.error}</p>}
              {activity.data?.items.length ? (
                <ol className="timeline">
                  {activity.data.items.map((a: any) => (
                    <li key={a.id}>
                      <Link to={`/incidents/${a.incident_id}`}>
                        {label(a.category)} · {label(a.to_status)}
                      </Link>
                      <small>
                        #{a.incident_id.slice(0, 8)} ·{" "}
                        {new Date(a.created_at).toLocaleString()}
                      </small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No status changes in this view yet.</p>
              )}
            </section>
          </div>
        )}
      </div>
      {citizen && (
        <div className="notice">
          <ShieldCheck size={20} />
          Submitting a report does not guarantee dispatch. For immediate danger,
          contact your verified local emergency number.
        </div>
      )}
    </>
  );
}
