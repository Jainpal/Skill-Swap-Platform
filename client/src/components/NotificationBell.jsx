// src/components/NotificationBell.jsx
import axios from 'axios';
import { useEffect, useState } from 'react';
import { FaBell } from 'react-icons/fa';
import { toast } from 'react-toastify';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await axios.get('/api/notifications', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        setNotifications(res.data);
      } catch (err) {
        toast.error('Failed to load notifications');
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (messageId) => {
    try {
      await axios.post('/api/admin/messages/read', { messageId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setNotifications(notifications.filter(n => n.id !== messageId));
    } catch (err) {
      toast.error('Failed to mark as read');
    }
  };

  const count = notifications.length;

  return (
    <div className="position-relative">
      <button className="btn btn-link p-0" onClick={() => setShow(!show)}>
        <FaBell size={24} className="text-light" />
        {count > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill">
            {count}
          </span>
        )}
      </button>
      {show && (
        <div className="notification-dropdown position-absolute end-0 mt-2 p-3" style={{ minWidth: '300px', zIndex: 1000 }}>
          <h6 className="mb-3 text-white">Notifications</h6>
          {notifications.length === 0 ? (
            <p className="text-muted">No new notifications</p>
          ) : (
            notifications.map(notification => (
              <div key={notification.id} className="mb-2">
                <p className="mb-1 text-light">{notification.message}</p>
                {notification.type === 'admin' && (
                  <button
                    className="btn btn-sm btn-outline-light"
                    onClick={() => markAsRead(notification.id)}
                  >
                    Mark as Read
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;