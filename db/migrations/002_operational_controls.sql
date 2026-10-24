ALTER TABLE resources ADD COLUMN jurisdiction_id uuid REFERENCES jurisdictions;
UPDATE resources r SET jurisdiction_id=t.jurisdiction_id FROM rescue_teams t WHERE r.team_id=t.id;
ALTER TABLE escalation_executions ADD COLUMN force_review boolean NOT NULL DEFAULT false;
CREATE TABLE runtime_heartbeats(name text PRIMARY KEY,last_seen timestamptz NOT NULL);
