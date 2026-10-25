ALTER TABLE organizations ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE TABLE sms_delivery_receipts (
  provider_id text NOT NULL,
  outcome text NOT NULL CHECK(outcome IN('DELIVERED','FAILED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider_id,outcome)
);
CREATE INDEX notification_provider ON notification_attempts(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX incident_recent ON incidents(created_at DESC);
CREATE INDEX history_incident_status ON incident_status_history(incident_id,to_status,created_at);
