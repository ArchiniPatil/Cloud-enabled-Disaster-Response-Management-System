ALTER TABLE incidents ADD COLUMN response_cycle_started_at timestamptz NOT NULL DEFAULT now();
UPDATE incidents SET response_cycle_started_at=created_at;
ALTER TABLE escalation_executions ADD COLUMN policy_stage integer CHECK(policy_stage>=0);
