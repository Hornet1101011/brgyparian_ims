/**
 * Settings Lock Helper - Manages soft locking for settings to prevent concurrent edits
 * 
 * Architecture:
 * - Soft locks stored in DB (not file-based)
 * - Lock timeout: configurable, defaults to 5 minutes
 * - Auto-release on save or timeout
 * - Provides status checks for other admins
 */

const SystemSetting = require('../models/SystemSetting');

// Default lock timeout in milliseconds (5 minutes)
const DEFAULT_LOCK_TIMEOUT = 5 * 60 * 1000;

/**
 * Acquire a lock on settings for editing
 * @param {string} userId - ID of the admin acquiring the lock
 * @param {string} userName - Display name of the admin
 * @returns {Promise<{success: boolean, locked: boolean, lockOwner: string, message: string}>}
 */
async function acquireLock(userId, userName) {
  try {
    const settings = await SystemSetting.findOne();
    
    if (!settings) {
      return {
        success: false,
        locked: false,
        message: 'Settings not found'
      };
    }

    const now = new Date();
    const lockTimeout = DEFAULT_LOCK_TIMEOUT;

    // Check if there's an existing lock
    if (settings.settingsLock?.isLocked) {
        const lockAge = now - settings.settingsLock.lockedAt;

        // If the current user already owns the lock, treat this as idempotent
        // and extend the lock timestamp so UI keep-alive/reacquire calls succeed.
        if (settings.settingsLock.lockedBy === userId) {
          try {
            await SystemSetting.updateOne(
              { _id: settings._id },
              { $set: { 'settingsLock.lockedAt': now } }
            );
          } catch (err) {
            console.warn('[SettingsLock] Failed to refresh lock timestamp for owner', userId, err);
          }

          return {
            success: true,
            locked: true,
            lockOwner: userName,
            message: 'You already hold the lock; refreshed timestamp'
          };
        }

        // If lock is expired, allow takeover
        if (lockAge > lockTimeout) {
        console.log(`[SettingsLock] Lock expired (age: ${lockAge}ms, timeout: ${lockTimeout}ms), allowing takeover`, {
          previousOwner: settings.settingsLock.lockedBy,
          newOwner: userId
        });
        
        // Release expired lock and acquire new one
        await SystemSetting.updateOne(
          { _id: settings._id },
          {
            $set: {
              'settingsLock.isLocked': true,
              'settingsLock.lockedBy': userId,
              'settingsLock.lockedAt': now,
              'settingsLock.lockOwnerName': userName
            }
          }
        );

        return {
          success: true,
          locked: true,
          lockOwner: userName,
          previousLockExpired: true,
          message: 'Lock acquired (previous lock expired)'
        };
      }

      // Lock is still active
      const minutesRemaining = Math.ceil((lockTimeout - lockAge) / 1000 / 60);
      return {
        success: false,
        locked: true,
        lockOwner: settings.settingsLock.lockOwnerName || settings.settingsLock.lockedBy,
        lockedAt: settings.settingsLock.lockedAt,
        minutesRemaining,
        message: `Settings are locked by ${settings.settingsLock.lockOwnerName || 'another admin'} (expires in ${minutesRemaining} minutes)`
      };
    }

    // No existing lock, acquire one
    await SystemSetting.updateOne(
      { _id: settings._id },
      {
        $set: {
          'settingsLock.isLocked': true,
          'settingsLock.lockedBy': userId,
          'settingsLock.lockedAt': now,
          'settingsLock.lockOwnerName': userName
        }
      }
    );

    console.log(`[SettingsLock] Lock acquired by ${userName} (${userId})`);

    return {
      success: true,
      locked: true,
      lockOwner: userName,
      message: 'Lock acquired successfully'
    };
  } catch (err) {
    console.error('[SettingsLock] Error acquiring lock:', err);
    return {
      success: false,
      locked: false,
      message: 'Error acquiring lock'
    };
  }
}

/**
 * Release a lock on settings
 * @param {string} userId - ID of the admin releasing the lock (must own the lock)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function releaseLock(userId) {
  try {
    const settings = await SystemSetting.findOne();
    
    if (!settings) {
      return {
        success: false,
        message: 'Settings not found'
      };
    }

    // Check if user owns the lock
    if (!settings.settingsLock?.isLocked) {
      return {
        success: false,
        message: 'No active lock to release'
      };
    }

    if (settings.settingsLock.lockedBy !== userId) {
      console.warn(`[SettingsLock] User ${userId} attempted to release lock owned by ${settings.settingsLock.lockedBy}`);
      return {
        success: false,
        message: 'You do not own this lock'
      };
    }

    // Release the lock
    await SystemSetting.updateOne(
      { _id: settings._id },
      {
        $set: {
          'settingsLock.isLocked': false,
          'settingsLock.lockedBy': null,
          'settingsLock.lockedAt': null,
          'settingsLock.lockOwnerName': null
        }
      }
    );

    console.log(`[SettingsLock] Lock released by ${userId}`);

    return {
      success: true,
      message: 'Lock released successfully'
    };
  } catch (err) {
    console.error('[SettingsLock] Error releasing lock:', err);
    return {
      success: false,
      message: 'Error releasing lock'
    };
  }
}

/**
 * Get current lock status
 * @returns {Promise<{isLocked: boolean, lockedBy: string, lockOwner: string, lockedAt: Date, minutesRemaining: number, canEdit: boolean}>}
 */
async function getLockStatus(userId) {
  try {
    const settings = await SystemSetting.findOne();
    
    if (!settings) {
      return {
        isLocked: false,
        lockedBy: null,
        lockOwner: null,
        canEdit: true,
        message: 'Settings not found'
      };
    }

    const now = new Date();
    const lockTimeout = DEFAULT_LOCK_TIMEOUT;

    // Check if lock exists and is still valid
    if (settings.settingsLock?.isLocked) {
      const lockAge = now - settings.settingsLock.lockedAt;

      if (lockAge > lockTimeout) {
        // Lock expired
        console.log(`[SettingsLock] Lock expired in status check`);
        return {
          isLocked: false,
          lockedBy: null,
          lockOwner: null,
          lockedAt: settings.settingsLock.lockedAt,
          canEdit: true,
          lockExpired: true,
          message: 'Previous lock has expired'
        };
      }

      const minutesRemaining = Math.ceil((lockTimeout - lockAge) / 1000 / 60);
      const canEdit = settings.settingsLock.lockedBy === userId;

      return {
        isLocked: true,
        lockedBy: settings.settingsLock.lockedBy,
        lockOwner: settings.settingsLock.lockOwnerName || 'Unknown Admin',
        lockedAt: settings.settingsLock.lockedAt,
        minutesRemaining,
        canEdit,
        message: canEdit 
          ? 'You have the lock' 
          : `Settings locked by ${settings.settingsLock.lockOwnerName || 'another admin'}`
      };
    }

    return {
      isLocked: false,
      lockedBy: null,
      lockOwner: null,
      canEdit: true,
      message: 'Settings are not locked'
    };
  } catch (err) {
    console.error('[SettingsLock] Error getting lock status:', err);
    return {
      isLocked: false,
      lockedBy: null,
      lockOwner: null,
      canEdit: true,
      message: 'Error checking lock status'
    };
  }
}

/**
 * Force release a lock (for admin override)
 * @param {string} adminUserId - ID of admin forcing the release
 * @returns {Promise<{success: boolean, message: string, previousOwner: string}>}
 */
async function forceReleaseLock(adminUserId) {
  try {
    const settings = await SystemSetting.findOne();
    
    if (!settings) {
      return {
        success: false,
        message: 'Settings not found'
      };
    }

    if (!settings.settingsLock?.isLocked) {
      return {
        success: false,
        message: 'No active lock to force release'
      };
    }

    const previousOwner = settings.settingsLock.lockOwnerName || settings.settingsLock.lockedBy;

    await SystemSetting.updateOne(
      { _id: settings._id },
      {
        $set: {
          'settingsLock.isLocked': false,
          'settingsLock.lockedBy': null,
          'settingsLock.lockedAt': null,
          'settingsLock.lockOwnerName': null
        }
      }
    );

    console.log(`[SettingsLock] Lock force-released by admin ${adminUserId}, previous owner: ${previousOwner}`);

    return {
      success: true,
      message: `Lock released (was held by ${previousOwner})`,
      previousOwner
    };
  } catch (err) {
    console.error('[SettingsLock] Error force-releasing lock:', err);
    return {
      success: false,
      message: 'Error force-releasing lock'
    };
  }
}

module.exports = {
  acquireLock,
  releaseLock,
  getLockStatus,
  forceReleaseLock,
  DEFAULT_LOCK_TIMEOUT
};
