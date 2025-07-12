// src/pages/Login.jsx
import axios from 'axios';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const navigate = useNavigate();

  const handleSubmit = async () => {
    try {
      await axios.post("http://localhost:5000/api/auth/login", formData, {
        headers: {
          "Content-Type": "application/json",
        }
        // withCredentials: true
      })
        .then(response => {
          // console.log(response.data.token);
          localStorage.setItem("token", response.data.token);
          toast.success("Logged in successfully");
          navigate("/");
        });
    } catch (err) {
      toast.error('Invalid credentials');
    }
  };

  return (
    <div className="container d-flex justify-content-center align-items-center min-vh-100">
      <div className="card p-4" style={{ maxWidth: '400px', width: '100%' }}>
        <h2 className="card-title h3 mb-4 text-center">Login</h2>
        <div className="mb-3">
          <label className="form-label">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="form-control"
            placeholder="Enter email"
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Password</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="form-control"
            placeholder="Enter password"
          />
        </div>
        <button onClick={handleSubmit} className="btn btn-primary w-100">Login</button>
        <p className="text-center mt-3">
          Don't have an account? <Link to="/register" className="text-primary">Register</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;