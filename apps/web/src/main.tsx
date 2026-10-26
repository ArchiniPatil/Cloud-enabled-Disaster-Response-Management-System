import { tokenColor, syncBrowserTheme } from "./visual-tokens";
import { PresentationTable, StatusToasts } from "./ui-feedback";
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
  useLocation,
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
  Phone,
  Info,
  RefreshCw,
  KeyRound,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type * as MapLibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api, post, setCsrf, label, ApiError } from "./api";
import { etaLabel, locationState } from "../../../packages/core/src/domain";
import "./tokens.css";
import "./styles.css";
import { ResponseIllustration } from "./presentation";
import { ShellInteractions, useSidebarPreference } from "./shell-interactions";
import "./operations.css";
import { OperationalDashboard } from "./dashboard";
import { OperationalMetrics } from "./metrics";
import { ResourceMap } from "./resource-map";
import { LocationPicker } from "./location-picker";
import { useData } from "./hooks";
import {
  ManagementPanels,
  ResourceConsole,
  EvidenceList,
  AccountScopeForm,
  OrganizationTeams,
  NotificationPreferences,
  ResourceLocationForm,
  NotificationJobs,
} from "./management";
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  department_id: string;
  jurisdiction_id: string;
  permissions: string[];
};
const Session = createContext<{
  user: User | null;
  refresh: (requireSession?: boolean) => Promise<void>;
  mode: string;
  identityConfigured: boolean;
  realtime: string;
}>({
  user: null,
  refresh: async () => {},
  mode: "",
  identityConfigured: false,
  realtime: "sse",
});
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
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </header>
  );
}
function App() {
  useEffect(syncBrowserTheme, []);
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState(""),
    [identityConfigured, setIdentityConfigured] = useState(false),
    [realtime, setRealtime] = useState("sse"),
    [sessionError, setSessionError] = useState(""),
    [online, setOnline] = useState(navigator.onLine);
  const refresh = useCallback(async (requireSession = false) => {
    try {
      const result = await api("/auth/me");
      setUser(result.user);
      setCsrf(result.csrf);
    } catch (e) {
      setUser(null);
      setCsrf("");
      if (requireSession || !(e instanceof ApiError) || e.status !== 401)
        throw e;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void api("/auth/config")
      .then((c) => {
        setMode(c.mode);
        setIdentityConfigured(c.identityConfigured);
        setRealtime(c.realtime);
      })
      .catch(() => setMode("unavailable"));
    void refresh().catch((e) => setSessionError(e.message));
    const expired = () => {
      setUser(null);
      setCsrf("");
      setSessionError(
        "Your session has ended or access was revoked. Please sign in again.",
      );
    };
    window.addEventListener("response:unauthorized", expired);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("response:unauthorized", expired);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, [refresh]);
  if (loading) return <div className="loading">Connecting to Response…</div>;
  return (
    <Session.Provider
      value={{ user, refresh, mode, identityConfigured, realtime }}
    >
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
      {!user && sessionError && (
        <div className="session-error" role="alert">
          {sessionError}
          <button
            onClick={() => {
              setSessionError("");
              void refresh().catch((e) => setSessionError(e.message));
            }}
          >
            Retry connection
          </button>
        </div>
      )}
      {!user ? <Landing /> : <Shell />}
    </Session.Provider>
  );
}
function Landing() {
  const { mode, refresh, identityConfigured } = useContext(Session);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [role, setRole] = useState("citizen");
  const navigate = useNavigate(),
    location = useLocation();
  const development = location.pathname === "/development" && mode === "demo";
  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await post("/auth/demo", { email: `${role}@demo.invalid` });
      await refresh(true);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="entry-page">
      <header className="entry-header">
        <Link className="brand" to="/">
          <ShieldCheck />
          <span>
            response<span className="brand-dot">.</span>
          </span>
        </Link>
        <span>Emergency coordination platform</span>
      </header>
      <main className="entry-content">
        <div className="entry-intro">
          <p className="entry-purpose">For the people who respond.</p>
          <h1>
            Disaster <em>Response</em> and Management System
          </h1>
          <p>
            A shared workspace for citizen reports, authorized dispatch and
            accountable field response.
          </p>
          <ResponseIllustration />
        </div>
        <section
          className="entry-card"
          aria-label={development ? "Development access" : "Sign in"}
        >
          <KeyRound className="entry-symbol" size={28} />
          <h2>
            {development
              ? "Development / Demo Mode"
              : "Sign in to your workspace"}
          </h2>
          {development ? (
            <>
              <p>
                Local test identities only. These accounts do not contact
                official services or send external notifications.
              </p>
              <form onSubmit={signIn}>
                <label>
                  Demo role
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {["citizen", "authority", "rescuer", "admin"].map((r) => (
                      <option key={r} value={r}>
                        {label(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <ErrorBox message={error} />
                <button className="primary full-width" disabled={busy}>
                  {busy ? "Signing in…" : "Continue with local account"}
                </button>
              </form>
              <p className="muted">
                If accounts are missing, run <code>npm run setup:demo</code> and
                restart with <code>npm run dev:demo</code>.
              </p>
              <Link to="/">Back to normal sign-in</Link>
            </>
          ) : (
            <>
              <p>
                Citizens, coordinators, responders and administrators use secure
                role-based access.
              </p>
              {identityConfigured ? (
                <>
                  <a
                    className="button primary full-width"
                    href="/api/v1/auth/login"
                  >
                    Sign in <ArrowUpRight size={18} />
                  </a>
                  <a className="button full-width" href="/api/v1/auth/register">
                    Register as a citizen
                  </a>
                  <a className="recovery-link" href="/api/v1/auth/recover">
                    Forgot password?
                  </a>
                  <p className="muted">
                    Cognito manages passwords, email verification and
                    authenticator enrollment. Operational accounts require an
                    administrator invitation.
                  </p>
                </>
              ) : (
                <>
                  <button className="primary full-width" disabled>
                    Sign in
                  </button>
                  <div className="identity-notice" role="status">
                    <Info size={18} aria-hidden="true" />
                    <div>
                      <strong>
                        {mode === "unavailable"
                          ? "Connection unavailable"
                          : "Sign-in needs configuration"}
                      </strong>
                      <details>
                        <summary>Details</summary>
                        <p>
                          {mode === "unavailable"
                            ? "The backend is unavailable. Start the application and retry."
                            : "Cognito sign-in is not configured in this environment. An administrator must configure the identity provider before normal sign-in and citizen registration are available."}
                        </p>
                      </details>
                    </div>
                  </div>
                  <button
                    className="quiet-button"
                    aria-busy={busy}
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      window.location.reload();
                    }}
                  >
                    <RefreshCw size={16} className={busy ? "spin" : ""} /> Retry
                    connection
                  </button>
                </>
              )}
              {mode === "demo" && (
                <div className="development-link">
                  <span>Development only</span>
                  <Link to="/development">
                    Open Development / Demo Mode <ChevronRight size={16} />
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      </main>
      <div className="entry-emergency">
        <EmergencyFallback />
      </div>
      <footer className="entry-footer">
        A coordination platform. A submitted report does not guarantee
        acceptance or dispatch by emergency services.
      </footer>
    </div>
  );
}
function Protected({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}) {
  const { user } = useContext(Session);
  return roles.includes(user!.role) ? (
    children
  ) : (
    <section className="panel">
      <h1>Access restricted</h1>
      <p>
        Your role cannot open this workspace. Operational permissions are
        enforced by the backend.
      </p>
      <Link to="/">Return to your dashboard</Link>
    </section>
  );
}
function Shell() {
  const { user } = useContext(Session);
  const { collapsed, toggle } = useSidebarPreference();
  const currentLocation = useLocation();
  const citizen = user!.role === "CITIZEN";
  const notifications = useData("/notifications", 10000);
  const links: [string, string, React.ReactNode][] = [
    ["/", "Overview", <LayoutDashboard size={19} />],
    [
      "/reports",
      citizen ? "My reports" : "Incident inbox",
      <ClipboardList size={19} />,
    ],
    ["/announcements", "Announcements", <Bell size={19} />],
    ["/situation", "Local situation", <MapPin size={19} />],
    ["/resource-map", "Shelters & resources", <Building2 size={19} />],
  ];
  if (!citizen)
    links.push(["/teams", "Teams & resources", <Users size={19} />]);
  if (["ADMIN", "AUTHORITY"].includes(user!.role))
    links.push(["/metrics", "Operational metrics", <Activity size={19} />]);
  if (user!.role === "ADMIN")
    links.push(["/admin", "Administration", <Settings size={19} />]);
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand">
          <ShieldCheck />
          <span>
            response<span className="brand-dot">.</span>
          </span>
        </Link>
        <button
          className="sidebar-toggle"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          {collapsed ? (
            <PanelLeftOpen size={20} />
          ) : (
            <PanelLeftClose size={20} />
          )}
        </button>
        <div className="workspace-label">{label(user!.role)} workspace</div>
        <nav aria-label="Main navigation">
          {links.map(([to, title, icon], index) => (
            <React.Fragment key={to}>
              {(index === 0 || to === "/announcements" || to === "/teams") && (
                <span className="nav-group">
                  {index === 0
                    ? "Workspace"
                    : to === "/announcements"
                      ? "Community"
                      : "Coordination"}
                </span>
              )}
              <NavLink to={to} end={to === "/"} viewTransition title={title}>
                {icon}
                <span className="nav-text">{title}</span>
              </NavLink>
            </React.Fragment>
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
          <NavLink
            to="/profile"
            viewTransition
            className="profile-link"
            title="Profile & settings"
          >
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
          <div className="workspace-path">
            <span className="workspace-dot" />
            {label(user!.role)} workspace
            {currentLocation.pathname.split("/").filter(Boolean).length > 1 && (
              <span className="compact-breadcrumb">
                {" "}
                / <Link to="/reports">Reports</Link> / Incident
              </span>
            )}
          </div>
          <div className="topbar-actions">
            <div id="dashboard-refresh-slot" />
            <ShellInteractions notifications={notifications.data} />

            <Link
              to="/notifications"
              className="icon-button"
              aria-label="Notifications"
              title="Open notification centre"
            >
              <ArrowUpRight size={20} />
              {!!notifications.data?.unread && (
                <span className="notification-count">
                  {notifications.data.unread}
                </span>
              )}
            </Link>
          </div>
        </div>
        <main id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/report" element={<ReportForm />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/situation" element={<Situation />} />
            <Route path="/resource-map" element={<ResourceMap />} />
            <Route
              path="/teams"
              element={
                <Protected roles={["ADMIN", "AUTHORITY", "RESCUER"]}>
                  <Teams />
                </Protected>
              }
            />
            <Route
              path="/admin"
              element={
                <Protected roles={["ADMIN"]}>
                  <Admin />
                </Protected>
              }
            />
            <Route
              path="/metrics"
              element={
                <Protected roles={["ADMIN", "AUTHORITY"]}>
                  <OperationalMetrics />
                </Protected>
              }
            />
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
        <StatusToasts />
        <footer className="app-footer">
          <span>Cloud-enabled disaster coordination</span>
          <span>Submission ≠ acceptance ≠ dispatch ≠ arrival</span>
        </footer>
      </div>
    </div>
  );
}
function Dashboard() {
  const { user } = useContext(Session);
  return <OperationalDashboard role={user!.role} />;
}
function EmergencyFallback() {
  const { data } = useData("/auth/config");
  return (
    <div className="fallback">
      <Phone size={22} aria-hidden="true" />
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
function Reports() {
  const { user } = useContext(Session);
  return <OperationalDashboard role={user!.role} queueOnly />;
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
    [peopleAffected, setPeopleAffected] = useState(""),
    [hazards, setHazards] = useState(""),
    [accuracy, setAccuracy] = useState<number | undefined>(),
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
        setAccuracy(position.coords.accuracy);
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
    if (!navigator.geolocation) {
      setGps(
        "This browser does not support geolocation. Enter coordinates manually.",
      );
      return;
    }
    setGps("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setAccuracy(p.coords.accuracy);
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
        hazards,
        ...(peopleAffected ? { peopleAffected: Number(peopleAffected) } : {}),
        ...(accuracy !== undefined ? { locationAccuracyM: accuracy } : {}),
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
          <LocationPicker
            latitude={latitude}
            longitude={longitude}
            onPick={(lat, lon, foundAddress) => {
              manuallyCorrected.current = true;
              setAccuracy(undefined);
              setLatitude(String(lat));
              setLongitude(String(lon));
              if (foundAddress) setAddress(foundAddress);
            }}
          />
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
                  setAccuracy(undefined);
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
                  setAccuracy(undefined);
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
          <div className="two-columns">
            <label>
              Estimated people affected (optional)
              <input
                type="number"
                min="1"
                max="1000000"
                value={peopleAffected}
                onChange={(e) => setPeopleAffected(e.target.value)}
              />
            </label>
            <label>
              Immediate hazards (optional)
              <textarea
                maxLength={1000}
                rows={2}
                placeholder="Smoke, unstable structures, traffic or other observed hazards"
                value={hazards}
                onChange={(e) => setHazards(e.target.value)}
              />
            </label>
          </div>
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
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, realtime } = useContext(Session);
  const { data: i, error, reload } = useData(`/incidents/${id}`);
  const tracking = useData(`/locations/incidents/${id}`);
  const [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    [eligible, setEligible] = useState<any[]>([]),
    [team, setTeam] = useState(""),
    [live, setLive] = useState("Connecting"),
    [assignmentAction, setAssignmentAction] = useState<{
      id: string;
      status: string;
    } | null>(null),
    [outcome, setOutcome] = useState(""),
    [supplement, setSupplement] = useState("");
  const dispatcher = ["ADMIN", "AUTHORITY"].includes(user!.role);
  useEffect(() => {
    if (realtime === "poll") {
      setLive("Updates every 5 seconds");
      const timer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void reload();
          void tracking.reload();
        }
      }, 5000);
      return () => window.clearInterval(timer);
    }
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
  }, [id, realtime, reload, tracking.reload]);
  async function act(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await post(path, body, crypto.randomUUID());
      if (
        path.startsWith("/assignments/") &&
        (body as { status?: string }).status === "DECLINED"
      ) {
        navigate("/");
        return;
      }
      await reload();
      await tracking.reload();
      setAssignmentAction(null);
      setOutcome("");
      setSupplement("");
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
            <div className="incident-facts">
              <div>
                <span>Estimated people affected</span>
                <strong>{i.people_affected ?? "Not reported"}</strong>
              </div>
              <div>
                <span>Location uncertainty</span>
                <strong>
                  {i.location_accuracy_m != null
                    ? `Approximately ${Math.round(i.location_accuracy_m)} m`
                    : "Not reported / manually selected"}
                </strong>
              </div>
            </div>
            {i.hazards && (
              <div className="notice warning">
                <AlertTriangle size={18} />
                <span>
                  <strong>Reported hazards:</strong> {i.hazards}
                </span>
              </div>
            )}
            <a
              className="navigation-link"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${i.latitude},${i.longitude}`}
            >
              Open navigation in external maps <Navigation size={15} />
            </a>
            <small>
              Opening navigation shares these coordinates with the selected
              external map provider.
            </small>
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
                    window.confirm(
                      "Withdraw this unacknowledged request? Its audit history will remain.",
                    ) && act(`/incidents/${id}/status`, { status: "CANCELLED" })
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
                {a.outcome_note && (
                  <p className="muted">
                    Recorded outcome / reason: {a.outcome_note}
                  </p>
                )}
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
                          ["DECLINED", "COMPLETED"].includes(s)
                            ? (setAssignmentAction({ id: a.id, status: s }),
                              setOutcome(""))
                            : act(`/assignments/${a.id}/status`, { status: s })
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
                        onClick={() => (
                          setAssignmentAction({
                            id: a.id,
                            status: "CANCELLED",
                          }),
                          setOutcome("")
                        )}
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
          {assignmentAction && (
            <form
              className="panel outcome-form"
              aria-label="Assignment outcome"
              onSubmit={(e) => {
                e.preventDefault();
                void act(`/assignments/${assignmentAction.id}/status`, {
                  status: assignmentAction.status,
                  note: outcome,
                });
              }}
            >
              <h2>
                {label(assignmentAction.status)} — record{" "}
                {assignmentAction.status === "COMPLETED"
                  ? "the outcome"
                  : "a reason"}
              </h2>
              <label>
                Reason or outcome
                <textarea
                  autoFocus
                  required
                  minLength={5}
                  maxLength={1000}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                />
              </label>
              <p>
                Record observed results and remaining needs. A status change
                alone does not prove that everyone is safe.
              </p>
              <div className="button-row">
                <button className="primary" disabled={busy}>
                  Confirm {label(assignmentAction.status)}
                </button>
                <button type="button" onClick={() => setAssignmentAction(null)}>
                  Keep current status
                </button>
              </div>
            </form>
          )}
          <section className="panel">
            <h2>Supplementary updates</h2>
            {i.updates?.map((u: any) => (
              <article className="report-update" key={u.id}>
                <p>{u.body}</p>
                <small>
                  {label(u.actor_role)} ·{" "}
                  {new Date(u.created_at).toLocaleString()}
                </small>
              </article>
            ))}
            {!i.updates?.length && (
              <p className="muted">No supplementary information yet.</p>
            )}
            {![
              "RESOLVED",
              "CANCELLED",
              "DUPLICATE",
              "UNABLE_TO_RESPOND",
            ].includes(i.status) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(`/incidents/${id}/updates`, { body: supplement });
                }}
              >
                <label>
                  Add information
                  <textarea
                    required
                    minLength={3}
                    maxLength={2000}
                    value={supplement}
                    onChange={(e) => setSupplement(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Add update</button>
                <p className="muted">
                  Updates are permanent and visible only to authorized
                  participants.
                </p>
              </form>
            )}
          </section>
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
        new maplibregl.Marker({ color: tokenColor("accent") })
          .setLngLat([data.incident.longitude, data.incident.latitude])
          .addTo(map);
        for (const t of data.teams)
          if (t.longitude != null)
            new maplibregl.Marker({
              color:
                t.tracking === "LIVE"
                  ? tokenColor("teal")
                  : tokenColor("muted"),
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
          <Badge
            value={
              error
                ? "UNAVAILABLE"
                : t.location_at
                  ? locationState(t.location_at, t.accuracy)
                  : "UNAVAILABLE"
            }
          />
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
            {t.route &&
            !error &&
            t.location_at &&
            locationState(t.location_at, t.accuracy) === "LIVE"
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
        <PresentationTable>
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
        </PresentationTable>
      </div>
    </>
  );
}
function Announcements() {
  const { user } = useContext(Session),
    { data, error, reload } = useData("/announcements");
  const [create, setCreate] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [saving, setSaving] = useState(false),
    [actionError, setActionError] = useState("");
  const allowed =
    user!.role === "ADMIN" ||
    (user!.role === "AUTHORITY" && user!.permissions.includes("ANNOUNCE"));
  const canEdit = (a: any) =>
    allowed &&
    (user!.role === "ADMIN" ||
      (a.department_id === user!.department_id &&
        a.jurisdiction_id === user!.jurisdiction_id));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setActionError("");
    try {
      const payload = {
        title: f.get("title"),
        body: f.get("body"),
        audience: f.get("audience"),
        importance: f.get("importance"),
        expiresAt: new Date(String(f.get("expires"))).toISOString(),
      };
      if (editing)
        await api(`/announcements/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else await post("/announcements", payload);
      setEditing(null);
      setCreate(false);
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHead
        title="Announcements"
        description="Current notices published by authorized platform personnel."
      >
        {allowed && (
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setCreate(!create);
            }}
          >
            <Plus size={17} />
            Publish notice
          </button>
        )}
      </PageHead>
      <ErrorBox message={error || actionError} />
      {create && (
        <form className="panel" onSubmit={submit} key={editing?.id ?? "new"}>
          <h2>{editing ? "Correct announcement" : "New announcement"}</h2>
          <label>
            Title
            <input
              name="title"
              defaultValue={editing?.title ?? ""}
              minLength={3}
              maxLength={150}
              required
            />
          </label>
          <label>
            Message
            <textarea
              name="body"
              defaultValue={editing?.body ?? ""}
              minLength={5}
              maxLength={3000}
              required
            />
          </label>
          <div className="two-columns">
            <label>
              Audience
              <select
                name="audience"
                defaultValue={editing?.audience ?? "EVERYONE"}
              >
                <option value="EVERYONE">Everyone</option>
                <option value="AUTHORITIES_ONLY">
                  Authorities in my department & jurisdiction
                </option>
              </select>
            </label>
            <label>
              Importance
              <select
                name="importance"
                defaultValue={editing?.importance ?? "INFORMATION"}
              >
                <option>INFORMATION</option>
                <option>IMPORTANT</option>
                <option>URGENT</option>
              </select>
            </label>
          </div>
          <label>
            Expires at
            <input
              type="datetime-local"
              name="expires"
              required
              defaultValue={
                editing
                  ? new Date(
                      new Date(editing.expires_at).getTime() -
                        new Date(editing.expires_at).getTimezoneOffset() *
                          60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
            />
          </label>
          <button className="primary" disabled={saving}>
            {saving
              ? "Saving…"
              : editing
                ? "Save correction"
                : "Publish announcement"}
          </button>
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
            {canEdit(a) && (
              <div className="button-row">
                <button
                  onClick={() => {
                    setEditing(a);
                    setCreate(true);
                  }}
                >
                  Correct notice
                </button>
                <button
                  disabled={saving}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Withdraw this notice from the active announcements? Its audit history will be retained.",
                      )
                    )
                      return;
                    setSaving(true);
                    try {
                      await api(`/announcements/${a.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          title: a.title,
                          body: a.body,
                          audience: a.audience,
                          importance: a.importance,
                          expiresAt: a.expires_at,
                          cancelled: true,
                        }),
                      });
                      await reload();
                    } catch (e) {
                      setActionError((e as Error).message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Withdraw notice
                </button>
              </div>
            )}
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
  const { data, error, reload } = useData("/notifications", 5000);
  return (
    <>
      <PageHead
        title="Your notifications"
        description="In-app, SMS and email updates. Simulated means no external delivery; submitted means provider acceptance only."
      />
      <ErrorBox message={error} />
      {data?.items.length ? (
        data.items.map((n: any) => (
          <div className="panel notification" key={n.id}>
            <Bell size={20} />
            <div>
              <h3>{label(n.type ?? "COORDINATION_UPDATE")}</h3>
              <p>
                {label(n.channel)} · <Badge value={n.status} />
              </p>
              <small>{new Date(n.created_at).toLocaleString()}</small>
              {n.status === "SIMULATED" && (
                <p className="muted">
                  Local test sink. No message was sent externally.
                </p>
              )}
              {n.attempts?.length > 0 && (
                <details>
                  <summary>{n.attempts.length} delivery attempts</summary>
                  {n.attempts.map((a: any, index: number) => (
                    <p key={index}>
                      {label(a.outcome)} · {new Date(a.at).toLocaleString()}{" "}
                      {a.error ? `· ${a.error}` : ""}
                    </p>
                  ))}
                </details>
              )}
            </div>
            {n.incident_id && n.can_open && (
              <Link to={`/incidents/${n.incident_id}`}>
                Review authorized details
              </Link>
            )}
            {n.incident_id && !n.can_open && (
              <p className="muted">
                Detailed access requires an active authorized scope or
                assignment. This alert is not a dispatch order.
              </p>
            )}
            {!n.read_at && (
              <button
                onClick={async () => {
                  try {
                    await post(`/notifications/${n.id}/read`);
                    await reload();
                  } catch (e) {
                    window.alert((e as Error).message);
                  }
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
              try {
                const r = await post("/auth/logout");
                await refresh();
                navigate("/");
                if (r.logoutUrl) window.location.assign(r.logoutUrl);
              } catch (e) {
                setMessage((e as Error).message);
              }
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
    policies = useData("/admin/policies"),
    inviteTeams = useData("/teams");
  const [tab, setTab] = useState("Accounts"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [inviting, setInviting] = useState(false);
  if (user!.role !== "ADMIN")
    return <Empty>Administrator access required.</Empty>;
  async function provision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inviting) return;
    setInviting(true);
    setError("");
    setMessage("");
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
    } finally {
      setInviting(false);
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
                Rescue team (required for rescuers)
                <select name="teamId">
                  <option value="">None — authority account</option>
                  {inviteTeams.data?.items.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary" disabled={inviting}>
              {inviting ? "Sending invitation…" : "Send invitation"}
            </button>
          </form>
          <div className="panel table-wrap">
            <PresentationTable>
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
                      {["AUTHORITY", "RESCUER"].includes(u.role) &&
                        u.status === "ACTIVE" && (
                          <button
                            onClick={async () => {
                              try {
                                await post(
                                  `/admin/users/${u.id}/resend-invitation`,
                                );
                                setMessage(
                                  "Invitation resubmitted. Existing accepted accounts should use password recovery.",
                                );
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            Resend invitation
                          </button>
                        )}
                      {u.role !== "ADMIN" && (
                        <button
                          onClick={async () => {
                            try {
                              if (
                                !window.confirm(
                                  `${u.status === "ACTIVE" ? "Suspend" : "Activate"} this account? Active sessions may be revoked.`,
                                )
                              )
                                return;
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
            </PresentationTable>
          </div>
        </>
      )}
      {tab === "Teams" && (
        <>
          <AdminTeam catalog={catalog.data} onError={setError} />
          <OrganizationTeams />
        </>
      )}{" "}
      {tab === "Configuration" && (
        <div className="panel">
          <h2>Escalation policies</h2>
          <p>
            Configurable ring expansion. Accepted assignments pause automatic
            expansion while awaiting authorized dispatch; dispatchers can
            request manual review.
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
      {tab === "Configuration" && (
        <>
          <ManagementPanels />
          <ResourceLocationForm />
        </>
      )}
      {tab === "Accounts" && (
        <>
          <AccountScopeForm />
          <NotificationPreferences />
        </>
      )}
      {tab === "Audit" && (
        <div className="panel table-wrap">
          <PresentationTable>
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
          </PresentationTable>
        </div>
      )}
      {tab === "Health" && <NotificationJobs />}
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
            `Team created. Open Accounts to select it when inviting members. Reference: ${t.id}`,
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
