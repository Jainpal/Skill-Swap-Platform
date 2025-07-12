// src/pages/Register.jsx
import axios from "axios";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const Register = () => {
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post("http://localhost:5000/api/auth/register", formData, {
        headers: {
          "Content-Type": "application/json",
        },
      }).then(response => {
        // console.log(response.data.token);
        localStorage.setItem("token", response.data.token);
        toast.success("Registered successfully");
        navigate("/");
      });
    } catch (err) {
      toast.error("Registration failed: " + (err.response?.data?.message || "Unknown error"));
      console.log(err)
    }
  };

  return (
    <div className="min-vh-100 d-flex justify-content-center align-items-center" style={{ background: "linear-gradient(135deg, #1a1a2e, #16213e)" }}>
      <div className="card shadow-lg" style={{ background: "rgba(255, 255, 255, 0.05)", borderRadius: "15px", maxWidth: "500px", width: "100%", margin: "0 auto" }}>
        <div className="card-body p-5">
          <h2 className="card-title h3 mb-5 text-white text-center" style={{ fontFamily: "'Poppins', sans-serif", textTransform: "uppercase", letterSpacing: "1px" }}>
            Register
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="form-label text-light">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-control bg-transparent text-white border-light"
                style={{ borderRadius: "10px", padding: "12px" }}
                placeholder="Enter name"
                required
              />
            </div>
            <div className="mb-4">
              <label className="form-label text-light">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="form-control bg-transparent text-white border-light"
                style={{ borderRadius: "10px", padding: "12px" }}
                placeholder="Enter email"
                required
              />
            </div>
            <div className="mb-4">
              <label className="form-label text-light">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="form-control bg-transparent text-white border-light"
                style={{ borderRadius: "10px", padding: "12px" }}
                placeholder="Enter password"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-100"
              style={{ borderRadius: "10px", padding: "12px", fontWeight: "600", transition: "all 0.3s ease", background: "linear-gradient(45deg, #00ddeb, #00ff85)" }}
            >
              Register
            </button>
          </form>
          <p className="text-center mt-3 text-light">
            Already have an account? <Link to="/login" className="text-primary">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;