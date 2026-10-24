import { config } from "../apps/api/src/config.js";
import { pool, transaction } from "../apps/api/src/db.js";
if (config.AUTH_MODE !== "demo" || config.NODE_ENV === "production")
  throw new Error("Demo seed requires AUTH_MODE=demo outside production");
await transaction(async (db) => {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('demo-seed'))");
  const depNames = [
    "Medical / Ambulance",
    "Fire and Rescue",
    "Flood / Water Rescue",
    "Police / Security",
    "Search and Rescue",
    "Hazardous Materials",
    "Disaster Management",
    "Infrastructure / Utilities",
  ];
  const deps: Record<string, string> = {};
  for (const name of depNames)
    deps[name] = (
      await db.query(
        "INSERT INTO departments(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",
        [name],
      )
    ).rows[0].id;
  const jurisdiction = (
    await db.query(
      "INSERT INTO jurisdictions(name,boundary) VALUES('Mumbai demo area',ST_Multi(ST_MakeEnvelope(72.7,18.8,73.1,19.4,4326))) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",
    )
  ).rows[0].id;
  const org = (
    await db.query(
      "INSERT INTO organizations(name) VALUES('Demonstration response organization') ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",
    )
  ).rows[0].id;
  const categories: [string, string, boolean, string[], string[]][] = [
    [
      "MEDICAL",
      "Medical emergency",
      true,
      ["Medical / Ambulance"],
      ["FIRST_AID"],
    ],
    ["FIRE", "Fire", false, ["Fire and Rescue"], ["FIRE"]],
    [
      "FLOOD",
      "Flood or drowning",
      false,
      ["Flood / Water Rescue"],
      ["WATER_RESCUE"],
    ],
    ["TRAPPED", "Trapped person", true, ["Search and Rescue"], ["SEARCH"]],
    [
      "COLLAPSE",
      "Building collapse",
      false,
      ["Search and Rescue", "Fire and Rescue"],
      ["SEARCH"],
    ],
    [
      "ROAD_ACCIDENT",
      "Road accident",
      true,
      ["Medical / Ambulance", "Police / Security"],
      [],
    ],
    [
      "VIOLENCE",
      "Violence or security threat",
      true,
      ["Police / Security"],
      [],
    ],
    [
      "LANDSLIDE",
      "Landslide or earthquake",
      false,
      ["Search and Rescue"],
      ["SEARCH"],
    ],
    ["CHEMICAL", "Chemical hazard", true, ["Hazardous Materials"], ["HAZMAT"]],
    [
      "MISSING",
      "Missing or stranded person",
      true,
      ["Search and Rescue", "Police / Security"],
      [],
    ],
    [
      "BUILDING_DAMAGE",
      "Building damage",
      false,
      ["Infrastructure / Utilities"],
      [],
    ],
    ["BLOCKED_ROAD", "Blocked road", false, ["Infrastructure / Utilities"], []],
    [
      "POWER_OUTAGE",
      "Infrastructure or power outage",
      false,
      ["Infrastructure / Utilities"],
      [],
    ],
    ["PUBLIC_SAFETY", "Public safety concern", true, ["Police / Security"], []],
    ["OTHER", "Other emergency or incident", true, ["Disaster Management"], []],
  ];
  for (const [code, label, sensitive, departments, caps] of categories) {
    await db.query(
      "INSERT INTO categories(code,label,sensitive,required_capabilities) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [code, label, sensitive, caps],
    );
    for (const d of departments)
      await db.query(
        "INSERT INTO category_departments VALUES($1,$2) ON CONFLICT DO NOTHING",
        [code, deps[d]],
      );
  }
  await db.query(
    "INSERT INTO escalation_policies(name) VALUES('Demonstration 5/10/25 km') ON CONFLICT DO NOTHING",
  );
  const users: Record<string, string> = {};
  for (const [email, name, role] of [
    ["citizen@demo.invalid", "Aarav — Demo citizen", "CITIZEN"],
    ["authority@demo.invalid", "Meera — Demo dispatcher", "AUTHORITY"],
    ["rescuer@demo.invalid", "Samir — Demo responder", "RESCUER"],
    ["admin@demo.invalid", "Demo administrator", "ADMIN"],
  ]) {
    users[role] = (
      await db.query(
        "INSERT INTO user_profiles(cognito_sub,email,name,role,department_id,jurisdiction_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING id",
        [
          `demo:${role}`,
          email,
          name,
          role,
          role === "CITIZEN" ? null : deps["Medical / Ambulance"],
          role === "CITIZEN" ? null : jurisdiction,
        ],
      )
    ).rows[0].id;
  }
  for (const p of ["DISPATCH", "ANNOUNCE"])
    await db.query(
      "INSERT INTO user_permissions VALUES($1,$2) ON CONFLICT DO NOTHING",
      [users.AUTHORITY, p],
    );
  let team = (
    await db.query("SELECT id FROM rescue_teams WHERE name='Medic 01 — Demo'")
  ).rows[0];
  if (!team)
    team = (
      await db.query(
        "INSERT INTO rescue_teams(name,organization_id,department_id,jurisdiction_id,vehicle) VALUES('Medic 01 — Demo',$1,$2,$3,'Demonstration ambulance') RETURNING id",
        [org, deps["Medical / Ambulance"], jurisdiction],
      )
    ).rows[0];
  await db.query(
    "INSERT INTO team_memberships VALUES($1,$2) ON CONFLICT DO NOTHING",
    [team.id, users.RESCUER],
  );
  await db.query(
    "INSERT INTO team_capabilities VALUES($1,'FIRST_AID',NULL) ON CONFLICT DO NOTHING",
    [team.id],
  );
  if (
    !(await db.query("SELECT 1 FROM resources WHERE name='Demo medical kits'"))
      .rowCount
  )
    await db.query(
      "INSERT INTO resources(name,type,department_id,team_id,quantity,jurisdiction_id) VALUES('Demo medical kits','MEDICAL_KIT',$1,$2,10,$3)",
      [deps["Medical / Ambulance"], team.id, jurisdiction],
    );
});
console.log(
  "Demo catalog and four labeled local identities prepared. No live incidents or locations fabricated.",
);
await pool.end();
