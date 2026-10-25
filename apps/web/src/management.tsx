import { useState, type FormEvent, type ReactNode } from "react";
import { api, post, label } from "./api";
import { useData } from "./hooks";

type Option = { id: string; name: string };
export function ResourceLocationForm() {
  const resources = useData("/resources");
  return (
    <ManagedForm
      title="Resource location"
      submit={async (f) => {
        await api(`/admin/resources/${f.get("id")}/location`, {
          method: "PATCH",
          body: JSON.stringify({
            latitude:
              f.get("latitude") === "" ? null : Number(f.get("latitude")),
            longitude:
              f.get("longitude") === "" ? null : Number(f.get("longitude")),
            address: f.get("address"),
            publiclyListed: f.get("publiclyListed") === "on",
          }),
        });
      }}
    >
      <Options
        title="Resource or shelter inventory"
        name="id"
        items={resources.data?.items}
      />
      <div className="two-columns">
        <label>
          Resource latitude
          <input name="latitude" type="number" step="any" min={-90} max={90} />
        </label>
        <label>
          Resource longitude
          <input
            name="longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
          />
        </label>
      </div>
      <label>
        Site address
        <input name="address" maxLength={300} />
      </label>
      <label className="checkbox-label">
        <input name="publiclyListed" type="checkbox" />
        Publish this location for citizens
      </label>
      <p>
        Use verified sites only. Leaving both coordinates blank removes the
        location. Unpublished locations remain restricted by department,
        jurisdiction and team.
      </p>
    </ManagedForm>
  );
}
export function NotificationJobs() {
  const { data, error, reload } = useData("/admin/notification-jobs");
  const [failure, setFailure] = useState("");
  return (
    <section className="panel">
      <h2>Notification attempts</h2>
      <p>
        Delivery does not imply acknowledgement or dispatch. Unknown submissions
        cannot be retried automatically.
      </p>
      <button onClick={() => void reload()}>Refresh attempts</button>
      {(error || failure) && <p role="alert">{error || failure}</p>}
      {data?.items.map((j: any) => (
        <details key={j.id}>
          <summary>
            {label(j.channel)} · {label(j.status)} ·{" "}
            {new Date(j.created_at).toLocaleString()}
          </summary>
          {j.attempts.map((a: any, i: number) => (
            <p key={i}>
              {label(a.outcome)} · {new Date(a.at).toLocaleString()}
            </p>
          ))}
          {j.status === "FAILED" && (
            <button
              onClick={async () => {
                try {
                  await post(`/admin/notifications/${j.id}/retry`);
                  await reload();
                } catch (e) {
                  setFailure((e as Error).message);
                }
              }}
            >
              Retry failed notification
            </button>
          )}
        </details>
      ))}
    </section>
  );
}
export function OrganizationTeams() {
  const organizations = useData("/admin/organizations"),
    teams = useData("/admin/team-details");
  const [selected, setSelected] = useState("");
  const team = teams.data?.items.find((t: any) => t.id === selected);
  return (
    <section>
      <p role="alert">{organizations.error || teams.error}</p>
      <ManagedForm
        title="Organization"
        submit={async (f) => {
          await post("/admin/organizations", { name: f.get("name") });
          await organizations.reload();
        }}
      >
        <label>
          Organization name
          <input name="name" required minLength={2} maxLength={100} />
        </label>
      </ManagedForm>
      {organizations.data?.items.map((o: any) => (
        <ManagedForm
          key={o.id}
          title={`Organization: ${o.name}`}
          submit={async (f) => {
            await api(`/admin/organizations/${o.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                name: f.get("name"),
                active: f.get("active") === "on",
              }),
            });
            await organizations.reload();
            await teams.reload();
          }}
        >
          <label>
            Name
            <input
              name="name"
              defaultValue={o.name}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label className="checkbox-label">
            <input name="active" type="checkbox" defaultChecked={o.active} />
            Active organization
          </label>
          <p>
            {o.team_count} teams. Deactivation stops location sharing and is
            blocked while assignments remain active.
          </p>
        </ManagedForm>
      ))}
      <div className="panel">
        <h2>Team configuration and certifications</h2>
        <label>
          Choose a team
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select…</option>
            {teams.data?.items.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {team && (
          <ManagedForm
            key={team.id}
            title="Team configuration"
            submit={async (f) => {
              const capabilities = String(f.get("capabilities"))
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean)
                .map((line) => {
                  const [capability, date] = line
                    .split("|")
                    .map((v) => v.trim());
                  return {
                    capability,
                    expiresAt: date
                      ? new Date(`${date}T23:59:59Z`).toISOString()
                      : null,
                  };
                });
              await api(`/admin/teams/${team.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  name: f.get("name"),
                  organizationId: f.get("organizationId") || null,
                  vehicle: f.get("vehicle"),
                  capacity: Number(f.get("capacity")),
                  capabilities,
                }),
              });
              await teams.reload();
            }}
          >
            <label>
              Team name
              <input name="name" defaultValue={team.name} required />
            </label>
            <Options
              name="organizationId"
              title="Organization"
              optional
              items={organizations.data?.items.filter((o: any) => o.active)}
              defaultValue={team.organization_id ?? ""}
            />
            <label>
              Vehicle
              <input name="vehicle" defaultValue={team.vehicle ?? ""} />
            </label>
            <label>
              Concurrent assignments
              <input
                name="capacity"
                type="number"
                min={1}
                max={5}
                defaultValue={team.capacity}
              />
            </label>
            <label>
              Capabilities and expiry dates
              <textarea
                name="capabilities"
                defaultValue={team.capabilities
                  .map(
                    (c: any) =>
                      `${c.capability}${c.expiresAt ? " | " + c.expiresAt.slice(0, 10) : ""}`,
                  )
                  .join("\n")}
              />
            </label>
            <p>
              One per line, for example FIRST_AID | 2027-06-30. Leave the date
              off for a capability without expiry. Expired qualifications
              prevent matching. Finish or cancel active assignments before
              editing.
            </p>
            <h3>Members</h3>
            {team.members.length ? (
              team.members.map((m: any) => (
                <p key={m.id}>
                  {m.name} · {label(m.status)}
                </p>
              ))
            ) : (
              <p>No members. Invite a rescuer from Accounts.</p>
            )}
          </ManagedForm>
        )}
      </div>
    </section>
  );
}
export function NotificationPreferences() {
  const users = useData("/admin/notification-config");
  return (
    <ManagedForm
      title="Notification recipient"
      submit={async (f) => {
        await api(`/admin/users/${f.get("id")}/notification-preferences`, {
          method: "PATCH",
          body: JSON.stringify({
            phone: f.get("phone") || null,
            smsEnabled: f.get("smsEnabled") === "on",
          }),
        });
        await users.reload();
      }}
    >
      <Options
        name="id"
        title="Operational account"
        items={users.data?.recipients}
      />
      <label>
        Approved test phone number
        <input
          name="phone"
          type="tel"
          placeholder="+countrycode…"
          pattern="\+[1-9][0-9]{7,14}"
        />
      </label>
      <label className="checkbox-label">
        <input name="smsEnabled" type="checkbox" />
        Opt in to operational SMS
      </label>
      <p>
        This replaces the recipient's phone preference. Sending remains disabled
        until the deployment-wide SMS setting and AWS sandbox destination
        approval are configured. In-app notifications work independently.
      </p>
    </ManagedForm>
  );
}
function Options({
  name,
  title,
  items,
  optional = false,
  defaultValue,
}: {
  name: string;
  title: string;
  items?: Option[];
  optional?: boolean;
  defaultValue?: string;
}) {
  return (
    <label>
      {title}
      <select
        name={name}
        required={!optional}
        defaultValue={defaultValue ?? ""}
      >
        <option value="">{optional ? "None" : "Select…"}</option>
        {items?.map((x) => (
          <option value={x.id} key={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function ManagedForm({
  title,
  children,
  submit,
}: {
  title: string;
  children: ReactNode;
  submit: (f: FormData) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await submit(new FormData(e.currentTarget));
      setMessage("Saved successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={save}>
      <h2>{title}</h2>
      {children}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : `Save ${title.toLowerCase()}`}
      </button>
    </form>
  );
}
export function ManagementPanels() {
  const catalog = useData("/catalog"),
    resources = useData("/resources"),
    teams = useData("/teams"),
    notifications = useData("/admin/notification-config");
  const [resourceId, setResourceId] = useState("");
  const resource = resources.data?.items.find((r: any) => r.id === resourceId);
  return (
    <>
      <div className="two-columns">
        <ManagedForm
          title="Department"
          submit={async (f) => {
            await post("/admin/departments", { name: f.get("name") });
            await catalog.reload();
          }}
        >
          <label>
            Department name
            <input name="name" required minLength={2} maxLength={100} />
          </label>
        </ManagedForm>
        <ManagedForm
          title="Jurisdiction"
          submit={async (f) => {
            await post("/admin/jurisdictions", {
              name: f.get("name"),
              west: Number(f.get("west")),
              south: Number(f.get("south")),
              east: Number(f.get("east")),
              north: Number(f.get("north")),
            });
            await catalog.reload();
          }}
        >
          <label>
            Operating area name
            <input name="name" required minLength={2} />
          </label>
          <p className="muted">
            Define a rectangular operating area. Longitude runs west to east;
            latitude south to north.
          </p>
          <div className="two-columns">
            {["west", "south", "east", "north"].map((n) => (
              <label key={n}>
                {label(n)} boundary
                <input
                  type="number"
                  step="any"
                  name={n}
                  required
                  min={["west", "east"].includes(n) ? -180 : -90}
                  max={["west", "east"].includes(n) ? 180 : 90}
                />
              </label>
            ))}
          </div>
        </ManagedForm>
      </div>
      <ManagedForm
        title="Category routing"
        submit={async (f) => {
          await api(`/admin/categories/${f.get("code")}`, {
            method: "PUT",
            body: JSON.stringify({
              label: f.get("label"),
              sensitive: f.get("sensitive") === "on",
              departmentIds: f.getAll("departments"),
              requiredCapabilities: String(f.get("capabilities"))
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }),
          });
          await catalog.reload();
        }}
      >
        <div className="two-columns">
          <label>
            Category code
            <input
              name="code"
              required
              pattern="[A-Z_]{2,60}"
              placeholder="FIRE"
              list="category-codes"
            />
            <datalist id="category-codes">
              {catalog.data?.categories.map((c: any) => (
                <option value={c.code} key={c.code}>
                  {c.label}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            Display label
            <input name="label" minLength={2} maxLength={100} required />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" name="sensitive" defaultChecked />
          Sensitive: prohibit publication in the local situation feed
        </label>
        <fieldset>
          <legend>Responsible departments</legend>
          <div className="two-columns">
            {catalog.data?.departments.map((d: Option) => (
              <label className="checkbox-label" key={d.id}>
                <input type="checkbox" name="departments" value={d.id} />
                {d.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Required qualifications / equipment capabilities
          <input
            name="capabilities"
            placeholder="FIRST_AID, SEARCH (comma separated)"
          />
        </label>
        <p className="muted">
          These rules affect new incidents. Previously routed reports keep their
          audited departmental routing.
        </p>
      </ManagedForm>
      <ManagedForm
        title="Resource"
        submit={async (f) => {
          await post("/admin/resources", {
            name: f.get("name"),
            type: f.get("type"),
            departmentId: f.get("departmentId"),
            jurisdictionId: f.get("jurisdictionId"),
            ...(f.get("teamId") ? { teamId: f.get("teamId") } : {}),
            quantity: Number(f.get("quantity")),
          });
          await resources.reload();
        }}
      >
        <div className="two-columns">
          <label>
            Resource name
            <input name="name" required minLength={2} />
          </label>
          <label>
            Resource type
            <select name="type">
              {[
                "AMBULANCE",
                "FIRE_ENGINE",
                "RESCUE_BOAT",
                "SEARCH_EQUIPMENT",
                "MEDICAL_KIT",
                "SHELTER_CAPACITY",
                "FOOD",
                "WATER",
                "OTHER",
              ].map((t) => (
                <option value={t} key={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </label>
          <Options
            title="Assigned department"
            name="departmentId"
            items={catalog.data?.departments}
          />
          <Options
            title="Operating jurisdiction"
            name="jurisdictionId"
            items={catalog.data?.jurisdictions}
          />
          <Options
            title="Assigned team"
            name="teamId"
            items={teams.data?.items}
            optional
          />
          <label>
            Quantity / capacity
            <input
              name="quantity"
              type="number"
              min={0}
              max={100000}
              defaultValue={1}
              required
            />
          </label>
        </div>
      </ManagedForm>
      <div className="panel">
        <h2>Update inventory availability</h2>
        <label>
          Select resource
          <select
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
          >
            <option value="">Select…</option>
            {resources.data?.items.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {resource && (
          <ManagedForm
            title="Inventory status"
            key={resourceId}
            submit={async (f) => {
              await api(`/admin/resources/${resourceId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: f.get("status"),
                  quantity: Number(f.get("quantity")),
                }),
              });
              await resources.reload();
            }}
          >
            <p>
              {resource.allocated} currently allocated. Release allocations
              before taking this resource offline.
            </p>
            <label>
              Status
              <select name="status" defaultValue={resource.status}>
                <option>AVAILABLE</option>
                <option>MAINTENANCE</option>
                <option>UNAVAILABLE</option>
              </select>
            </label>
            <label>
              Total quantity
              <input
                name="quantity"
                type="number"
                min={0}
                defaultValue={resource.quantity}
              />
            </label>
          </ManagedForm>
        )}
      </div>
      <div className="panel">
        <h2>Notification configuration</h2>
        <p>
          SMS sending:{" "}
          <strong>
            {notifications.data?.smsEnabled ? "Enabled" : "Disabled"}
          </strong>
        </p>
        <p className="muted">
          Enabling live SMS requires an approved provider role, registered
          sender/templates, spend limit and verified test recipients. Provider
          acceptance is not delivery.
        </p>
        {notifications.data?.recipients.map((r: any) => (
          <div className="health-row" key={r.id}>
            <span>{r.name}</span>
            <small>
              {r.sms_enabled ? "SMS opted in" : "In-app only"} ·{" "}
              {r.phone_configured ? "Phone configured" : "No phone configured"}
            </small>
          </div>
        ))}
      </div>
    </>
  );
}
export function AccountScopeForm() {
  const users = useData("/admin/users"),
    catalog = useData("/catalog"),
    teams = useData("/teams");
  const [id, setId] = useState("");
  const u = users.data?.items.find((x: any) => x.id === id);
  return (
    <section className="panel">
      <h2>Department, jurisdiction & permissions</h2>
      <p className="muted">
        Changing organizational access revokes existing sessions and location
        sharing. Administrator accounts cannot be modified here.
      </p>
      <label>
        Operational account
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Select…</option>
          {users.data?.items
            .filter((x: any) => x.role !== "ADMIN" && x.role !== "CITIZEN")
            .map((x: any) => (
              <option value={x.id} key={x.id}>
                {x.name} · {label(x.role)}
              </option>
            ))}
        </select>
      </label>
      {u && (
        <ManagedForm
          key={id}
          title="Account scope"
          submit={async (f) => {
            await api(`/admin/users/${id}/organization`, {
              method: "PATCH",
              body: JSON.stringify({
                departmentId: f.get("departmentId"),
                jurisdictionId: f.get("jurisdictionId"),
                ...(f.get("teamId") ? { teamId: f.get("teamId") } : {}),
                supervisorId: f.get("supervisorId") || null,
                permissions: f.getAll("permissions"),
              }),
            });
            await users.reload();
          }}
        >
          <div className="two-columns">
            <Options
              title="New department"
              name="departmentId"
              items={catalog.data?.departments}
              defaultValue={u.department_id}
            />
            <Options
              title="New jurisdiction"
              name="jurisdictionId"
              items={catalog.data?.jurisdictions}
              defaultValue={u.jurisdiction_id}
            />
            {u.role === "RESCUER" && (
              <Options
                title="Team membership"
                name="teamId"
                items={teams.data?.items}
                defaultValue={u.team_id}
              />
            )}
            <Options
              title="Supervisor"
              name="supervisorId"
              optional
              items={users.data?.items.filter(
                (x: any) =>
                  x.id !== id && ["AUTHORITY", "ADMIN"].includes(x.role),
              )}
              defaultValue={u.supervisor_id ?? ""}
            />
          </div>
          {u.role === "AUTHORITY" && (
            <fieldset>
              <legend>Allowed operational actions</legend>
              {["DISPATCH", "ANNOUNCE"].map((p) => (
                <label className="checkbox-label" key={p}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p}
                    defaultChecked={u.permissions?.includes(p)}
                  />
                  {label(p)}
                </label>
              ))}
            </fieldset>
          )}
        </ManagedForm>
      )}
    </section>
  );
}
export function ResourceConsole({ incidentId }: { incidentId: string }) {
  const resources = useData("/resources"),
    allocations = useData(`/incidents/${incidentId}/resource-allocations`);
  const [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>Incident resources</h2>
      <ManagedForm
        title="Resource allocation"
        submit={async (f) => {
          await post(`/resources/${f.get("resourceId")}/allocate`, {
            incidentId,
            quantity: Number(f.get("quantity")),
          });
          await allocations.reload();
          await resources.reload();
        }}
      >
        <Options
          title="Available inventory"
          name="resourceId"
          items={resources.data?.items
            .filter(
              (r: any) => r.status === "AVAILABLE" && r.quantity > r.allocated,
            )
            .map((r: any) => ({
              id: r.id,
              name: `${r.name} · ${r.quantity - r.allocated} remaining`,
            }))}
        />
        <label>
          Quantity
          <input name="quantity" type="number" min={1} defaultValue={1} />
        </label>
      </ManagedForm>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {allocations.data?.items.map((a: any) => (
        <div className="allocation-row" key={a.id}>
          <span>
            {a.name} × {a.quantity}
          </span>
          {a.released_at ? (
            <small>Released</small>
          ) : (
            <button
              onClick={async () => {
                try {
                  await post(`/resources/allocations/${a.id}/release`);
                  await allocations.reload();
                  await resources.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Release
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
export function EvidenceList({
  items,
}: {
  items: {
    id: string;
    content_type: string;
    size_bytes: number;
    status: string;
  }[];
}) {
  const [error, setError] = useState("");
  if (!items.length) return null;
  return (
    <section className="panel">
      <h2>Incident evidence</h2>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {items.map((e, n) => (
        <div className="allocation-row" key={e.id}>
          <span>
            Attachment {n + 1} · {Math.ceil(e.size_bytes / 1024)} KB ·{" "}
            {label(e.status)}
          </span>
          {e.status === "AVAILABLE" && (
            <button
              onClick={async () => {
                try {
                  const r = await api(`/evidence/${e.id}`);
                  window.location.assign(r.url);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Download photograph
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
