import React, {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useRef,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ShieldCheck,
  ArrowUpRight,
  MapPin,
  Radio,
  Plus,
  Activity,
  Bell,
  LayoutDashboard,
  ClipboardList,
  Users,
  Settings,
  ChevronRight,
  LocateFixed,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Navigation,
  LogOut,
  RefreshCw,
} from "lucide-react";
import type * as MapLibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api, post, setCsrf, label } from "./api";
import { etaLabel } from "../../../packages/core/src/domain";
import "./styles.css";
import { useData } from "./hooks";
import {
  ManagementPanels,
  ResourceConsole,
  EvidenceList,
  AccountScopeForm,
} from "./management";
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  department_id: string;
  permissions: string[];
};
const Session = createContext<{
  user: User | null;
  refresh: () => Promise<void>;
  mode: string;
}>({ user: null, refresh: async () => {}, mode: "" });
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="notice error">
      <AlertTriangle size={18} />
      {message}
    </div>
  ) : null;
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <ClipboardList size={30} />
      <p>{children}</p>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value?.toLowerCase()}`}>{label(value)}</span>
  );
}
function PageHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <div className="eyebrow">{eyebrow ?? "Response coordination"}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </header>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState(""),
    [online, setOnline] = useState(navigator.onLine);
  const refresh = useCallback(async () => {
    try {
      const result = await api("/auth/me");
      setUser(result.user);
      setCsrf(result.csrf);
    } catch {
      setUser(null);
      setCsrf("");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void api("/auth/config").then((c) => setMode(c.mode));
    void refresh();
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, [refresh]);
  if (loading) return <div className="loading">Connecting to Response…</div>;
  return (
    <Session.Provider value={{ user, refresh, mode }}>
      {!online && (
        <div role="alert" className="offline">
          You are offline. Requests cannot be submitted. Use an available
          emergency calling service.
        </div>
      )}
      {mode === "demo" && (
        <div className="demo-banner">
          DEVELOPMENT ENVIRONMENT{" "}
          <span>
            Demonstration accounts · No connection to official emergency
            services
          </span>
        </div>
      )}
      {!user ? <Landing /> : <Shell />}
    </Session.Provider>
  );
}
function Landing() {
  const { mode, refresh } = useContext(Session),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function demo(email: string) {
    setBusy(true);
    try {
      await post("/auth/demo", { email });
      await refresh();
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="landing">
      <div className="brand">
        <ShieldCheck />
        <span>
          response<span className="brand-dot">.</span>
        </span>
      </div>
      <section>
        <div className="eyebrow">
          Prepared together. Connected when it matters.
        </div>
        <h1>
          A clearer path
          <br />
          from help to response.
        </h1>
        <p>
          Report an emergency, coordinate the right teams, and keep the people
          who need help informed.
        </p>
        <div className="landing-actions">
          <a className="button primary" href="/api/v1/auth/login">
            Sign in / Register <ArrowUpRight size={18} />
          </a>
          <span>One secure sign-in for every role</span>
        </div>
        <div className="notice">
          <ShieldCheck size={20} />
          This platform supports coordination. A submitted request does not
          guarantee that emergency services have accepted it. For immediate
          danger, contact your verified local emergency number.
        </div>
        <ErrorBox message={error} />
        {mode === "demo" && (
          <div className="demo-login">
            <h2>Explore the local demonstration</h2>
            <p>
              These isolated sample accounts do not use Cognito or send SMS.
            </p>
            <div className="button-row">
              {["citizen", "authority", "rescuer", "admin"].map((role) => (
                <button
                  disabled={busy}
                  key={role}
                  onClick={() => demo(`${role}@demo.invalid`)}
                >
                  Demo {label(role)} <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <aside className="landing-art">
        <div className="radar">
          <div />
          <div />
          <ShieldCheck size={58} />
        </div>
        <span>REPORT → COORDINATE → RESPOND</span>
        <h2>
          Every update.
          <br />A shared understanding.
        </h2>
        <p>
          Clear status. Authorized tracking.
          <br />
          Accountable decisions.
        </p>
      </aside>
      <footer>Cloud-Enabled Disaster Response and Management System</footer>
    </div>
  );
}
function Shell() {
  const { user } = useContext(Session);
  const citizen = user!.role === "CITIZEN";
  const links: [string, string, React.ReactNode][] = [
    ["/", "Overview", <LayoutDashboard size={19} />],
    [
      "/reports",
      citizen ? "My reports" : "Incident inbox",
      <ClipboardList size={19} />,
    ],
    ["/announcements", "Announcements", <Bell size={19} />],
    ["/situation", "Local situation", <MapPin size={19} />],
  ];
  if (!citizen)
    links.push(["/teams", "Teams & resources", <Users size={19} />]);
  if (user!.role === "ADMIN")
    links.push(["/admin", "Administration", <Settings size={19} />]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <ShieldCheck />
          <span>
            response<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">{label(user!.role)} workspace</div>
        <nav>
          {links.map(([to, title, icon]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {icon}
              {title}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-note">
            <ShieldCheck size={20} />
            <p>
              Coordination with care.
              <br />
              <span>Every action is accountable.</span>
            </p>
          </div>
          <NavLink to="/profile" className="profile-link">
            <span className="avatar">{user!.name[0]}</span>
            <span>
              {user!.name.split(" — ")[0]}
              <small>Profile & settings</small>
            </span>
            <ChevronRight size={16} />
          </NavLink>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <span className="workspace-path">
            RESPONSE / <strong>{label(user!.role)}</strong>
          </span>
          <Link
            to="/notifications"
            className="icon-button"
            aria-label="Notifications"
          >
            <Bell size={20} />
          </Link>
        </div>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/report" element={<ReportForm />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/situation" element={<Situation />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route
              path="*"
              element={
                <Empty>
                  Page not found. <Link to="/">Return home</Link>
                </Empty>
              }
            />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>Cloud-enabled disaster coordination</span>
          <span>Submission ≠ acceptance ≠ dispatch ≠ arrival</span>
        </footer>
      </div>
    </div>
  );
}
function Dashboard() {
  const { user } = useContext(Session),
    { data, error } = useData("/incidents");
  const citizen = user!.role === "CITIZEN";
  const alerts = useData("/announcements");
  const active =
    data?.items.filter(
      (i: any) => !["RESOLVED", "CANCELLED", "DUPLICATE"].includes(i.status),
    ).length ?? 0;
  return (
    <>
      <PageHead
        eyebrow="Connected communities. Coordinated response."
        title={citizen ? "Help starts here." : "A clear view of the response."}
        description={
          citizen
            ? "Report what’s happening. Stay informed. Get the next update."
            : "Review incoming incidents and coordinate accountable action."
        }
      >
        <span className="date-pill">
          {new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </PageHead>
      <ErrorBox message={error} />
      {citizen ? (
        <div className="action-grid">
          <Link to="/report?kind=EMERGENCY" className="emergency-action">
            <div>
              <span className="action-icon">
                <Plus size={30} />
              </span>
              <ArrowUpRight />
            </div>
            <span className="eyebrow">When you need assistance</span>
            <h2>Need help</h2>
            <p>Send an emergency request with your location.</p>
            <span className="action-link">
              Request assistance <ChevronRight size={17} />
            </span>
          </Link>
          <Link to="/report?kind=REPORT" className="report-action">
            <div>
              <span className="action-icon">
                <MapPin size={28} />
              </span>
              <ArrowUpRight />
            </div>
            <span className="eyebrow">Keep your community informed</span>
            <h2>Report a problem</h2>
            <p>Share an incident or hazard in your area.</p>
            <span className="action-link">
              Create a report <ChevronRight size={17} />
            </span>
          </Link>
        </div>
      ) : (
        <div className="stats">
          <Stat name="Visible incidents" value={data?.items.length ?? "—"} />
          <Stat name="Active in this view" value={active} />
          <Stat
            name="Awaiting acknowledgement"
            value={
              data?.items.filter((i: any) => i.status === "SUBMITTED").length ??
              "—"
            }
          />
        </div>
      )}
      <EmergencyFallback />
      <div className="section-heading">
        <h2>{citizen ? "Your recent reports" : "Incident inbox"}</h2>
        <Link to="/reports">
          View all <ArrowUpRight size={15} />
        </Link>
      </div>
      <IncidentList items={data?.items.slice(0, 4)} loading={!data && !error} />
      <div className="two-columns">
        <Link className="secondary-card" to="/situation">
          <MapPin />
          <div>
            <h3>Local situation</h3>
            <p>Reviewed updates from your community.</p>
          </div>
          <ArrowUpRight />
        </Link>
        <Link className="secondary-card" to="/announcements">
          <Bell />
          <div>
            <h3>Official announcements</h3>
            <p>
              {alerts.data?.items.length ?? 0} current notices from platform
              authorities.
            </p>
          </div>
          <ArrowUpRight />
        </Link>
      </div>
    </>
  );
}
function Stat({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span>{name}</span>
      <strong>{value}</strong>
    </div>
  );
}
function EmergencyFallback() {
  const { data } = useData("/auth/config");
  return (
    <div className="fallback">
      <AlertTriangle size={19} />
      <p>
        <strong>In immediate danger?</strong>{" "}
        {data?.emergencyPhone ? (
          <a href={`tel:${data.emergencyPhone}`}>
            Call the configured emergency number: {data.emergencyPhone}
          </a>
        ) : (
          "Call your verified local emergency number."
        )}{" "}
        A platform request does not guarantee a response.
      </p>
    </div>
  );
}
function IncidentList({
  items,
  loading = false,
}: {
  items?: any[];
  loading?: boolean;
}) {
  if (loading) return <div className="empty">Loading reports…</div>;
  if (!items?.length)
    return (
      <Empty>
        No reports here yet. New reports and their status will appear here.
      </Empty>
    );
  return (
    <div className="incident-list">
      {items.map((i) => (
        <Link key={i.id} to={`/incidents/${i.id}`} className="incident-row">
          <div className={`incident-icon ${i.severity?.toLowerCase()}`}>
            <Activity size={21} />
          </div>
          <div className="incident-name">
            <strong>{i.label ?? label(i.category)}</strong>
            <span>
              #{i.id.slice(0, 8)} · {new Date(i.created_at).toLocaleString()}
            </span>
          </div>
          <Badge value={i.severity} />
          <Badge value={i.status} />
          <ChevronRight size={18} />
        </Link>
      ))}
    </div>
  );
}
function Reports() {
  const { data, error, reload } = useData("/incidents"),
    [filter, setFilter] = useState("ALL");
  return (
    <>
      <PageHead
        title="Incident reports"
        description="Submission, acknowledgement, dispatch and arrival are tracked separately."
      >
        <button onClick={reload}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </PageHead>
      <ErrorBox message={error} />
      <div className="filter-row">
        {["ALL", "SUBMITTED", "ACKNOWLEDGED", "DISPATCHED", "RESOLVED"].map(
          (f) => (
            <button
              className={f === filter ? "selected" : ""}
              key={f}
              onClick={() => setFilter(f)}
            >
              {label(f)}
            </button>
          ),
        )}
      </div>
      <IncidentList
        items={data?.items.filter(
          (i: any) => filter === "ALL" || i.status === filter,
        )}
        loading={!data && !error}
      />
      <p className="muted">Showing the latest 30 authorized reports.</p>
    </>
  );
}
function ReportForm() {
  const { user } = useContext(Session);
  const kind =
    new URLSearchParams(location.search).get("kind") === "REPORT"
      ? "REPORT"
      : "EMERGENCY";
  const { data } = useData("/catalog");
  const navigate = useNavigate();
  const [category, setCategory] = useState(""),
    [severity, setSeverity] = useState(
      kind === "EMERGENCY" ? "HIGH" : "MODERATE",
    ),
    [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState(""),
    [description, setDescription] = useState(""),
    [address, setAddress] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [gps, setGps] = useState(""),
    [file, setFile] = useState<File | null>(null);
  const submission = useRef({ body: "", key: crypto.randomUUID() });
  const manuallyCorrected = useRef(false);
  useEffect(() => {
    if (user?.role !== "CITIZEN" || !navigator.geolocation) return;
    let active = true;
    setGps("Finding your location… You can also enter coordinates manually.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active || manuallyCorrected.current) return;
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setGps(
          `Location captured · accuracy approximately ${Math.round(position.coords.accuracy)} m. Check and correct if needed.`,
        );
      },
      () => {
        if (active)
          setGps(
            "GPS unavailable or permission denied. Enter coordinates below.",
          );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
    return () => {
      active = false;
    };
  }, [user?.role]);
  if (user?.role !== "CITIZEN")
    return <Empty>Only citizen accounts can submit reports.</Empty>;
  function locate() {
    setGps("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLatitude(String(p.coords.latitude));
        setLongitude(String(p.coords.longitude));
        setGps(
          `Location captured · accuracy approximately ${Math.round(p.coords.accuracy)} m. Check and correct if needed.`,
        );
      },
      () =>
        setGps(
          "GPS unavailable or permission denied. Enter coordinates below.",
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        kind,
        category,
        severity,
        latitude: Number(latitude),
        longitude: Number(longitude),
        description,
        address,
      };
      const serialized = JSON.stringify(body);
      if (submission.current.body !== serialized)
        submission.current = { body: serialized, key: crypto.randomUUID() };
      const result = await post("/incidents", body, submission.current.key);
      if (file) {
        try {
          const { id, upload } = await post("/evidence/upload", {
            incidentId: result.id,
            contentType: file.type,
            size: file.size,
          });
          const form = new FormData();
          for (const [k, v] of Object.entries(upload.fields))
            form.append(k, v as string);
          form.append("file", file);
          const r = await fetch(upload.url, { method: "POST", body: form });
          if (!r.ok) throw new Error("Upload failed");
          const completion = await post(`/evidence/${id}/complete`);
          if (completion.status !== "AVAILABLE")
            throw new Error("File rejected");
        } catch {
          sessionStorage.setItem(
            `evidence-warning:${result.id}`,
            "Report saved, but the optional photo could not be attached.",
          );
        }
      }
      navigate(`/incidents/${result.id}?submitted=1`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Back to overview
      </Link>
      <PageHead
        title={
          kind === "EMERGENCY" ? "Request emergency help" : "Report a problem"
        }
        description="Your location and category help coordinators find the right response."
      />
      <EmergencyFallback />
      <form onSubmit={submit} className="report-form">
        <section className="panel">
          <div className="step-title">
            <span>01</span>
            <h2>What is happening?</h2>
          </div>
          <div className="category-grid">
            {data?.categories.map((c: any) => (
              <button
                type="button"
                key={c.code}
                className={category === c.code ? "selected" : ""}
                onClick={() => setCategory(c.code)}
              >
                <Activity size={18} />
                {c.label}
                {category === c.code && <CheckCircle2 size={16} />}
              </button>
            ))}
          </div>
          <input
            className="visually-hidden"
            aria-label="Selected category"
            required
            value={category}
            onChange={() => {}}
            tabIndex={-1}
          />
          <label>
            Reported severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="LOW">Low — no immediate danger reported</option>
              <option value="MODERATE">Moderate — assistance needed</option>
              <option value="HIGH">High — urgent potential harm</option>
              <option value="CRITICAL">
                Critical — immediate threat to life reported
              </option>
            </select>
          </label>
          <p className="muted">
            Your initial assessment will be reviewed by a coordinator.
          </p>
        </section>
        <section className="panel">
          <div className="step-title">
            <span>02</span>
            <h2>Where do you need help?</h2>
          </div>
          <button type="button" onClick={locate}>
            <LocateFixed size={18} />
            Use my current location
          </button>
          {gps && (
            <p role="status" className="muted">
              {gps}
            </p>
          )}
          <div className="two-columns">
            <label>
              Latitude
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                required
                value={latitude}
                onChange={(e) => {
                  manuallyCorrected.current = true;
                  setLatitude(e.target.value);
                }}
                placeholder="e.g. 19.0760"
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                required
                value={longitude}
                onChange={(e) => {
                  manuallyCorrected.current = true;
                  setLongitude(e.target.value);
                }}
                placeholder="e.g. 72.8777"
              />
            </label>
          </div>
          <label>
            Landmark or address <span>(optional)</span>
            <input
              value={address}
              maxLength={300}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Help responders find the exact place"
            />
          </label>
          <label>
            Brief description <span>(optional)</span>
            <textarea
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>
          <label>
            Photograph <span>(optional · JPEG/PNG, up to 5 MB)</span>
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > 5242880) {
                  setError("Photograph must be smaller than 5 MB");
                  setFile(null);
                } else setFile(f ?? null);
              }}
            />
          </label>
        </section>
        <ErrorBox message={error} />
        <div className="submit-bar">
          <p>
            We will confirm when your report is saved.
            <br />
            This does not mean a rescue team has been dispatched.
          </p>
          <button
            className={kind === "EMERGENCY" ? "critical" : "primary"}
            disabled={busy || !category}
          >
            {busy ? "Submitting…" : "Submit request"}
            <ArrowUpRight size={18} />
          </button>
        </div>
      </form>
    </>
  );
}
function IncidentDetail() {
  const { id } = useParams();
  const { user } = useContext(Session);
  const { data: i, error, reload } = useData(`/incidents/${id}`);
  const tracking = useData(`/locations/incidents/${id}`);
  const [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    [eligible, setEligible] = useState<any[]>([]),
    [team, setTeam] = useState(""),
    [live, setLive] = useState("Connecting");
  const dispatcher = ["ADMIN", "AUTHORITY"].includes(user!.role);
  useEffect(() => {
    const events = new EventSource(`/api/v1/incidents/${id}/events`, {
      withCredentials: true,
    });
    events.addEventListener("refresh", () => {
      setLive("Connected");
      void reload();
      void tracking.reload();
    });
    events.addEventListener("revoked", () => {
      setLive("Access revoked — sign in again");
      events.close();
    });
    events.onerror = () => setLive("Updates interrupted — retrying");
    return () => events.close();
  }, [id, reload, tracking.reload]);
  async function act(path: string, body: unknown) {
    setBusy(true);
    setActionError("");
    try {
      await post(path, body, crypto.randomUUID());
      await reload();
      await tracking.reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorBox message={error} />;
  if (!i) return <Empty>Loading incident…</Empty>;
  return (
    <>
      <Link to="/reports" className="back-link">
        <ArrowLeft size={16} />
        All reports
      </Link>
      <PageHead
        eyebrow={`Incident #${i.id.slice(0, 8)}`}
        title={label(i.category)}
        description={`Reported ${new Date(i.created_at).toLocaleString()} · ${i.kind.toLowerCase()}`}
      >
        <Badge value={i.status} />
      </PageHead>
      {location.search.includes("submitted") && (
        <div className="notice success">
          <CheckCircle2 size={20} />
          Your request is saved. Awaiting coordinator review; no response is
          guaranteed.
        </div>
      )}
      {sessionStorage.getItem(`evidence-warning:${id}`) && (
        <div className="notice">
          {sessionStorage.getItem(`evidence-warning:${id}`)}
        </div>
      )}
      <ErrorBox message={actionError} />
      <div className="detail-grid">
        <section>
          <div className="panel">
            <div className="section-heading">
              <h2>Incident details</h2>
              <Badge value={i.severity} />
            </div>
            <p>{i.description || "No additional description provided."}</p>
            <p className="location-line">
              <MapPin size={17} />
              {i.address ||
                `${Number(i.latitude).toFixed(5)}, ${Number(i.longitude).toFixed(5)}`}
            </p>
            <div className="notice">
              Coordination status: {label(i.escalation_state)}. Reported
              severity has not necessarily been professionally verified.
            </div>
            {dispatcher && (
              <div className="button-row">
                {["SUBMITTED", "REOPENED", "NEEDS_VERIFICATION"].includes(
                  i.status,
                ) && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      act(`/incidents/${id}/status`, { status: "ACKNOWLEDGED" })
                    }
                  >
                    Acknowledge
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => act(`/incidents/${id}/escalate`, {})}
                >
                  Escalate for review
                </button>
                {i.status === "SUBMITTED" && (
                  <button
                    onClick={() =>
                      act(`/incidents/${id}/status`, {
                        status: "NEEDS_VERIFICATION",
                      })
                    }
                  >
                    Needs verification
                  </button>
                )}
                {["SUBMITTED", "NEEDS_VERIFICATION"].includes(i.status) && (
                  <button
                    onClick={() =>
                      act(`/incidents/${id}/status`, {
                        status: "DUPLICATE",
                        note: "Dispatcher reviewed duplicate candidate",
                      })
                    }
                  >
                    Flag duplicate
                  </button>
                )}
                {[
                  "RESOLVED",
                  "DUPLICATE",
                  "CANCELLED",
                  "UNABLE_TO_RESPOND",
                ].includes(i.status) && (
                  <button
                    onClick={() =>
                      act(`/incidents/${id}/status`, { status: "REOPENED" })
                    }
                  >
                    Reopen
                  </button>
                )}
              </div>
            )}
            {user!.role === "CITIZEN" &&
              ["SUBMITTED", "NEEDS_VERIFICATION"].includes(i.status) && (
                <button
                  onClick={() =>
                    act(`/incidents/${id}/status`, { status: "CANCELLED" })
                  }
                >
                  Cancel my request
                </button>
              )}
          </div>
          <div className="panel">
            <div className="section-heading">
              <h2>Assigned response teams</h2>
              <Radio size={18} />
            </div>
            {!i.assignments.length && <Empty>No team assigned yet.</Empty>}
            {i.assignments.map((a: any) => (
              <div className="assignment" key={a.id}>
                <div>
                  <h3>{a.name}</h3>
                  <small>{a.department}</small>
                </div>
                <Badge value={a.status} />
                <div className="button-row">
                  {user!.role === "RESCUER" &&
                    (
                      {
                        OFFERED: ["ACCEPTED", "DECLINED"],
                        DISPATCHED: ["EN_ROUTE"],
                        EN_ROUTE: ["ARRIVED"],
                        ARRIVED: ["IN_PROGRESS"],
                        IN_PROGRESS: ["COMPLETED"],
                      } as Record<string, string[]>
                    )[a.status]?.map((s) => (
                      <button
                        key={s}
                        disabled={busy}
                        onClick={() =>
                          act(`/assignments/${a.id}/status`, { status: s })
                        }
                      >
                        {label(s)}
                      </button>
                    ))}
                  {dispatcher && a.status === "ACCEPTED" && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        act(`/assignments/${a.id}/status`, {
                          status: "DISPATCHED",
                        })
                      }
                    >
                      Authorize dispatch
                    </button>
                  )}
                  {dispatcher &&
                    ["OFFERED", "ACCEPTED", "DISPATCHED", "EN_ROUTE"].includes(
                      a.status,
                    ) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(`/assignments/${a.id}/status`, {
                            status: "CANCELLED",
                          })
                        }
                      >
                        Cancel assignment
                      </button>
                    )}
                </div>
              </div>
            ))}
            {dispatcher &&
              !["RESOLVED", "CANCELLED", "DUPLICATE"].includes(i.status) && (
                <div className="assignment-form">
                  <button
                    onClick={async () => {
                      try {
                        const r = await api(`/incidents/${id}/eligible-teams`);
                        setEligible(r.items);
                        if (!r.items.length)
                          setActionError(
                            "No eligible team within 25 km. Check duty, fresh location, capability and capacity.",
                          );
                      } catch (e) {
                        setActionError((e as Error).message);
                      }
                    }}
                  >
                    Find eligible teams
                  </button>
                  {eligible.length > 0 && (
                    <>
                      <select
                        aria-label="Eligible team"
                        value={team}
                        onChange={(e) => setTeam(e.target.value)}
                      >
                        <option value="">Select a team</option>
                        {eligible.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} · {(t.distance_m / 1000).toFixed(1)} km
                            straight-line
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!team || busy}
                        onClick={() =>
                          act("/assignments", { incidentId: id, teamId: team })
                        }
                      >
                        Offer assignment
                      </button>
                    </>
                  )}
                </div>
              )}
          </div>
          <EvidenceList items={i.evidence ?? []} />
          {dispatcher && <ResourceConsole incidentId={id!} />}
          <Tracking data={tracking.data} error={tracking.error} />
        </section>
        <aside>
          <div className="panel">
            <div className="section-heading">
              <h2>Status history</h2>
              <span className="connection">{live}</span>
            </div>
            <ol className="timeline">
              {i.history.map((h: any, n: number) => (
                <li key={n}>
                  <span />
                  <div>
                    <strong>{label(h.to_status)}</strong>
                    <small>{new Date(h.created_at).toLocaleString()}</small>
                    {h.note && <p>{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {dispatcher && <ReviewTools id={id!} />}
        </aside>
      </div>
    </>
  );
}
function Tracking({ data, error }: { data: any; error: string }) {
  const node = useRef<HTMLDivElement>(null),
    [mapError, setMapError] = useState("");
  const pointKey = JSON.stringify(
    data?.teams?.map((t: any) => [t.id, t.latitude, t.longitude, t.tracking]),
  );
  useEffect(() => {
    if (!data || !node.current) return;
    let map: MapLibre.Map | undefined,
      cancelled = false;
    api("/locations/map/style")
      .then(async (style) => {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !node.current) return;
        map = new maplibregl.Map({
          container: node.current,
          style,
          center: [data.incident.longitude, data.incident.latitude],
          zoom: 12,
          transformRequest: (url) => ({ url, credentials: "include" }),
        });
        new maplibregl.Marker({ color: "#b4503c" })
          .setLngLat([data.incident.longitude, data.incident.latitude])
          .addTo(map);
        for (const t of data.teams)
          if (t.longitude != null)
            new maplibregl.Marker({
              color: t.tracking === "LIVE" ? "#24564c" : "#999",
            })
              .setLngLat([t.longitude, t.latitude])
              .addTo(map);
        map.on("error", () =>
          setMapError(
            "Map tiles unavailable. Coordinates remain available below.",
          ),
        );
        setMapError("");
      })
      .catch((e) => setMapError(e.message));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pointKey, !!data]);
  return (
    <div className="panel">
      <div className="section-heading">
        <h2>Authorized team tracking</h2>
        <Navigation size={18} />
      </div>
      <ErrorBox message={error} />
      <div ref={node} className={`map ${mapError ? "map-unavailable" : ""}`}>
        {mapError && (
          <div>
            <MapPin size={28} />
            <p>{mapError}</p>
            <small>No simulated live map or ETA is displayed.</small>
          </div>
        )}
      </div>
      {data?.teams.map((t: any) => (
        <div className="tracking-row" key={t.id}>
          <strong>{t.name}</strong>
          <Badge value={t.tracking} />
          <p>
            {t.latitude != null
              ? `${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}`
              : "Location unavailable"}{" "}
            · Last update:{" "}
            {t.location_at
              ? new Date(t.location_at).toLocaleTimeString()
              : "none"}
          </p>
          <p>
            {t.route
              ? `${(t.route.distance_m / 1000).toFixed(1)} km by road · ${etaLabel(t.route.duration_s)}`
              : `${t.straight_line_m != null ? (t.straight_line_m / 1000).toFixed(1) + " km straight-line · " : ""}ETA unavailable`}
          </p>
        </div>
      ))}
      <p className="muted">{data?.notice ?? "Loading tracking status…"}</p>
    </div>
  );
}
function ReviewTools({ id }: { id: string }) {
  const escalations = useData(`/incidents/${id}/escalations`),
    duplicates = useData(`/incidents/${id}/duplicates`);
  return (
    <>
      <div className="panel">
        <h2>Escalation history</h2>
        {escalations.data?.items.map((e: any) => (
          <p key={e.stage}>
            <strong>Stage {e.stage + 1}</strong>
            <br />
            <small>
              {e.outcome ??
                `Scheduled ${new Date(e.due_at).toLocaleTimeString()}`}
            </small>
          </p>
        ))}
      </div>
      <div className="panel">
        <h2>Possible duplicates</h2>
        <p className="muted">Nearby reports require human review.</p>
        {duplicates.data?.items.length ? (
          duplicates.data.items.map((d: any) => (
            <p key={d.id}>
              <Link to={`/incidents/${d.id}`}>
                #{d.id.slice(0, 8)} · {label(d.category)}
              </Link>
            </p>
          ))
        ) : (
          <p>No candidates found.</p>
        )}
      </div>
    </>
  );
}
function Teams() {
  const { user } = useContext(Session),
    teams = useData("/teams"),
    resources = useData("/resources");
  const [error, setError] = useState(""),
    [sharing, setSharing] = useState(false);
  const watcher = useRef<number | null>(null),
    sharingSession = useRef<string | null>(null);
  async function stop() {
    if (watcher.current !== null)
      navigator.geolocation.clearWatch(watcher.current);
    watcher.current = null;
    setSharing(false);
    if (sharingSession.current) {
      try {
        await api(`/locations/sessions/${sharingSession.current}`, {
          method: "DELETE",
        });
      } catch {
        /* Backend expires the session even if offline. */
      }
      sharingSession.current = null;
    }
  }
  useEffect(
    () => () => {
      void stop();
    },
    [],
  );
  async function duty(id: string, availability: string) {
    try {
      if (availability !== "AVAILABLE") await stop();
      await post(`/teams/${id}/duty`, { availability });
      await teams.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function start(teamId: string) {
    setError("");
    try {
      const s = await post("/locations/sessions", { teamId });
      sharingSession.current = s.id;
      watcher.current = navigator.geolocation.watchPosition(
        async (p) => {
          try {
            await post("/locations/updates", {
              sessionId: s.id,
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy,
              observedAt: new Date(p.timestamp).toISOString(),
            });
            setSharing(true);
          } catch (e) {
            setError((e as Error).message);
            await stop();
          }
        },
        () => {
          setError(
            "Location permission denied or GPS unavailable. Sharing stopped.",
          );
          void stop();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHead
        title="Teams & resources"
        description="Duty, location sharing and assignment acceptance are separate decisions."
      />
      <ErrorBox message={error || teams.error || resources.error} />
      {sharing && (
        <div className="notice success">
          <Radio size={20} />
          Your device is sharing operational location.{" "}
          <button onClick={stop}>Stop sharing</button>
        </div>
      )}
      <div className="two-columns">
        {teams.data?.items.map((t: any) => (
          <section className="panel" key={t.id}>
            <div className="section-heading">
              <h2>{t.name}</h2>
              <Badge value={t.availability} />
            </div>
            <p>
              {t.department} · Capacity {t.capacity}
            </p>
            <p className="muted">
              {t.capabilities.join(" · ") || "No capabilities registered"}
              <br />
              {t.vehicle}
            </p>
            <div className="button-row">
              <button
                onClick={() =>
                  duty(
                    t.id,
                    t.availability === "AVAILABLE" ? "OFF_DUTY" : "AVAILABLE",
                  )
                }
              >
                {t.availability === "AVAILABLE" ? "End duty" : "Start duty"}
              </button>
              {user!.role === "RESCUER" && t.availability === "AVAILABLE" && (
                <button
                  disabled={sharing}
                  className="primary"
                  onClick={() => start(t.id)}
                >
                  <LocateFixed size={17} />
                  Share device location
                </button>
              )}
              <button onClick={() => duty(t.id, "UNAVAILABLE")}>
                Mark unavailable
              </button>
            </div>
            <small>
              Only share when on duty. Leaving this screen stops this device’s
              sharing session.
            </small>
          </section>
        ))}
      </div>
      <div className="section-heading">
        <h2>Resource inventory</h2>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Type</th>
              <th>Available / total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {resources.data?.items.map((r: any) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{label(r.type)}</td>
                <td>
                  {r.quantity - r.allocated} / {r.quantity}
                </td>
                <td>
                  <Badge value={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function Announcements() {
  const { user } = useContext(Session),
    { data, error, reload } = useData("/announcements");
  const [create, setCreate] = useState(false),
    [actionError, setActionError] = useState("");
  const allowed = ["AUTHORITY", "ADMIN"].includes(user!.role);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await post("/announcements", {
        title: f.get("title"),
        body: f.get("body"),
        audience: f.get("audience"),
        importance: f.get("importance"),
        expiresAt: new Date(String(f.get("expires"))).toISOString(),
      });
      setCreate(false);
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }
  return (
    <>
      <PageHead
        title="Announcements"
        description="Current notices published by authorized platform personnel."
      >
        {allowed && (
          <button className="primary" onClick={() => setCreate(!create)}>
            <Plus size={17} />
            Publish notice
          </button>
        )}
      </PageHead>
      <ErrorBox message={error || actionError} />
      {create && (
        <form className="panel" onSubmit={submit}>
          <label>
            Title
            <input name="title" minLength={3} maxLength={150} required />
          </label>
          <label>
            Message
            <textarea name="body" minLength={5} maxLength={3000} required />
          </label>
          <div className="two-columns">
            <label>
              Audience
              <select name="audience">
                <option value="EVERYONE">Everyone</option>
                <option value="AUTHORITIES_ONLY">
                  Authorities in my department & jurisdiction
                </option>
              </select>
            </label>
            <label>
              Importance
              <select name="importance">
                <option>INFORMATION</option>
                <option>IMPORTANT</option>
                <option>URGENT</option>
              </select>
            </label>
          </div>
          <label>
            Expires at
            <input type="datetime-local" name="expires" required />
          </label>
          <button className="primary">Publish announcement</button>
        </form>
      )}
      {data?.items.length ? (
        data.items.map((a: any) => (
          <article className="panel announcement" key={a.id}>
            <Badge value={a.importance} />
            <h2>{a.title}</h2>
            <p>{a.body}</p>
            <small>
              {a.issuer} · {new Date(a.created_at).toLocaleString()} · Expires{" "}
              {new Date(a.expires_at).toLocaleString()}
            </small>
          </article>
        ))
      ) : (
        <Empty>No current announcements.</Empty>
      )}
    </>
  );
}
function Situation() {
  const { data, error } = useData("/situation");
  return (
    <>
      <PageHead
        title="Local situation"
        description="Only reviewed, published, non-sensitive incidents appear here. Locations are deliberately approximate."
      />
      <ErrorBox message={error} />
      {data?.items.length ? (
        <div className="two-columns">
          {data.items.map((i: any, n: number) => (
            <div className="panel" key={n}>
              <Badge value={i.severity} />
              <h2>{i.label}</h2>
              <Badge value={i.status} />
              <p>
                Approximate area: {i.latitude}, {i.longitude}
              </p>
              <small>{new Date(i.reported_at).toLocaleString()}</small>
            </div>
          ))}
        </div>
      ) : (
        <Empty>No reviewed public situation updates are available.</Empty>
      )}
    </>
  );
}
function Notifications() {
  const { data, error, reload } = useData("/notifications");
  return (
    <>
      <PageHead
        title="Your notifications"
        description="Available in-app and submitted SMS messages are not proof of human acknowledgement."
      />
      <ErrorBox message={error} />
      {data?.items.length ? (
        data.items.map((n: any) => (
          <div className="panel notification" key={n.id}>
            <Bell size={20} />
            <div>
              <h3>Incident coordination update</h3>
              <p>
                {label(n.channel)} · <Badge value={n.status} />
              </p>
              <small>{new Date(n.created_at).toLocaleString()}</small>
            </div>
            {n.incident_id && (
              <Link to={`/incidents/${n.incident_id}`}>
                Review authorized details
              </Link>
            )}
            {!n.read_at && (
              <button
                onClick={async () => {
                  await post(`/notifications/${n.id}/read`);
                  await reload();
                }}
              >
                Mark read
              </button>
            )}
          </div>
        ))
      ) : (
        <Empty>No notifications yet.</Empty>
      )}
    </>
  );
}
function Profile() {
  const { user, refresh } = useContext(Session),
    [name, setName] = useState(user!.name),
    [message, setMessage] = useState("");
  const navigate = useNavigate();
  return (
    <>
      <PageHead
        title="Profile & settings"
        description="Manage your name and sign-in session."
      />
      <section className="panel narrow">
        <label>
          Email
          <input value={user!.email} readOnly />
        </label>
        <label>
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </label>
        <p>
          Role: <Badge value={user!.role} />
        </p>
        <div className="button-row">
          <button
            className="primary"
            onClick={async () => {
              try {
                await api("/users/me", {
                  method: "PATCH",
                  body: JSON.stringify({ name }),
                });
                await refresh();
                setMessage("Profile updated");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Save profile
          </button>
          <button
            onClick={async () => {
              const r = await post("/auth/logout");
              await refresh();
              navigate("/");
              if (r.logoutUrl) window.location.assign(r.logoutUrl);
            }}
          >
            <LogOut size={17} />
            Log out
          </button>
        </div>
        <p role="status">{message}</p>
        <small>
          Logout ends your session and stops your active location sharing.
        </small>
      </section>
    </>
  );
}
function Admin() {
  const { user } = useContext(Session);
  const catalog = useData("/catalog"),
    users = useData("/admin/users"),
    health = useData("/admin/health"),
    audit = useData("/admin/audit"),
    policies = useData("/admin/policies");
  const [tab, setTab] = useState("Accounts"),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  if (user!.role !== "ADMIN")
    return <Empty>Administrator access required.</Empty>;
  async function provision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await post("/admin/users", {
        email: f.get("email"),
        name: f.get("name"),
        role: f.get("role"),
        departmentId: f.get("departmentId"),
        jurisdictionId: f.get("jurisdictionId"),
        ...(f.get("teamId") ? { teamId: f.get("teamId") } : {}),
        permissions:
          f.get("role") === "AUTHORITY" ? ["DISPATCH", "ANNOUNCE"] : [],
      });
      setMessage("Invitation submitted through Cognito");
      await users.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHead
        title="Administration"
        description="Controlled provisioning, operational configuration and an append-only audit trail."
      />
      <div className="filter-row">
        {["Accounts", "Teams", "Configuration", "Audit", "Health"].map((t) => (
          <button
            className={tab === t ? "selected" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {message && <div className="notice success">{message}</div>}
      {tab === "Accounts" && (
        <>
          <form className="panel" onSubmit={provision}>
            <h2>Invite an operational account</h2>
            <p className="muted">
              Requires Cognito configuration. Admin roles cannot be granted
              here.
            </p>
            <div className="two-columns">
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Account type
                <select name="role">
                  <option>AUTHORITY</option>
                  <option>RESCUER</option>
                </select>
              </label>
              <label>
                Department
                <select name="departmentId">
                  {catalog.data?.departments.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Jurisdiction
                <select name="jurisdictionId">
                  {catalog.data?.jurisdictions.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Team ID <span>(required for rescuers)</span>
                <input name="teamId" />
              </label>
            </div>
            <button className="primary">Send invitation</button>
          </form>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.items.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      {u.name}
                      <small>{u.email}</small>
                    </td>
                    <td>{u.role}</td>
                    <td>
                      <Badge value={u.status} />
                    </td>
                    <td>
                      {u.role !== "ADMIN" && (
                        <button
                          onClick={async () => {
                            try {
                              const r = await post(
                                `/admin/users/${u.id}/status`,
                                {
                                  status:
                                    u.status === "ACTIVE"
                                      ? "SUSPENDED"
                                      : "ACTIVE",
                                },
                              );
                              setMessage(r.notice ?? "Account status updated");
                              await users.reload();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          {u.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "Teams" && (
        <AdminTeam catalog={catalog.data} onError={setError} />
      )}{" "}
      {tab === "Configuration" && (
        <div className="panel">
          <h2>Escalation policies</h2>
          <p>
            Demonstration defaults. Critical incidents continue escalating until
            dispatch.
          </p>
          {policies.data?.items.map((p: any) => (
            <form
              key={p.id}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await api(`/admin/policies/${p.id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                      radii: String(f.get("radii")).split(",").map(Number),
                      delays: String(f.get("delays")).split(",").map(Number),
                    }),
                  });
                  setMessage("Policy updated");
                  await policies.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <h3>{p.name}</h3>
              <label>
                Radius stages (metres, comma separated)
                <input name="radii" defaultValue={p.radii_m.join(",")} />
              </label>
              <label>
                Stage delays from initial event (seconds)
                <input
                  name="delays"
                  defaultValue={p.delays_seconds.join(",")}
                />
              </label>
              <button>Save policy</button>
            </form>
          ))}
        </div>
      )}
      {tab === "Configuration" && <ManagementPanels />}
      {tab === "Accounts" && <AccountScopeForm />}
      {tab === "Audit" && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.data?.items.map((a: any) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{label(a.action)}</td>
                  <td>
                    {a.entity_type} #{a.entity_id.slice(0, 8)}
                  </td>
                  <td>{JSON.stringify(a.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "Health" && (
        <div className="panel">
          <h2>Runtime integration status</h2>
          {health.data &&
            Object.entries(health.data).map(([k, v]) => (
              <div className="health-row" key={k}>
                <span>{k.replace(/([A-Z])/g, " $1")}</span>
                <strong>{String(v)}</strong>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
function AdminTeam({
  catalog,
  onError,
}: {
  catalog: any;
  onError: (e: string) => void;
}) {
  const [msg, setMsg] = useState("");
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          const t = await post("/admin/teams", {
            name: f.get("name"),
            departmentId: f.get("departmentId"),
            jurisdictionId: f.get("jurisdictionId"),
            vehicle: f.get("vehicle"),
            capacity: Number(f.get("capacity")),
            capabilities: String(f.get("capabilities"))
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          });
          setMsg(
            `Team created: ${t.id}. Use this ID when provisioning members.`,
          );
        } catch (e) {
          onError((e as Error).message);
        }
      }}
    >
      <h2>Create rescue team</h2>
      <label>
        Team name
        <input name="name" required />
      </label>
      <div className="two-columns">
        <label>
          Department
          <select name="departmentId">
            {catalog?.departments.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Jurisdiction
          <select name="jurisdictionId">
            {catalog?.jurisdictions.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vehicle
          <input name="vehicle" />
        </label>
        <label>
          Concurrent assignment capacity
          <input
            type="number"
            name="capacity"
            min="1"
            max="5"
            defaultValue="1"
          />
        </label>
      </div>
      <label>
        Capabilities (comma separated)
        <input name="capabilities" placeholder="FIRST_AID, SEARCH" />
      </label>
      <button className="primary">Create team</button>
      <p role="status">{msg}</p>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
