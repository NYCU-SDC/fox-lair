import { useEffect, useState } from "react";
import "./UnlockSection.css";

function UnlockSection() {
	const [unlocking, setUnlocking] = useState(false);
	const [countdown, setCountdown] = useState(0);
	const [unlockDurationSeconds, setUnlockDurationSeconds] = useState(8);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	// API token state
	const [tokenMeta, setTokenMeta] = useState(null); // { hasToken, createdAt }
	const [newToken, setNewToken] = useState(""); // plain token shown once after (re)issue
	const [tokenLoading, setTokenLoading] = useState(false);
	const [tokenError, setTokenError] = useState("");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		fetchTokenStatus();
	}, []);

	const fetchTokenStatus = async () => {
		try {
			const res = await fetch("/api/auth/token", { credentials: "include" });
			if (res.ok) setTokenMeta(await res.json());
		} catch {}
	};

	const handleGenerateToken = async () => {
		setTokenLoading(true);
		setTokenError("");
		setNewToken("");
		setCopied(false);
		try {
			const res = await fetch("/api/auth/token", { method: "POST", credentials: "include" });
			const data = await res.json();
			if (res.ok) {
				setNewToken(data.token);
				fetchTokenStatus();
			} else {
				setTokenError(data.error || "Failed to generate token");
			}
		} catch {
			setTokenError("Network error");
		} finally {
			setTokenLoading(false);
		}
	};

	const handleRevokeToken = async () => {
		if (!confirm("Revoke your API token? Any iOS Shortcuts using it will stop working.")) return;
		setTokenLoading(true);
		setTokenError("");
		setNewToken("");
		try {
			const res = await fetch("/api/auth/token", { method: "DELETE", credentials: "include" });
			if (res.ok) {
				setTokenMeta({ hasToken: false, createdAt: null });
			} else {
				const data = await res.json();
				setTokenError(data.error || "Failed to revoke token");
			}
		} catch {
			setTokenError("Network error");
		} finally {
			setTokenLoading(false);
		}
	};

	const handleCopy = () => {
		navigator.clipboard.writeText(newToken);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleUnlock = async () => {
		setUnlocking(true);
		setError("");
		setMessage("");

		try {
			const response = await fetch("/api/door/unlock", {
				method: "POST",
				credentials: "include"
			});

			const data = await response.json();

			if (response.ok) {
				setMessage(data.simulated ? "✅ Door unlock simulated (GPIO not available)" : "✅ Door unlocked successfully!");

				// Start countdown
				const duration = (data.duration || unlockDurationSeconds * 1000) / 1000;
				setUnlockDurationSeconds(duration);
				setCountdown(duration);

				const interval = setInterval(() => {
					setCountdown(prev => {
						if (prev <= 1) {
							clearInterval(interval);
							setUnlocking(false);
							return 0;
						}
						return prev - 1;
					});
				}, 1000);
			} else {
				setError(data.error || "Failed to unlock door");
				setUnlocking(false);
			}
		} catch (err) {
			setError("Network error");
			setUnlocking(false);
		}
	};

	return (
		<div className="unlock-section">
			<div className="unlock-card card">
				<h2>Door Control</h2>
				<p className="unlock-description">Click the button below to unlock the door. It will automatically lock again after {unlockDurationSeconds} seconds.</p>

				<button className="btn btn-success unlock-button" onClick={handleUnlock} disabled={unlocking}>
					{unlocking ? "🔓 Unlocking..." : "🔓 Unlock Door"}
				</button>

				{countdown > 0 && (
					<div className="countdown-container">
						<div className="countdown-bar">
							<div className="countdown-progress" style={{ width: `${(countdown / unlockDurationSeconds) * 100}%` }}></div>
						</div>
						<p className="countdown-text">
							Auto-locking in {countdown} second{countdown !== 1 ? "s" : ""}
						</p>
					</div>
				)}

				{message && <div className="success-message">{message}</div>}
				{error && <div className="error-message">{error}</div>}
			</div>

			<div className="api-token-card card">
				<h3>📱 API Token</h3>
				<p className="api-token-description">
					用 API token 搭配 iOS 捷徑來開門。Token 以雜湊儲存，只有產生當下會顯示一次。
				</p>

				{tokenMeta?.hasToken && (
					<p className="token-meta">
						目前有效 token，建立於 {new Date(tokenMeta.createdAt + "Z").toLocaleString()}
					</p>
				)}

				{newToken && (
					<div className="token-reveal">
						<p className="token-warning">⚠️ 請立刻複製，離開後不再顯示</p>
						<div className="token-box">
							<code className="token-value">{newToken}</code>
							<button className="btn btn-secondary btn-sm" onClick={handleCopy}>
								{copied ? "✅ 已複製" : "複製"}
							</button>
						</div>
						<p className="token-usage">
							iOS 捷徑設定：<br />
							POST <code>{window.location.origin}/api/door/unlock</code><br />
							Header: <code>Authorization: Bearer &lt;token&gt;</code>
						</p>
					</div>
				)}

				{tokenError && <div className="error-message">{tokenError}</div>}

				<div className="token-actions">
					<button className="btn btn-primary" onClick={handleGenerateToken} disabled={tokenLoading}>
						{tokenLoading ? "處理中..." : tokenMeta?.hasToken ? "🔄 重新發行" : "✨ 產生 Token"}
					</button>
					{tokenMeta?.hasToken && (
						<button className="btn btn-danger" onClick={handleRevokeToken} disabled={tokenLoading}>
							撤銷
						</button>
					)}
				</div>
			</div>

			<div className="info-card card">
				<h3>ℹ️ Information</h3>
				<ul className="info-list">
					<li>The door will remain unlocked for exactly {unlockDurationSeconds} seconds</li>
					<li>Access is logged for security purposes</li>
					<li>Only authorized users can unlock the door</li>
					<li>In case of emergency, use the physical override</li>
				</ul>
			</div>
		</div>
	);
}

export default UnlockSection;
