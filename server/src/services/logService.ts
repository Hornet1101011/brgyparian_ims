import { Log } from '../models/Log';

/**
 * Save a staff activity log to MongoDB.
 * @param type - The type of activity (e.g., 'CREATE', 'UPDATE', 'DELETE', etc.)
 * @param message - A short description of the activity
 * @param details - Additional details about the activity
 * @param actor - The staff member who performed the activity
 * @param target - The target of the activity (optional)
 */
export async function saveStaffActivityLog({
  type,
  message,
  details,
  actor,
  target
}: {
  type: string;
  message: string;
  details: string;
  actor: string;
  target?: string;
}) {
  const log = new Log({
    type,
    message,
    details,
    actor,
    target
  });
  try {
    await log.save();
  } catch (err) {
    // Logging should never throw; swallow duplicate-key or other save errors
    try {
      const { handleSaveError } = require('../utils/handleSaveError');
      handleSaveError(err);
    } catch (e) {
      console.warn('logService.saveStaffActivityLog: failed to handle save error', e);
    }
    console.warn('Failed to save log (continuing):', err && (err as any).message ? (err as any).message : err);
  }
}
