import { useEffect, useState } from "react";
import "./AccessLogs.css";

function AccessLogs() {
	const [logs, setLogs] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadLogs();
		// Refresh logs every 10 seconds
		const interval = setInterval(loadLogs, 10000);
		return () => clearInterval(interval);
	}, []);

	const loadLogs = async () => {
		try {
			const response = await fetch("/api/admin/logs?limit=50", {
				credentials: "include"
			});

			if (response.ok) {
				const data = await response.json();
				setLogs(data);
			}
		} catch (error) {
			console.error("Failed to load logs:", error);
		} finally {
			setLoading(false);
		}
	};

	const formatDate = timestamp => {
		return new Date(timestamp).toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit"
		});
	};

	const getMethodMeta = method => {
		switch (method) {
			case "web":
				return { label: "🌐 Web", className: "web" };
			case "discord":
				return { label: "💬 Discord", className: "discord" };
			case "api":
				return { label: "📱 API", className: "api" };
			case "physical_password":
				return { label: "🔢 PIN", className: "physical-password" };
			default:
				return { label: method, className: "unknown" };
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
		<div className="access-logs">
			<div className="card">
				<div className="logs-header">
					<h2>Access Logs</h2>
					<button className="btn btn-primary btn-sm" onClick={loadLogs}>
						🔄 Refresh
					</button>
				</div>

				{logs.length === 0 ? (
					<p className="empty-state">No access logs yet.</p>
				) : (
					<div className="table-container">
						<table className="table">
							<thead>
								<tr>
									<th>Time</th>
									<th>User</th>
									<th>Method</th>
									<th>User ID</th>
								</tr>
							</thead>
							<tbody>
								{logs.map(log => {
									const methodMeta = getMethodMeta(log.method);
									return (
										<tr key={log.id}>
											<td className="log-time">{formatDate(log.timestamp)}</td>
											<td className="log-username">{log.username}</td>
											<td>
												<span className={`method-badge ${methodMeta.className}`}>{methodMeta.label}</span>
											</td>
											<td className="log-userid">{log.user_id}</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

export default AccessLogs;
