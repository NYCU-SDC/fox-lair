import { useState } from "react";
import AccessControl from "../components/AccessControl";
import AccessLogs from "../components/AccessLogs";
import PhysicalPasswords from "../components/PhysicalPasswords";
import UnlockSection from "../components/UnlockSection";
import "./Admin.css";

function Admin({ user, isAdmin, onLogout }) {
	const [activeTab, setActiveTab] = useState("unlock");

	return (
		<div className="admin-container">
			<header className="admin-header">
				<div className="header-content">
					<h1>Fox Lair</h1>
					<div className="header-user">
						<div className="user-info">
							<span className="user-name">{user.username}</span>
							{isAdmin && <span className="admin-badge">Admin</span>}
						</div>
						<button className="btn btn-danger" onClick={onLogout}>
							Logout
						</button>
					</div>
				</div>
			</header>

			<div className="admin-content">
				<nav className="admin-nav">
					<button className={`nav-item ${activeTab === "unlock" ? "active" : ""}`} onClick={() => setActiveTab("unlock")}>
						<span className="nav-icon">🔓</span>
						Unlock Door
					</button>
					<button className={`nav-item ${activeTab === "physical-passwords" ? "active" : ""}`} onClick={() => setActiveTab("physical-passwords")}>
						<span className="nav-icon">🔢</span>
						Physical PINs
					</button>

					{isAdmin && (
						<>
							<button className={`nav-item ${activeTab === "access" ? "active" : ""}`} onClick={() => setActiveTab("access")}>
								<span className="nav-icon">👥</span>
								Access Control
							</button>
							<button className={`nav-item ${activeTab === "logs" ? "active" : ""}`} onClick={() => setActiveTab("logs")}>
								<span className="nav-icon">📋</span>
								Access Logs
							</button>
						</>
					)}
				</nav>

				<main className="admin-main">
					{activeTab === "unlock" && <UnlockSection />}
					{activeTab === "physical-passwords" && <PhysicalPasswords />}
					{activeTab === "access" && isAdmin && <AccessControl />}
					{activeTab === "logs" && isAdmin && <AccessLogs />}
				</main>
			</div>
		</div>
	);
}

export default Admin;
