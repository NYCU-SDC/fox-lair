import { useEffect, useState } from "react";
import "./KeypadTest.css";

const formatDate = timestamp => {
	if (!timestamp) return "";

	return new Date(timestamp).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
};

const getEventLabel = event => {
	switch (event.type) {
		case "key":
			return `Key ${event.key}`;
		case "submit":
			return "Submitted";
		case "clear":
			return "Cleared";
		case "ignored":
			return "Ignored";
		case "idle_reset":
			return "Auto reset";
		case "access_granted":
			return "Access granted";
		case "access_denied":
			return "Access denied";
		case "access_rejected":
			return "Access rejected";
		case "scan_error":
			return "Scan error";
		case "scanner_started":
			return "Scanner started";
		case "scanner_stopped":
			return "Scanner stopped";
		case "scanner_disabled":
			return "Scanner disabled";
		case "test_cleared":
			return "Test cleared";
		default:
			return event.type;
	}
};

const getEventDetail = (event, showDigits) => {
	if (event.type === "submit") {
		const value = showDigits ? event.value : event.maskedValue;
		return `${value || ""} (${event.length} digits)`;
	}

	if (event.type === "key") {
		return `Buffer length: ${event.bufferLength}`;
	}

	if (event.type === "idle_reset") {
		return `${event.length || 0} buffered digits cleared after inactivity`;
	}

	if (event.label) {
		return event.label;
	}

	if (event.reason) {
		return event.reason;
	}

	return event.message || "";
};

function KeypadTest() {
	const [status, setStatus] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [showDigits, setShowDigits] = useState(false);

	useEffect(() => {
		loadStatus();
		const interval = setInterval(loadStatus, 1000);
		return () => clearInterval(interval);
	}, []);

	const loadStatus = async () => {
		try {
			const response = await fetch("/api/admin/keypad-test", {
				credentials: "include"
			});

			if (!response.ok) {
				const data = await response.json();
				setError(data.error || "Failed to load keypad status");
				return;
			}

			setStatus(await response.json());
			setError("");
		} catch (loadError) {
			console.error("Failed to load keypad status:", loadError);
			setError("Network error");
		} finally {
			setLoading(false);
		}
	};

	const handleClear = async () => {
		try {
			const response = await fetch("/api/admin/keypad-test/clear", {
				method: "POST",
				credentials: "include"
			});

			if (response.ok) {
				await loadStatus();
			}
		} catch (clearError) {
			console.error("Failed to clear keypad status:", clearError);
			setError("Network error");
		}
	};

	if (loading) {
		return (
			<div className="loading-container">
				<div className="loading-spinner"></div>
			</div>
		);
	}

	return (
		<div className="keypad-test">
			<div className="card">
				<div className="keypad-test-header">
					<div>
						<h2>Keypad Test</h2>
						<p className="section-description">Press keys on the physical keypad and watch this page update.</p>
					</div>
					<div className="keypad-test-actions">
						<label className="digits-toggle">
							<input type="checkbox" checked={showDigits} onChange={event => setShowDigits(event.target.checked)} />
							Show submitted digits
						</label>
						<button className="btn btn-secondary btn-sm" onClick={handleClear}>
							Clear
						</button>
						<button className="btn btn-primary btn-sm" onClick={loadStatus}>
							Refresh
						</button>
					</div>
				</div>

				{error && <div className="error-message">{error}</div>}

				<div className="keypad-status-grid">
					<div className="keypad-status-item">
						<span>Status</span>
						<strong className={status?.running ? "status-ok" : "status-warn"}>{status?.running ? "Running" : status?.enabled ? "Enabled, not running" : "Disabled"}</strong>
					</div>
					<div className="keypad-status-item">
						<span>Buffer</span>
						<strong>{status?.bufferLength || 0} digits</strong>
					</div>
					<div className="keypad-status-item">
						<span>Columns</span>
						<strong>{status?.columnPins?.join(", ") || "-"}</strong>
					</div>
					<div className="keypad-status-item">
						<span>Rows</span>
						<strong>{status?.rowPins?.join(", ") || "-"}</strong>
					</div>
				</div>

				{!status?.enabled && (
					<div className="keypad-warning">
						Set <code>KEYPAD_ENABLED=true</code> on the Raspberry Pi to read the physical keypad.
					</div>
				)}
			</div>

			<div className="card">
				<h2>Recent Reads</h2>
				{status?.recentEvents?.length ? (
					<div className="keypad-events">
						{status.recentEvents.map(event => (
							<div className={`keypad-event ${event.type}`} key={event.id}>
								<div>
									<div className="keypad-event-title">{getEventLabel(event)}</div>
									<div className="keypad-event-detail">{getEventDetail(event, showDigits)}</div>
								</div>
								<div className="keypad-event-time">{formatDate(event.at)}</div>
							</div>
						))}
					</div>
				) : (
					<p className="empty-state">No keypad input has been read yet.</p>
				)}
			</div>
		</div>
	);
}

export default KeypadTest;
