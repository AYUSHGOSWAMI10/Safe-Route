
* {
  box-sizing: border-box;
}

.admin-layout {
  min-height: 100vh;
  display: flex;
  background: #0b1120;
  color: #e5e7eb;
  font-family: Arial, sans-serif;
}

/* Sidebar */

.admin-sidebar {
  width: 250px;
  min-height: 100vh;
  background: #111a2e;
  padding: 28px 18px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-right: 1px solid #26334b;
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 45px;
}

.admin-brand h2 {
  font-size: 22px;
  color: #ffffff;
  margin: 0;
}

.brand-icon {
  font-size: 26px;
}

.sidebar-label {
  color: #718096;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 1.5px;
  padding-left: 12px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 14px;
  border-radius: 8px;
  text-decoration: none;
  color: #a7b1c5;
  font-size: 14px;
  transition: 0.2s;
}

.nav-item:hover,
.nav-item.active {
  background: #1e3a5f;
  color: #60a5fa;
}

.nav-item span {
  font-size: 19px;
}

.sidebar-bottom {
  margin-top: auto;
  border-top: 1px solid #26334b;
  padding-top: 20px;
}

/* Main content */

.admin-main {
  flex: 1;
  min-width: 0;
  padding: 32px;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 32px;
}

.admin-header h1 {
  color: #ffffff;
  font-size: 27px;
  margin: 0 0 8px;
}

.admin-header p,
.section-heading p {
  color: #94a3b8;
  font-size: 14px;
  margin: 0;
}

.admin-profile {
  display: flex;
  align-items: center;
  gap: 12px;
}

.profile-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #2563eb;
  display: grid;
  place-items: center;
  font-weight: bold;
  color: white;
}

.admin-profile strong,
.admin-profile small {
  display: block;
}

.admin-profile small {
  color: #94a3b8;
  margin-top: 4px;
}

/* Statistics cards */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 35px;
}

.stat-card {
  background: #111a2e;
  border: 1px solid #26334b;
  border-radius: 12px;
  padding: 22px;
}

.stat-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #a7b1c5;
  font-size: 14px;
}

.stat-icon {
  font-size: 22px;
}

.stat-card h2 {
  font-size: 30px;
  color: #ffffff;
  margin: 20px 0 8px;
}

.stat-card p {
  color: #718096;
  font-size: 12px;
  margin: 0;
}

/* Reports table */

.reports-section {
  background: #111a2e;
  border: 1px solid #26334b;
  border-radius: 12px;
  padding: 24px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-bottom: 24px;
}

.section-heading h2 {
  color: white;
  font-size: 19px;
  margin: 0 0 8px;
}

.view-button {
  background: #2563eb;
  color: white;
  border: none;
  padding: 11px 17px;
  border-radius: 7px;
  cursor: pointer;
}

.view-button:hover {
  background: #1d4ed8;
}

.table-container {
  width: 100%;
  overflow-x: auto;
}

.reports-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  white-space: nowrap;
}

.reports-table th {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  padding: 14px;
  border-bottom: 1px solid #26334b;
}

.reports-table td {
  padding: 17px 14px;
  font-size: 13px;
  border-bottom: 1px solid #202c41;
  color: #d1d5db;
}

.reports-table tbody tr:hover {
  background: #17243a;
}

.status-badge {
  padding: 6px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: bold;
}

.status-badge.pending {
  color: #fbbf24;
  background: #422f0b;
}

.status-badge.approved {
  color: #4ade80;
  background: #123524;
}

.status-badge.rejected {
  color: #f87171;
  background: #451c24;
}

.admin-footer {
  text-align: center;
  color: #64748b;
  font-size: 12px;
  margin-top: 30px;
}

/* Responsive layout */

@media (max-width: 1000px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 700px) {
  .admin-layout {
    flex-direction: column;
  }

  .admin-sidebar {
    width: 100%;
    min-height: auto;
    padding: 16px;
  }

  .admin-brand {
    margin-bottom: 15px;
  }

  .sidebar-label {
    display: none;
  }

  .sidebar-nav,
  .sidebar-bottom {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .sidebar-bottom {
    margin-top: 15px;
  }

  .admin-main {
    padding: 20px 14px;
  }

  .admin-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
