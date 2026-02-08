/**
 * Email Health Check Job
 * Periodically checks email provider connectivity and updates status
 * Runs every hour or on custom interval
 */

const emailProviderHelper = require('../utils/emailProviderHelper');

let healthCheckInterval = null;
let isRunning = false;

/**
 * Start the periodic health check job
 * @param {number} [intervalMs=3600000] - Interval in milliseconds (default: 1 hour)
 */
function startHealthCheckJob(intervalMs = 3600000) {
  if (healthCheckInterval) {
    console.log('[EmailHealthCheckJob] Job already running, skipping start');
    return;
  }

  console.log('[EmailHealthCheckJob] Starting periodic email health check job');
  console.log('[EmailHealthCheckJob] Check interval: ' + (intervalMs / 1000 / 60) + ' minutes');

  // Run health check immediately on startup
  performHealthCheck();

  // Schedule periodic health checks
  healthCheckInterval = setInterval(() => {
    performHealthCheck();
  }, intervalMs);

  console.log('[EmailHealthCheckJob] Periodic health check scheduled');
}

/**
 * Stop the periodic health check job
 */
function stopHealthCheckJob() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log('[EmailHealthCheckJob] Health check job stopped');
  }
}

/**
 * Perform a single health check
 */
async function performHealthCheck() {
  if (isRunning) {
    console.log('[EmailHealthCheckJob] Health check already in progress, skipping');
    return;
  }

  try {
    isRunning = true;
    const startTime = Date.now();
    
    console.log('[EmailHealthCheckJob] Starting health check at', new Date().toISOString());

    // Get current settings
    const { SystemSetting } = require('../models/SystemSetting');
    if (!SystemSetting) {
      console.warn('[EmailHealthCheckJob] SystemSetting model not available');
      return;
    }

    const settings = await SystemSetting.findOne();
    if (!settings || !settings.smtp || !settings.smtp.enabled) {
      console.log('[EmailHealthCheckJob] Email provider not configured, skipping health check');
      return;
    }

    // Perform health check
    const healthResult = await emailProviderHelper.performHealthCheck(settings.smtp);

    // Update status in database
    await emailProviderHelper.updateHealthCheckStatus(
      healthResult.status,
      healthResult.error || null
    );

    const duration = Date.now() - startTime;
    console.log('[EmailHealthCheckJob] Health check completed', {
      provider: healthResult.provider,
      status: healthResult.status,
      durationMs: duration,
      timestamp: new Date().toISOString()
    });

    // Log warning if health check failed
    if (healthResult.status === 'failed') {
      console.warn('[EmailHealthCheckJob] Email provider health check FAILED:', {
        provider: healthResult.provider,
        error: healthResult.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('[EmailHealthCheckJob] Unexpected error during health check:', err.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Get job status
 */
function getJobStatus() {
  return {
    running: !!healthCheckInterval,
    isChecking: isRunning,
    lastCheck: null // Would need to track this if needed
  };
}

module.exports = {
  startHealthCheckJob,
  stopHealthCheckJob,
  performHealthCheck,
  getJobStatus
};
