import React from 'react';
import { Routes, Route } from 'react-router-dom';
import MainDashboard from './components/MainDashboard';
import AdminDashboard from './components/admin/AdminDashboard';

const App = () => {
  return (
    <Routes>
      {/* 일반 대시보드 (기존 HTML 복원 버전) */}
      <Route path="/" element={<MainDashboard />} />
      
      {/* 관리자 모드 */}
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
};

export default App;
