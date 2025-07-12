// src/components/SkillSearch.jsx
import axios from 'axios';
import { useState } from 'react';
import { toast } from 'react-toastify';

const SkillSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async () => {
    try {
      const res = await axios.get(`/api/skills/search?query=${query}`);
      setResults(res.data);
    } catch (err) {
      toast.error('Search failed');
    }
  };

  const requestSwap = async (userId, offeredSkillId, wantedSkillId) => {
    try {
      await axios.post('/api/swaps/request', { receiverId: userId, offeredSkillId, wantedSkillId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast.success('Swap requested');
    } catch (err) {
      toast.error('Failed to request swap');
    }
  };

  return (
    <div className="card shadow">
      <div className="card-body">
        <h1 className="card-title h2 mb-4 text-white">Find Skills</h1>
        <div className="input-group mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search skills (e.g., Photoshop, Excel)"
            className="form-control"
          />
          <button onClick={handleSearch} className="btn btn-primary">Search</button>
        </div>
        <div className="row row-cols-1 row-cols-md-2 g-4">
          {results.map(user => (
            <div key={user.id} className="col">
              <div className="card h-100">
                <div className="card-body">
                  <h3 className="card-title h5 text-white">{user.name}</h3>
                  <p className="card-text text-light"><strong>Offers:</strong> {user.skillsOffered.map(s => s.name).join(', ')}</p>
                  <p className="card-text text-light"><strong>Wants:</strong> {user.skillsWanted.map(s => s.name).join(', ')}</p>
                </div>
                <div className="card-footer bg-transparent border-0">
                  <button
                    onClick={() => requestSwap(user.id, user.skillsOffered[0]?.id, user.skillsWanted[0]?.id)}
                    className="btn btn-success w-100"
                    disabled={!user.skillsOffered[0] || !user.skillsWanted[0]}
                  >
                    Request Swap
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SkillSearch;