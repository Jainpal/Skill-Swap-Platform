// src/components/Profile.jsx
import axios from "axios";
import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "react-toastify";

const Profile = () => {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    availability: "",
    isPublic: true,
  });
  const [skillsOffered, setSkillsOffered] = useState([]);
  const [skillsWanted, setSkillsWanted] = useState([]);
  const [newSkill, setNewSkill] = useState({ offered: "", wanted: "" });

  useEffect(() => {
    axios
      .get("http://localhost:5000/api/users/profile", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then((res) => {
        setUser(res.data);
        console.log(res)
        console.log(res.data)
        setFormData({
          name: res.data.user.name || "",
          location: res.data.user.location || "",
          availability: res.data.user.availability || "",
          isPublic: res.data.user.isPublic || false,
        });
        setSkillsOffered(res.data.user.offeredSkills || []);
        setSkillsWanted(res.data.user.wantedSkills || []);
      })
      .catch((err) => toast.error("Failed to load profile"));
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    accept: { "image/*": [] },
    onDrop: async (acceptedFiles) => {
      const formData = new FormData();
      formData.append("photo", acceptedFiles[0]);
      try {
        const response = await axios.post("/api/users/photo", formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        toast.success("Photo uploaded");
        setUser(prev => prev ? { ...prev, photo: response.data.photo } : prev);
      } catch (err) {
        toast.error("Failed to upload photo");
      }
    },
  });

  const handleUpdate = async () => {
    try {
      const dataToSend = {
        name: user.name,
        location: user.location,
        profilePhoto: profilePhoto,
        availability: user.availability || "Available",
        isPublic: formData.isPublic,
        bio: formData.bio,
        offeredSkills: skillsOffered,
        wantedSkills: skillsWanted,
      };
      await axios.put("http://localhost:5000/api/users/profile", dataToSend, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
      });
      toast.success("Profile updated");
      setFormData(prev => ({
        ...prev,
        name: user.name,
        location: user.location || "",
        availability: user.availability || "",
        bio: user.bio || "",
      }));
    } catch (err) {
      toast.error("Failed to update profile");
    }
  };

  const addSkill = async (type, name) => {
    if (!name) return;
    try {
      await axios.post(
        "/api/skills",
        { name, type },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      toast.success("Skill added");
      const res = await axios.get("/api/users/profile", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setSkillsOffered(res.data.skillsOffered || []);
      setSkillsWanted(res.data.skillsWanted || []);
      setNewSkill(prev => ({ ...prev, [type.toLowerCase()]: "" }));
    } catch (err) {
      toast.error("Failed to add skill");
    }
  };

  return (
    <div className="card shadow-lg" style={{ background: "rgba(255, 255, 255, 0.05)", borderRadius: "15px", maxWidth: "900px", margin: "0 auto" }}>
      <div className="card-body p-5">
        <h1 className="card-title h2 mb-5 text-white text-center" style={{ fontFamily: "'Poppins', sans-serif", textTransform: "uppercase", letterSpacing: "1px" }}>
          Your Profile
        </h1>
        <div className="row g-5 align-items-start">
          <div className="col-md-6">
            <div className="text-center mb-4">
              <div className="position-relative">
                <img
                  src="images/image1.jpg"
                  alt="Profile"
                  className="img-thumbnail rounded-circle border-0"
                  style={{ width: "150px", height: "150px", objectFit: "cover", border: "3px solid #00ddeb", transition: "all 0.3s ease" }}
                />
                <div
                  {...getRootProps()}
                  className="border border-dashed p-3 mt-3 rounded bg-dark text-light cursor-pointer hover:bg-primary transition-all duration-300"
                  style={{ borderColor: "#00ddeb", width: "100%", maxWidth: "300px", margin: "0 auto" }}
                >
                  <input {...getInputProps()} />
                  <p className="mb-0">Drag & drop or click to upload</p>
                </div>
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label text-light">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-control bg-transparent text-white border-light"
                style={{ borderRadius: "10px", transition: "border-color 0.3s ease", padding: "12px" }}
                placeholder="Enter name"
              />
            </div>
            <div className="mb-4">
              <label className="form-label text-light">Location (Optional)</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="form-control bg-transparent text-white border-light"
                style={{ borderRadius: "10px", padding: "12px" }}
                placeholder="Enter location"
              />
            </div>
            <div className="mb-4">
              <label className="form-label text-light">Availability</label>
              <select
                value={formData.availability}
                onChange={(e) => setFormData({ ...formData, availability: e.target.value })}
                className="form-select bg-transparent text-white border-light"
                style={{ borderRadius: "10px", padding: "12px" }}
              >
                <option value="" className="text-dark">Select...</option>
                <option value="Weekends" className="text-dark">Weekends</option>
                <option value="Evenings" className="text-dark">Evenings</option>
                <option value="Anytime" className="text-dark">Anytime</option>
              </select>
            </div>
            <button
              onClick={() => setFormData({ ...formData, isPublic: !formData.isPublic })}
              className={`btn w-100 ${formData.isPublic ? "btn-warning" : "btn-success"}`}
              style={{ borderRadius: "10px", padding: "12px", transition: "all 0.3s ease", fontWeight: "600" }}
            >
              {formData.isPublic ? "Make Private" : "Make Public"}
            </button>
          </div>
          <div className="col-md-6 profile-margin">
            <div className="mb-4">
              <h3 className="h5 mb-3 text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>Skills Offered</h3>
              <ul className="list-group mb-3" style={{ maxHeight: "150px", overflowY: "auto", borderRadius: "10px", background: "rgba(255, 255, 255, 0.03)" }}>
                {skillsOffered.length === 0 ? (
                  <li className="list-group-item bg-transparent text-light border-light text-center py-2">No skills offered</li>
                ) : (
                  skillsOffered.map((skill) => (
                    <li
                      key={skill.id}
                      className="list-group-item bg-transparent text-light border-light d-flex justify-content-between align-items-center py-2"
                      style={{ borderRadius: "5px", transition: "background 0.3s ease" }}
                    >
                      {skill.name}
                    </li>
                  ))
                )}
              </ul>
              <div className="input-group mb-3">
                <input
                  type="text"
                  value={newSkill.offered}
                  onChange={(e) => setNewSkill({ ...newSkill, offered: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addSkill("OFFERED", newSkill.offered)}
                  placeholder="Add skill offered..."
                  className="form-control bg-transparent text-white border-light"
                  style={{ borderRadius: "10px 0 0 10px", padding: "12px" }}
                />
                <button
                  onClick={() => addSkill("OFFERED", newSkill.offered)}
                  className="btn btn-outline-light"
                  style={{ borderRadius: "0 10px 10px 0", transition: "all 0.3s ease", padding: "12px 20px" }}
                >
                  Add
                </button>
              </div>
            </div>
            <div className="mb-4">
              <h3 className="h5 mb-3 text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>Skills Wanted</h3>
              <ul className="list-group mb-3" style={{ maxHeight: "150px", overflowY: "auto", borderRadius: "10px", background: "rgba(255, 255, 255, 0.03)" }}>
                {skillsWanted.length === 0 ? (
                  <li className="list-group-item bg-transparent text-light border-light text-center py-2">No skills wanted</li>
                ) : (
                  skillsWanted.map((skill) => (
                    <li
                      key={skill.id}
                      className="list-group-item bg-transparent text-light border-light d-flex justify-content-between align-items-center py-2"
                      style={{ borderRadius: "5px", transition: "background 0.3s ease" }}
                    >
                      {skill.name}
                    </li>
                  ))
                )}
              </ul>
              <div className="input-group">
                <input
                  type="text"
                  value={newSkill.wanted}
                  onChange={(e) => setNewSkill({ ...newSkill, wanted: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addSkill("WANTED", newSkill.wanted)}
                  placeholder="Add skill wanted..."
                  className="form-control bg-transparent text-white border-light"
                  style={{ borderRadius: "10px 0 0 10px", padding: "12px" }}
                />
                <button
                  onClick={() => addSkill("WANTED", newSkill.wanted)}
                  className="btn btn-outline-light"
                  style={{ borderRadius: "0 10px 10px 0", transition: "all 0.3s ease", padding: "12px 20px" }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="text-center mt-5">
          <button
            onClick={handleUpdate}
            className="btn btn-primary w-50"
            style={{ borderRadius: "10px", padding: "12px", fontWeight: "600", transition: "all 0.3s ease", background: "linear-gradient(45deg, #00ddeb, #00ff85)", maxWidth: "300px" }}
          >
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;