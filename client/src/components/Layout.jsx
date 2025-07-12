// src/components/Layout.jsx
import axios from 'axios';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { toast } from 'react-toastify';
import NotificationBell from './NotificationBell';

const Layout = () => {
  const [user, setUser] = useState(null);
  const [adminMessage, setAdminMessage] = useState(null);

  useEffect(() => {
    axios.get('/api/users/profile', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(res => setUser(res.data))
      .catch(() => setUser(null));
    axios.get('/api/admin/messages')
      .then(res => setAdminMessage(res.data[0]))
      .catch(() => setAdminMessage(null));
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setUser(null);
    toast.success('Logged out');
  };

  return (
    <div className="min-vh-100">
      {/* {adminMessage && !adminMessage.isRead && (
        <div className="alert alert-info alert-dismissible fade show" role="alert">
          {adminMessage.content}
          <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
      )} */}
      <nav className="navbar navbar-expand-lg navbar-dark">
        <div className="container">
          <NavLink className="navbar-brand" to="/">Skill Swap</NavLink>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav me-auto">
              <li className="nav-item">
                <NavLink className="nav-link" to="/">Home</NavLink>
              </li>
              {user && (
                <>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/profile">Profile</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/search">Search</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/swaps">Swaps</NavLink>
                  </li>
                  {user.isAdmin && (
                    <li className="nav-item">
                      <NavLink className="nav-link" to="/admin">Admin</NavLink>
                    </li>
                  )}
                </>
              )}
            </ul>
            <ul className="navbar-nav align-items-center">
              {user && (
                <li className="nav-item">
                  <NotificationBell />
                </li>
              )}
              {user ? (
                <li className="nav-item">
                  <button className="nav-link btn btn-link text-danger" onClick={logout}>Logout</button>
                </li>
              ) : (
                <>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/login">Login</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/register">Register</NavLink>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </nav>
      <div className="container py-4">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;