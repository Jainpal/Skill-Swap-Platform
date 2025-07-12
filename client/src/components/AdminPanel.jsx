// src/components/AdminPanel.jsx
import axios from 'axios';
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Title, Tooltip } from 'chart.js';
import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { toast } from 'react-toastify';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

const AdminPanel = () => {
  const [swaps, setSwaps] = useState([]);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const swapsRes = await axios.get('/api/admin/swaps', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        setSwaps(swapsRes.data);
        const usersRes = await axios.get('/api/admin/users', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        setUsers(usersRes.data);

        // Chart data
        const pending = swapsRes.data.filter(s => s.status === 'PENDING').length;
        const accepted = swapsRes.data.filter(s => s.status === 'ACCEPTED').length;
        const deleted = swapsRes.data.filter(s => s.status === 'DELETED').length;
        setChartData({
          labels: ['Pending', 'Accepted', 'Deleted'],
          datasets: [{
            label: 'Swap Statuses',
            data: [pending, accepted, deleted],
            backgroundColor: ['#00ddeb', '#00ff85', '#ff2e63'],
            borderColor: ['#00b4d8', '#00cc66', '#cc244f'],
            borderWidth: 1,
          }],
        });
      } catch (err) {
        toast.error('Failed to load data');
      }
    };
    fetchData();
  }, []);

  const rejectSkill = async (skillId) => {
    try {
      await axios.post('/api/admin/reject-skill', { skillId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast.success('Skill rejected');
      const res = await axios.get('/api/admin/users', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setUsers(res.data);
    } catch (err) {
      toast.error('Failed to reject skill');
    }
  };

  const banUser = async (userId) => {
    try {
      await axios.post('/api/admin/ban-user', { userId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast.success('User banned');
      const res = await axios.get('/api/admin/users', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setUsers(res.data);
    } catch (err) {
      toast.error('Failed to ban user');
    }
  };

  const sendMessage = async () => {
    if (!message) {
      toast.error('Message cannot be empty');
      return;
    }
    try {
      await axios.post('/api/admin/messages', { content: message }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast.success('Message sent');
      setMessage('');
    } catch (err) {
      toast.error('Failed to send message');
    }
  };

  return (
    <div className="card shadow">
      <div className="card-body">
        <h1 className="card-title h2 mb-4 text-white">Admin Panel</h1>
        {chartData && (
          <div className="mb-4">
            <h3 className="h5 mb-3 text-white">Swap Status Distribution</h3>
            <Bar
              data={chartData}
              options={{
                scales: {
                  y: { beginAtZero: true, title: { display: true, text: 'Number of Swaps', color: '#e0e0e0' } },
                  x: { title: { display: true, text: 'Status', color: '#e0e0e0' } },
                },
                plugins: {
                  legend: { display: false },
                  title: { display: true, text: 'Swap Status Distribution', color: '#e0e0e0' },
                },
              }}
            />
          </div>
        )}
        <div className="mb-4">
          <h3 className="h5 mb-2 text-white">Send Platform Message</h3>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="form-control mb-3"
            placeholder="Enter platform-wide message..."
            rows="4"
          />
          <button onClick={sendMessage} className="btn btn-primary w-100 w-md-auto">Send Message</button>
        </div>
        <div className="mb-4">
          <h3 className="h5 mb-2 text-white">Swaps</h3>
          <div className="table-responsive">
            <table className="table table-bordered text-light">
              <thead>
                <tr>
                  <th>Swap ID</th>
                  <th>Sender</th>
                  <th>Receiver</th>
                  <th>Offered Skill</th>
                  <th>Wanted Skill</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {swaps.map(swap => (
                  <tr key={swap.id}>
                    <td>{swap.id}</td>
                    <td>{swap.sender.name}</td>
                    <td>{swap.receiver.name}</td>
                    <td>{swap.offeredSkill.name}</td>
                    <td>{swap.wantedSkill.name}</td>
                    <td>{swap.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mb-4">
          <h3 className="h5 mb-2 text-white">Users</h3>
          <div className="table-responsive">
            <table className="table table-bordered text-light">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Skills Offered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.skillsOffered.map(s => s.name).join(', ')}</td>
                    <td>
                      <div className="d-flex gap-2">
                        {user.skillsOffered.map(skill => (
                          <button
                            key={skill.id}
                            onClick={() => rejectSkill(skill.id)}
                            className="btn btn-danger btn-sm"
                          >
                            Reject {skill.name}
                          </button>
                        ))}
                        <button
                          onClick={() => banUser(user.id)}
                          className="btn btn-danger btn-sm"
                        >
                          Ban User
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <a href="/api/admin/reports" className="btn btn-primary">Download Reports</a>
      </div>
    </div>
  );
};

export default AdminPanel;