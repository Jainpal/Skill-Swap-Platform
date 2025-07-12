// src/App.jsx
import { Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import AdminPanel from './components/AdminPanel';
import Layout from './components/Layout';
import Profile from './components/Profile';
import SkillSearch from './components/SkillSearch';
import SwapDashboard from './components/SwapDashboard';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path='/' element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/search" element={<SkillSearch />} />
          <Route path="/swaps" element={<SwapDashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Route>
      </Routes>
      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default App;