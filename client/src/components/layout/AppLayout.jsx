import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ForceChangePasswordModal from '../auth/ForceChangePasswordModal';

export default function AppLayout() {
  return (
    <div className="app-container">
      <ForceChangePasswordModal />
      <Sidebar />
      <div className="main-content">
        <Header />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
