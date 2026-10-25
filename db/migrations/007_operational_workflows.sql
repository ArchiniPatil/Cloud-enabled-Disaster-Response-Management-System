ALTER TABLE incidents ADD COLUMN people_affected integer CHECK(people_affected BETWEEN 1 AND 1000000);
ALTER TABLE incidents ADD COLUMN hazards text NOT NULL DEFAULT '' CHECK(length(hazards)<=1000);
ALTER TABLE incidents ADD COLUMN location_accuracy_m double precision CHECK(location_accuracy_m BETWEEN 0 AND 100000);
CREATE TABLE incident_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents,
 actor_id uuid NOT NULL REFERENCES user_profiles, body text NOT NULL CHECK(length(body) BETWEEN 3 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_updates_recent ON incident_updates(incident_id,created_at);
CREATE TRIGGER immutable_incident_updates BEFORE UPDATE OR DELETE ON incident_updates FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
ALTER TABLE incident_assignments ADD COLUMN outcome_note text NOT NULL DEFAULT '';
ALTER TABLE notification_jobs DROP CONSTRAINT notification_jobs_channel_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_channel_check CHECK(channel IN('IN_APP','SMS','EMAIL'));
ALTER TABLE notification_jobs DROP CONSTRAINT notification_jobs_status_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_status_check CHECK(status IN('PENDING','AVAILABLE','SUBMITTED','DELIVERED','FAILED','UNKNOWN','SIMULATED'));
ALTER TABLE user_profiles ADD COLUMN email_notifications boolean NOT NULL DEFAULT false;
CREATE INDEX incidents_priority ON incidents(severity,status,created_at);
