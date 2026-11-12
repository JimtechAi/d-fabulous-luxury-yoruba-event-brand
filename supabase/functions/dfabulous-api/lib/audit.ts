// Audit log writes (best effort, never blocks the main operation).
// Direct port of appendAuditLog from server.ts.
import { serviceClient } from './supabase.ts';
import { isServerDatabaseConfigured } from './env.ts';
import { formatError } from './validation.ts';

export async function appendAuditLog(entry: {
  actor_user_id: string | null;
  action: string;
  target_user_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isServerDatabaseConfigured) return;

  try {
    const { error } = await serviceClient()
      .from('audit_logs')
      .insert([
        {
          actor_user_id: entry.actor_user_id,
          action: entry.action,
          target_user_id: entry.target_user_id ?? null,
          metadata: entry.metadata ?? {},
          created_at: new Date().toISOString(),
        },
      ]);
    // supabase-js reports database errors in the result instead of throwing; never swallow them silently.
    if (error) console.warn('[Edge API] Audit log write rejected:', formatError(error));
  } catch (error) {
    console.warn('[Edge API] Audit log write failed:', formatError(error));
  }
}
