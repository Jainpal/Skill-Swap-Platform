// src/components/SwapDashboard.jsx
import axios from 'axios';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import FeedbackForm from './FeedbackForm';

const SwapDashboard = () => {
  const [swaps, setSwaps] = useState({ pending: [], accepted: [], deleted: [] });
  const [activeTab, setActiveTab] = useState('pending');
  const [user, setUser] = useState(null);

  useEffect(() => {
    axios.get('/api/users/profile', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(res => setUser(res.data))
      .catch(() => setUser(null));
    axios.get('/api/swaps', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(res => setSwaps(res.data))
      .catch(err => toast.error('Failed to load swaps'));
  }, []);

  const handleAction = async (swapId, action) => {
    try {
      await axios.post(`/api/swaps/${action}`, { swapId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast.success(`Swap ${action}d`);
      const res = await axios.get('/api/swaps', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setSwaps(res.data);
    } catch (err) {
      toast.error(`Failed to ${action} swap`);
    }
  };

  return (
    <div className="card shadow">
      <div className="card-body">
        <h1 className="card-title h2 mb-4 text-white">Your Swaps</h1>
        <ul className="nav nav-tabs mb-4">
          {['pending', 'accepted', 'deleted'].map(tab => (
            <li key={tab} className="nav-item">
              <button
                className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
                style={activeTab === tab ? { background: '#00ddeb', color: '#1a1a2e' } : {}}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            </li>
          ))}
        </ul>
        <div>
          {swaps[activeTab] && swaps[activeTab].map(swap => (
            <div key={swap.id} className="card mb-3">
              <div className="card-body">
                <p className="text-light"><strong>Sender:</strong> {swap.sender.name}</p>
                <p className="text-light"><strong>Receiver:</strong> {swap.receiver.name}</p>
                <p className="text-light"><strong>Offered:</strong> {swap.offeredSkill.name}</p>
                <p className="text-light"><strong>Wanted:</strong> {swap.wantedSkill.name}</p>
                {activeTab === 'pending' && user && (
                  <div className="d-flex gap-2 mt-3">
                    {swap.receiverId === user.id && (
                      <>
                        <button onClick={() => handleAction(swap.id, 'accept')} className="btn btn-success">Accept</button>
                        <button onClick={() => handleAction(swap.id, 'reject')} className="btn btn-danger">Reject</button>
                      </>
                    )}
                    {swap.senderId === user.id && (
                      <button onClick={() => handleAction(swap.id, 'delete')} className="btn btn-secondary">Delete</button>
                    )}
                  </div>
                )}
                {activeTab === 'accepted' && user && <FeedbackForm swapId={swap.id} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SwapDashboard;