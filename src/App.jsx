import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import AdminDashboard from './components/admin/AdminDashboard';

const App = () => {
  return (
    <Routes>
      {/* 일반 대시보드 */}
      <Route path="/" element={<Home />} />
      
      {/* 관리자 모드 */}
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
};

export default App;
