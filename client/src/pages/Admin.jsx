import { useState, useEffect } from 'react'
import UnlockSection from '../components/UnlockSection'
import AccessControl from '../components/AccessControl'
import AccessLogs from '../components/AccessLogs'
import './Admin.css'

function Admin({ user, isAdmin, onLogout }) {
  const [activeTab, setActiveTab] = useState('unlock')

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
          <button 
            className={`nav-item ${activeTab === 'unlock' ? 'active' : ''}`}
            onClick={() => setActiveTab('unlock')}
          >
            <span className="nav-icon">🔓</span>
            Unlock Door
          </button>
          
          {isAdmin && (
            <>
              <button 
                className={`nav-item ${activeTab === 'access' ? 'active' : ''}`}
                onClick={() => setActiveTab('access')}
              >
                <span className="nav-icon">👥</span>
                Access Control
              </button>
              <button 
                className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
                onClick={() => setActiveTab('logs')}
              >
                <span className="nav-icon">📋</span>
                Access Logs
              </button>
            </>
          )}
        </nav>

        <main className="admin-main">
          {activeTab === 'unlock' && <UnlockSection />}
          {activeTab === 'access' && isAdmin && <AccessControl />}
          {activeTab === 'logs' && isAdmin && <AccessLogs />}
        </main>
      </div>
    </div>
  )
}

export default Admin
