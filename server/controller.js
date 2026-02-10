import { execFileSync } from "node:child_process";

const RELAY_PIN = Number(process.env.RELAY_GPIO_PIN ?? 17);
const UNLOCK_DURATION_MS = 8000;

let gpioAvailable = true;

function pulseRelay(durationMs) {
	try {
		execFileSync(
			"gpioset",
			[
				"-c", "gpiochip0",
				"--hold-period", `${durationMs}ms`,
				`${RELAY_PIN}=1`,
			],
			{ stdio: "ignore" }
		);
	} catch (err) {
		gpioAvailable = false;
		console.warn(
			"[GPIO] gpiod unavailable, fallback to simulation:",
			err?.message ?? err
		);
	}
}

export function unlockDoor() {
	if (!gpioAvailable) {
		console.log("[GPIO] simulate unlock (8s)");
		return { simulated: true, duration: UNLOCK_DURATION_MS };
	}

	pulseRelay(UNLOCK_DURATION_MS);
	console.log("[GPIO] door unlocked for 8 seconds");

	return { success: true, duration: UNLOCK_DURATION_MS };
}
