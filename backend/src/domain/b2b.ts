// Org management, consent grants, and consent-scoped B2B score access.
// Every B2B read of a field is gated by a valid consent_grant and written to
// access_audit — the regulatory + trust backbone (docs/02 §4, docs/06 §5).
import { query } from '../db/pool.js';
import { scoreField } from './scoring.js';

export async function createOrg(input: { name: string; org_type: string; plan?: string }) {
  const r = await query<{ org_id: string; tenant_id: string }>(
    'INSERT INTO org (name, org_type, plan) VALUES ($1,$2,$3) RETURNING org_id, tenant_id',
    [input.name, input.org_type, input.plan ?? 'pilot'],
  );
  return r.rows[0];
}

export async function grantConsent(input: {
  field_id: string;
  org_id: string;
  scope: string[];
  valid_days?: number;
}) {
  const field = await query<{ farmer_id: string }>(
    'SELECT farmer_id FROM field WHERE field_id=$1',
    [input.field_id],
  );
  if (field.rowCount === 0) throw Object.assign(new Error('Field not found'), { statusCode: 404 });

  const r = await query<{ id: string; valid_until: string }>(
    `INSERT INTO consent_grant (field_id, farmer_id, org_id, scope, valid_until)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval)
     RETURNING id, valid_until`,
    [
      input.field_id,
      field.rows[0].farmer_id,
      input.org_id,
      input.scope,
      String(input.valid_days ?? 180),
    ],
  );
  return r.rows[0];
}

export async function revokeConsent(grantId: string) {
  const r = await query('UPDATE consent_grant SET revoked=true WHERE id=$1', [grantId]);
  if (r.rowCount === 0) throw Object.assign(new Error('Grant not found'), { statusCode: 404 });
  return { id: grantId, revoked: true };
}

async function hasConsent(fieldId: string, orgId: string, scope: string): Promise<boolean> {
  const r = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM consent_grant
        WHERE field_id=$1 AND org_id=$2 AND revoked=false
          AND (valid_until IS NULL OR valid_until > now())
          AND $3 = ANY(scope)
     ) AS ok`,
    [fieldId, orgId, scope],
  );
  return r.rows[0].ok;
}

async function audit(orgId: string, fieldId: string, action: string, scope: string) {
  await query(
    'INSERT INTO access_audit (org_id, actor, field_id, action, scope) VALUES ($1,$2,$3,$4,$5)',
    [orgId, 'b2b_api', fieldId, action, scope],
  );
}

/** B2B credit/risk read: enforce consent, (re)compute, audit, return explainable score. */
export async function b2bScore(orgId: string, fieldId: string, scope: 'credit' | 'farm_risk') {
  const ok = await hasConsent(fieldId, orgId, scope);
  if (!ok) {
    await audit(orgId, fieldId, 'denied', scope);
    throw Object.assign(new Error('No valid consent for this field/scope'), { statusCode: 403 });
  }
  const result = await scoreField(fieldId);
  await audit(orgId, fieldId, 'read', scope);
  return scope === 'credit'
    ? { field_id: fieldId, scope, model_version: result.model_version, ...result.credit }
    : { field_id: fieldId, scope, model_version: result.model_version, ...result.farm_risk };
}

export async function getAudit(fieldId: string) {
  const r = await query(
    'SELECT org_id, actor, action, scope, at FROM access_audit WHERE field_id=$1 ORDER BY at DESC LIMIT 100',
    [fieldId],
  );
  return r.rows;
}
