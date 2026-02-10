import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const RELAY_PIN = Number(process.env.RELAY_GPIO_PIN ?? 17);
const UNLOCK_DURATION_MS = 8000;

// Mutex lock to prevent concurrent unlock attempts
let isUnlocking = false;
let unlockUntil = null;

/**
 * Pulse the relay to unlock the door
 * @param {number} durationMs - Duration in milliseconds
 * @returns {Promise<{success: boolean, simulated: boolean}>}
 */
async function pulseRelay(durationMs) {
	try {
		const startTime = Date.now();
		
		await execFileAsync(
			"gpioset",
			[
				"-c", "gpiochip0",
				"--hold-period", `${durationMs}ms`,
				`${RELAY_PIN}=1`,
			],
			{ timeout: durationMs + 1000 } // Add 1s buffer for command timeout
		);

		// Calculate actual unlock time based on when command started
		const executionTime = Date.now() - startTime;
		unlockUntil = startTime + durationMs;
		
		console.log(`[GPIO] door unlocked for ${durationMs}ms (execution took ${executionTime}ms)`);
		return { success: true, simulated: false };
	} catch (err) {
		console.warn(
			"[GPIO] gpioset failed, falling back to simulation:",
			err?.message ?? err
		);
		
		// Fallback to simulation mode
		unlockUntil = Date.now() + durationMs;
		
		// Simulate the unlock duration
		await new Promise(resolve => setTimeout(resolve, durationMs));
		
		return { success: true, simulated: true };
	}
}

/**
 * Unlock the door with mutex lock to prevent race conditions
 * @param {Object} options - Options for unlocking
 * @param {string} options.userId - User ID for logging
 * @param {string} options.source - Source of unlock request (web/discord)
 * @returns {Promise<{success: boolean, duration: number, simulated: boolean, message?: string}>}
 */
export async function unlockDoor({ userId, source } = {}) {
	// Check if already unlocking (mutex lock)
	if (isUnlocking) {
		const timeRemaining = unlockUntil ? Math.max(0, unlockUntil - Date.now()) : 0;
		console.log(`[LOCK] unlock rejected - already unlocking (${timeRemaining}ms remaining)`);
		return {
			success: false,
			duration: 0,
			simulated: false,
			message: "Door is already unlocking",
			timeRemaining
		};
	}

	// Acquire lock
	isUnlocking = true;

	try {
		console.log(`[LOCK] unlock started by user ${userId} via ${source}`);
		
		const result = await pulseRelay(UNLOCK_DURATION_MS);
		
		return {
			success: true,
			duration: UNLOCK_DURATION_MS,
			simulated: result.simulated,
			startTime: Date.now()
		};
	} catch (error) {
		console.error("[LOCK] unlock failed:", error);
		throw error;
	} finally {
		// Release lock after duration completes
		setTimeout(() => {
			isUnlocking = false;
			unlockUntil = null;
			console.log("[LOCK] unlock cycle completed, lock released");
		}, UNLOCK_DURATION_MS);
	}
}

/**
 * Get current door lock status
 * @returns {Object} Status object
 */
export function getDoorStatus() {
	const now = Date.now();
	const stillUnlocking = unlockUntil && now < unlockUntil;
	const timeRemaining = stillUnlocking ? unlockUntil - now : 0;

	return {
		unlocking: isUnlocking,
		unlockUntil: stillUnlocking ? unlockUntil : null,
		timeRemaining,
		isLocked: !isUnlocking
	};
}
