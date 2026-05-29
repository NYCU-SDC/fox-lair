import { useEffect, useState } from "react";
import "./PhysicalPasswords.css";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toDatetimeLocalValue = date => {
	const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return localDate.toISOString().slice(0, 16);
};

const getDefaultRange = () => {
	const startsAt = new Date();
	startsAt.setSeconds(0, 0);
	const endsAt = new Date(startsAt.getTime() + ONE_DAY_MS);

	return {
		startsAt: toDatetimeLocalValue(startsAt),
		endsAt: toDatetimeLocalValue(endsAt)
	};
};

const formatDate = timestamp => {
	if (!timestamp) return "Never";

	return new Date(timestamp).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit"
	});
};

const formatLogDate = timestamp => {
	if (!timestamp) return "";
	const normalized = timestamp.includes("T") ? timestamp : `${timestamp}Z`;
	return formatDate(normalized);
};

const getActionLabel = action => {
	switch (action) {
		case "physical_password.create":
			return "PIN created";
		case "physical_password.revoke":
			return "PIN revoked";
		case "physical_password.access_granted":
			return "Access granted";
		case "physical_password.access_denied":
			return "Access denied";
		case "physical_password.access_rejected":
			return "Access rejected";
		default:
			return action;
	}
};

function PhysicalPasswords() {
	const defaultRange = getDefaultRange();
	const [passwords, setPasswords] = useState([]);
	const [logs, setLogs] = useState([]);
	const [label, setLabel] = useState("");
	const [pin, setPin] = useState("");
	const [startsAt, setStartsAt] = useState(defaultRange.startsAt);
	const [endsAt, setEndsAt] = useState(defaultRange.endsAt);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		loadData();
	}, []);

	const loadData = async () => {
		try {
			const [passwordsRes, logsRes] = await Promise.all([
				fetch("/api/admin/physical-passwords", { credentials: "include" }),
				fetch("/api/admin/physical-password-logs?limit=30", { credentials: "include" })
			]);

			if (passwordsRes.ok) {
				setPasswords(await passwordsRes.json());
			}

			if (logsRes.ok) {
				setLogs(await logsRes.json());
			}
		} catch (loadError) {
			console.error("Failed to load physical PINs:", loadError);
			setError("Failed to load physical PINs");
		} finally {
			setLoading(false);
		}
	};

	const resetFormRange = () => {
		const range = getDefaultRange();
		setStartsAt(range.startsAt);
		setEndsAt(range.endsAt);
	};

	const handleSubmit = async event => {
		event.preventDefault();
		setSaving(true);
		setMessage("");
		setError("");

		try {
			const response = await fetch("/api/admin/physical-passwords", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					label,
					password: pin,
					startsAt: new Date(startsAt).toISOString(),
					endsAt: new Date(endsAt).toISOString()
				})
			});
			const data = await response.json();

			if (!response.ok) {
				setError(data.error || "Failed to add PIN");
				return;
			}

			setMessage("Physical PIN added");
			setPin("");
			setLabel("");
			resetFormRange();
			await loadData();
		} catch (submitError) {
			console.error("Failed to add physical PIN:", submitError);
			setError("Network error");
		} finally {
			setSaving(false);
		}
	};

	const handleRevoke = async password => {
		if (!confirm(`Revoke "${password.label}"?`)) return;

		setMessage("");
		setError("");

		try {
			const response = await fetch(`/api/admin/physical-passwords/${password.id}`, {
				method: "DELETE",
				credentials: "include"
			});
			const data = await response.json();

			if (!response.ok) {
				setError(data.error || "Failed to revoke PIN");
				return;
			}

			setMessage("Physical PIN revoked");
			await loadData();
		} catch (revokeError) {
			console.error("Failed to revoke physical PIN:", revokeError);
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
		<div className="physical-passwords">
			<div className="card">
				<h2>Physical PINs</h2>
				<p className="section-description">Create temporary numeric PINs for the 7-pin keypad connected to the Raspberry Pi.</p>

				<div className="keypad-entry-guide" aria-label="Physical keypad entry instructions">
					<div className="keypad-entry-step">
						<span className="keypad-entry-key">0-9</span>
						<span>Enter the numeric PIN on the physical keypad.</span>
					</div>
					<div className="keypad-entry-step">
						<span className="keypad-entry-key">#</span>
						<span>Submit the PIN.</span>
					</div>
					<div className="keypad-entry-step">
						<span className="keypad-entry-key">*</span>
						<span>Clear the current entry.</span>
					</div>
					<div className="keypad-entry-note">Unsubmitted entries clear automatically after 10 seconds. Incorrect PIN attempts send a Discord alert.</div>
				</div>

				<form className="pin-form" onSubmit={handleSubmit}>
					<div className="form-row">
						<div className="form-group">
							<label>Label</label>
							<input className="input" value={label} onChange={event => setLabel(event.target.value)} placeholder="Guest, delivery, event..." maxLength={80} />
						</div>
						<div className="form-group">
							<label>PIN</label>
							<input
								className="input pin-input"
								value={pin}
								onChange={event => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
								placeholder="4 to 12 digits"
								inputMode="numeric"
								autoComplete="off"
								minLength={4}
								maxLength={12}
								required
							/>
						</div>
					</div>

					<div className="form-row">
						<div className="form-group">
							<label>Starts At</label>
							<input className="input" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required />
						</div>
						<div className="form-group">
							<label>Ends At</label>
							<input className="input" type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} required />
						</div>
					</div>

					<div className="pin-actions">
						<button className="btn btn-primary" type="submit" disabled={saving || pin.length < 4}>
							{saving ? "Saving..." : "Add PIN"}
						</button>
						<button className="btn btn-secondary" type="button" onClick={resetFormRange}>
							Reset Dates
						</button>
					</div>
				</form>

				{message && <div className="success-message">{message}</div>}
				{error && <div className="error-message">{error}</div>}
			</div>

			<div className="card">
				<div className="pin-list-header">
					<h2>Configured PINs</h2>
					<button className="btn btn-primary btn-sm" onClick={loadData}>
						🔄 Refresh
					</button>
				</div>

				{passwords.length === 0 ? (
					<p className="empty-state">No physical PINs have been added yet.</p>
				) : (
					<div className="pin-list">
						{passwords.map(password => (
							<div className="pin-item" key={password.id}>
								<div className="pin-info">
									<div className="pin-title-row">
										<span className="pin-label">{password.label}</span>
										<span className={`pin-status ${password.status}`}>{password.status}</span>
									</div>
									<div className="pin-meta">
										{formatDate(password.starts_at)} - {formatDate(password.ends_at)}
									</div>
									<div className="pin-meta">Created by {password.created_by_username}</div>
								</div>
								{!password.revoked_at && (
									<button className="btn btn-danger btn-sm" onClick={() => handleRevoke(password)}>
										Revoke
									</button>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			<div className="card">
				<h2>Recent PIN Activity</h2>
				{logs.length === 0 ? (
					<p className="empty-state">No PIN activity has been logged yet.</p>
				) : (
					<div className="pin-log-list">
						{logs.map(log => (
							<div className="pin-log-item" key={log.id}>
								<div>
									<div className="pin-log-action">{getActionLabel(log.action)}</div>
									<div className="pin-meta">
										{log.details?.label ? `${log.details.label} · ` : ""}
										{log.actor_username}
									</div>
								</div>
								<div className="pin-log-time">{formatLogDate(log.created_at)}</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export default PhysicalPasswords;
