import { spawn } from "node:child_process";

let isUnlocking = false;
let doorState = "closed"; // "closed" | "open"
let lastUnlockTime = 0;

const COOLDOWN_MS = 0; // 如果你想要全域冷卻時間

const spawnGpio = args => {
	return new Promise((resolve, reject) => {
		const proc = spawn("gpioset", args);
		let stderr = "";
		proc.stderr.on("data", d => {
			stderr += d.toString();
		});
		proc.on("close", code => {
			if (code !== 0) reject(new Error(`gpioset failed: ${stderr.trim()}`));
			else resolve();
		});
	});
};

export const resetDoor = async () => {
	console.log("[GPIO] Resetting door to closed state...");
	try {
		await spawnGpio(["-c", "gpiochip0", "-t0", "17=0"]);
		doorState = "closed";
		console.log("[GPIO] Door reset complete.");
	} catch (err) {
		console.error("[GPIO] Reset failed:", err.message);
	}
};

export const unlockDoor = ({ userId, source }) => {
	// 防止同時重複觸發
	if (isUnlocking) {
		return Promise.resolve({
			success: false,
			message: "Door is already unlocking"
		});
	}

	const now = Date.now();
	if (COOLDOWN_MS > 0 && now - lastUnlockTime < COOLDOWN_MS) {
		return Promise.resolve({
			success: false,
			message: "Door cooldown active",
			timeRemaining: COOLDOWN_MS - (now - lastUnlockTime)
		});
	}

	isUnlocking = true;
	lastUnlockTime = now;

	return new Promise(resolve => {
		// 先送出開門訊號
		spawnGpio(["-c", "gpiochip0", "-t0", "17=1"])
			.then(() => {
				doorState = "open";
				console.log("[GPIO] Door opened");

				// 立刻送出關門訊號，但非同步讓呼叫者可以在開門時先回應
				const whenClosed = spawnGpio(["-c", "gpiochip0", "-t0", "17=0"])
					.then(() => {
						doorState = "closed";
						isUnlocking = false;
						console.log("[GPIO] Door closed");
					})
					.catch(err => {
						doorState = "closed";
						isUnlocking = false;
						console.error("[GPIO] Close command failed:", err.message);
						throw err;
					});

				resolve({ success: true, whenClosed });
			})
			.catch(err => {
				doorState = "closed";
				isUnlocking = false;
				console.error("[GPIO] Open command failed:", err.message);
				resolve({ success: false, message: "GPIO control failed" });
			});
	});
};

export const getDoorStatus = () => {
	return { doorState, isUnlocking, lastUnlockTime };
};
