import { spawn } from "node:child_process";

let isUnlocking = false;
let lastUnlockTime = 0;

const UNLOCK_DURATION_MS = 8000; // 對應 --hold-period 8000ms
const COOLDOWN_MS = 0; // 如果你想要全域冷卻時間

export async function unlockDoor({ userId, source }) {
	// 防止同時重複觸發
	if (isUnlocking) {
		return {
			success: false,
			message: "Door is already unlocking"
		};
	}

	const now = Date.now();
	if (COOLDOWN_MS > 0 && now - lastUnlockTime < COOLDOWN_MS) {
		return {
			success: false,
			message: "Door cooldown active",
			timeRemaining: Math.ceil((COOLDOWN_MS - (now - lastUnlockTime)) / 1000)
		};
	}

	isUnlocking = true;
	lastUnlockTime = now;

	return new Promise(resolve => {
		const proc = spawn("gpioset", ["-c", "gpiochip0", "--hold-period", `${UNLOCK_DURATION_MS}ms`, "-t0", "17=1"]);

		let stderr = "";

		proc.stderr.on("data", d => {
			stderr += d.toString();
		});

		proc.on("close", code => {
			isUnlocking = false;

			if (code !== 0) {
				console.error("[GPIO] gpioset failed:", stderr);
				return resolve({
					success: false,
					message: "GPIO control failed"
				});
			}

			resolve({
				success: true,
				duration: UNLOCK_DURATION_MS,
				simulated: false
			});
		});
	});
}

export function getDoorStatus() {
	return {
		isUnlocking,
		lastUnlockTime
	};
}
