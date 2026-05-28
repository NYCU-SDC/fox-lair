import { spawn } from "node:child_process";
import { unlockDoor } from "./controller.js";
import { findValidPhysicalPassword, logAccess, logAudit } from "./database.js";

const DEFAULT_KEYPAD_PINS = ["27", "22", "23", "24", "25", "5", "6"];
const MAX_RECENT_EVENTS = 80;
const KEY_MATRIX = [
	["1", "2", "3"],
	["4", "5", "6"],
	["7", "8", "9"],
	["*", "0", "#"]
];

let scannerInstance = null;
let recentEvents = [];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const isEnabled = value => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

const parsePins = value => {
	const pins = String(value || "")
		.split(",")
		.map(pin => pin.trim())
		.filter(Boolean);

	return pins.length === 7 ? pins : DEFAULT_KEYPAD_PINS;
};

const createMaskedValue = value => "•".repeat(value.length);

const recordEvent = event => {
	recentEvents = [
		{
			id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			at: new Date().toISOString(),
			...event
		},
		...recentEvents
	].slice(0, MAX_RECENT_EVENTS);
};

const runCommand = (command, args, timeoutMs = 1000) => {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args);
		let stdout = "";
		let stderr = "";
		let settled = false;

		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			proc.kill("SIGTERM");
			reject(new Error(`${command} timed out`));
		}, timeoutMs);

		proc.stdout.on("data", data => {
			stdout += data.toString();
		});

		proc.stderr.on("data", data => {
			stderr += data.toString();
		});

		proc.on("close", code => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);

			if (code !== 0) {
				reject(new Error(`${command} failed: ${stderr.trim() || `exit ${code}`}`));
				return;
			}

			resolve(stdout);
		});

		proc.on("error", error => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(error);
		});
	});
};

const parseGpioValues = stdout => {
	return stdout
		.trim()
		.split(/\s+/)
		.map(token => (token.includes("=") ? token.slice(token.lastIndexOf("=") + 1) : token))
		.filter(value => value === "0" || value === "1")
		.map(Number);
};

class KeypadScanner {
	constructor() {
		const pins = parsePins(process.env.KEYPAD_GPIO_PINS);

		this.chip = process.env.KEYPAD_GPIO_CHIP || "gpiochip0";
		this.columnPins = pins.slice(0, 3);
		this.rowPins = pins.slice(3);
		this.pollMs = Math.max(parseInt(process.env.KEYPAD_POLL_MS) || 120, 50);
		this.settleMs = Math.max(parseInt(process.env.KEYPAD_SETTLE_MS) || 8, 1);
		this.maxLength = Math.max(parseInt(process.env.KEYPAD_MAX_LENGTH) || 12, 4);
		this.minLength = Math.max(parseInt(process.env.KEYPAD_MIN_LENGTH) || 4, 1);
		this.gpiodBias = process.env.KEYPAD_GPIOD_BIAS || "pull-down";
		this.buffer = "";
		this.interval = null;
		this.scanInProgress = false;
		this.keyIsDown = false;
		this.consecutiveFailures = 0;
	}

	start() {
		if (this.interval) return;

		console.log(`[KEYPAD] Scanner enabled on ${this.chip}; columns GPIO ${this.columnPins.join(", ")}; rows GPIO ${this.rowPins.join(", ")}`);
		recordEvent({
			type: "scanner_started",
			message: "Scanner started"
		});

		this.interval = setInterval(() => {
			this.scan().catch(error => this.handleScanError(error));
		}, this.pollMs);
	}

	stop() {
		if (!this.interval) return;
		clearInterval(this.interval);
		this.interval = null;
		this.setColumns(null).catch(() => {});
		recordEvent({
			type: "scanner_stopped",
			message: "Scanner stopped"
		});
	}

	async scan() {
		if (this.scanInProgress) return;
		this.scanInProgress = true;

		try {
			const keys = await this.scanOnce();
			this.consecutiveFailures = 0;

			if (keys.length === 0) {
				this.keyIsDown = false;
				return;
			}

			if (keys.length > 1 || this.keyIsDown) {
				return;
			}

			this.keyIsDown = true;
			await this.handleKey(keys[0]);
		} finally {
			this.scanInProgress = false;
		}
	}

	async scanOnce() {
		const keys = [];

		try {
			for (let columnIndex = 0; columnIndex < this.columnPins.length; columnIndex += 1) {
				await this.setColumns(columnIndex);
				await sleep(this.settleMs);
				const rowValues = await this.readRows();

				rowValues.forEach((value, rowIndex) => {
					if (value === 1) {
						keys.push(KEY_MATRIX[rowIndex][columnIndex]);
					}
				});
			}
		} finally {
			await this.setColumns(null).catch(() => {});
		}

		return keys;
	}

	async setColumns(activeColumnIndex) {
		const assignments = this.columnPins.map((pin, index) => `${pin}=${index === activeColumnIndex ? 1 : 0}`);
		await runCommand("gpioset", ["-c", this.chip, "-t0", ...assignments]);
	}

	async readRows() {
		const biasArgs = this.gpiodBias === "none" ? [] : ["-b", this.gpiodBias];
		const stdout = await runCommand("gpioget", ["-c", this.chip, ...biasArgs, ...this.rowPins]);
		const values = parseGpioValues(stdout);

		if (values.length !== this.rowPins.length) {
			throw new Error(`gpioget returned ${values.length} values for ${this.rowPins.length} rows`);
		}

		return values;
	}

	async handleKey(key) {
		if (key === "*") {
			this.buffer = "";
			console.log("[KEYPAD] PIN entry cleared");
			recordEvent({
				type: "clear",
				key,
				bufferLength: 0,
				message: "PIN entry cleared"
			});
			return;
		}

		if (key === "#") {
			const password = this.buffer;
			this.buffer = "";
			recordEvent({
				type: "submit",
				key,
				value: password,
				maskedValue: createMaskedValue(password),
				length: password.length,
				bufferLength: 0,
				message: "PIN submitted"
			});

			if (password.length < this.minLength) {
				console.log("[KEYPAD] Ignored short PIN entry");
				recordEvent({
					type: "ignored",
					reason: "too_short",
					length: password.length,
					message: "PIN entry ignored because it is too short"
				});
				return;
			}

			await this.submitPassword(password);
			return;
		}

		if (this.buffer.length < this.maxLength) {
			this.buffer += key;
			recordEvent({
				type: "key",
				key,
				bufferLength: this.buffer.length,
				message: "Key read"
			});
		}
	}

	async submitPassword(password) {
		const passwordRecord = findValidPhysicalPassword(password);

		if (!passwordRecord) {
			console.log("[KEYPAD] PIN rejected");
			recordEvent({
				type: "access_denied",
				message: "No active PIN matched"
			});
			logAudit({
				actorUserId: "physical-keypad",
				actorUsername: "Physical Keypad",
				action: "physical_password.access_denied",
				targetType: "physical_password",
				details: { reason: "no_active_match" }
			});
			return;
		}

		const result = await unlockDoor({
			userId: `physical-password:${passwordRecord.id}`,
			source: "physical_password"
		});

		if (!result.success) {
			console.log(`[KEYPAD] PIN accepted but unlock rejected: ${result.message}`);
			recordEvent({
				type: "access_rejected",
				targetId: String(passwordRecord.id),
				label: passwordRecord.label,
				message: result.message
			});
			logAudit({
				actorUserId: "physical-keypad",
				actorUsername: "Physical Keypad",
				action: "physical_password.access_rejected",
				targetType: "physical_password",
				targetId: String(passwordRecord.id),
				details: {
					label: passwordRecord.label,
					reason: result.message
				}
			});
			return;
		}

		logAccess(`physical-password:${passwordRecord.id}`, `Physical PIN: ${passwordRecord.label}`, "physical_password", "keypad");
		recordEvent({
			type: "access_granted",
			targetId: String(passwordRecord.id),
			label: passwordRecord.label,
			message: "Door unlocked"
		});
		logAudit({
			actorUserId: "physical-keypad",
			actorUsername: "Physical Keypad",
			action: "physical_password.access_granted",
			targetType: "physical_password",
			targetId: String(passwordRecord.id),
			details: {
				label: passwordRecord.label,
				duration: result.duration
			}
		});
		console.log(`[KEYPAD] Door unlocked with physical PIN "${passwordRecord.label}"`);
	}

	handleScanError(error) {
		this.consecutiveFailures += 1;

		if (this.consecutiveFailures === 1 || this.consecutiveFailures % 20 === 0) {
			console.warn(`[KEYPAD] Scan failed: ${error.message}`);
			recordEvent({
				type: "scan_error",
				message: error.message,
				consecutiveFailures: this.consecutiveFailures
			});
		}

		if (this.consecutiveFailures >= 20) {
			console.warn("[KEYPAD] Scanner disabled after repeated GPIO failures");
			this.stop();
		}
	}

	getStatus() {
		return {
			enabled: true,
			running: !!this.interval,
			chip: this.chip,
			columnPins: this.columnPins,
			rowPins: this.rowPins,
			pollMs: this.pollMs,
			settleMs: this.settleMs,
			minLength: this.minLength,
			maxLength: this.maxLength,
			bufferLength: this.buffer.length,
			consecutiveFailures: this.consecutiveFailures,
			recentEvents
		};
	}

	clearTestState() {
		this.buffer = "";
		recentEvents = [];
		recordEvent({
			type: "test_cleared",
			message: "Test state cleared"
		});
	}
}

export const initKeypadScanner = () => {
	if (!isEnabled(process.env.KEYPAD_ENABLED)) {
		console.log("[KEYPAD] Scanner disabled. Set KEYPAD_ENABLED=true to enable physical keypad input.");
		recordEvent({
			type: "scanner_disabled",
			message: "Scanner disabled"
		});
		return null;
	}

	scannerInstance = new KeypadScanner();
	scannerInstance.start();
	return scannerInstance;
};

export const getKeypadScannerStatus = () => {
	if (scannerInstance) {
		return scannerInstance.getStatus();
	}

	const pins = parsePins(process.env.KEYPAD_GPIO_PINS);

	return {
		enabled: isEnabled(process.env.KEYPAD_ENABLED),
		running: false,
		chip: process.env.KEYPAD_GPIO_CHIP || "gpiochip0",
		columnPins: pins.slice(0, 3),
		rowPins: pins.slice(3),
		pollMs: Math.max(parseInt(process.env.KEYPAD_POLL_MS) || 120, 50),
		settleMs: Math.max(parseInt(process.env.KEYPAD_SETTLE_MS) || 8, 1),
		minLength: Math.max(parseInt(process.env.KEYPAD_MIN_LENGTH) || 4, 1),
		maxLength: Math.max(parseInt(process.env.KEYPAD_MAX_LENGTH) || 12, 4),
		bufferLength: 0,
		consecutiveFailures: 0,
		recentEvents
	};
};

export const clearKeypadScannerTestState = () => {
	if (scannerInstance) {
		scannerInstance.clearTestState();
		return;
	}

	recentEvents = [];
	recordEvent({
		type: "test_cleared",
		message: "Test state cleared"
	});
};
