# User workflows

## Citizen

Production sign-in/registration goes through one Cognito managed page with verified email and TOTP MFA. Self-registration always creates a citizen profile. Local demo buttons are a development-only fixture, never a production role selector.

Need Help / Report Problem → category → automatic GPS or manual coordinates → optional description/address/photo → submit. A successful response means the platform saved the report. The screen separately shows acknowledgement, offered assignments, acceptance, dispatch authorization, en route, arrival and resolution. Failed photo upload does not discard an already saved incident.

My Reports contains only the citizen's own sensitive reports. Tracking is available only for their assigned teams during authorized operational states and active location sessions. Stale GPS and missing route calculation are explicit. Local Situation contains only authority-published, non-sensitive, approximately located reports. Profile & Settings contains logout.

## Authority

Administrator-provisioned account, department, jurisdiction and explicit DISPATCH/ANNOUNCE permissions. The inbox is limited by department and operating-area geometry. Review severity as an unverified report, acknowledge, examine possible duplicate candidates, verify or flag duplicates, offer eligible teams and authorize dispatch after team acceptance. Do not infer dispatch from an SMS status.

Manual escalation records another durable review. Resources can be allocated/released from the incident resource console or protected API with transactionally enforced limits. Authorities can publish Everyone notices or department/jurisdiction-restricted Authorities Only notices, with expiry and revision history. Notices can be corrected or withdrawn in the interface; revisions remain audited. Operational metrics show scoped recorded response milestones and inventory/team utilization.

## Rescue team

Multiple members can belong to a team. One active location source per team prevents conflicting GPS feeds. Start duty, then explicitly start location sharing; GPS denial has a visible failure. Keep the tracking screen open in its own tab while using another tab for assignments. Accept/decline offers, wait for authorization, then mark En Route, Arrived, In Progress and Completed. A team cannot authorize its own dispatch. Completion of all active assignments resolves an on-scene incident.

Leaving the sharing screen stops its watcher. End duty, logout, account suspension, assignment completion and session expiry also invalidate sharing. Capability/equipment problems can make a team unavailable; assistance requests create a forced escalation review. No team-wide map of unrelated responders is available.

## Administrator

There is no public admin registration endpoint. A controlled one-time CLI bootstrap promotes an already verified Cognito user with TOTP. Once an admin exists the bootstrap refuses to run again. Ordinary admin APIs cannot create another admin, alter an admin's status, or suspend the current admin.

Provision authority and rescue accounts through Cognito invitations. Configure departments, rectangular jurisdictions, teams, category matching, escalation policies, inventories and account activation. Suspend an account to immediately remove application sessions and active location sharing; Cognito disable/global-sign-out is also attempted and any synchronization failure is returned explicitly. Inspect audit and health screens before interpreting unavailable integrations as delivered notifications.

## Academic account and management additions

Use `ACADEMIC_DEMO.md` for actual Cognito registration, MFA, invitation acceptance, recovery and first-admin bootstrap. Demo-role buttons remain explicitly local fixtures. Organizations can be activated/deactivated, and idle teams have editable qualifications with expiry dates. Administrators can review notification attempts/retry definitive failures and publish verified shelter or resource locations; unpublished locations remain scoped. Citizens can search an address, choose a map pin, or use GPS/manual coordinates. Unconfigured providers return explicit unavailable states.
