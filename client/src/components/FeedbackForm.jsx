// src/components/FeedbackForm.jsx
import axios from 'axios';
import { useState } from 'react';
import { toast } from 'react-toastify';

const FeedbackForm = ({ swapId }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const submitFeedback = async () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }
    try {
      await axios.post('/api/feedback', { swapId, rating, comment }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast.success('Feedback submitted');
      setRating(0);
      setComment('');
    } catch (err) {
      toast.error('Failed to submit feedback');
    }
  };

  return (
    <div className="card mt-3">
      <div className="card-body">
        <h3 className="card-title h5 mb-3 text-white">Leave Feedback</h3>
        <div className="d-flex gap-1 mb-3">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={`btn p-0 ${star <= rating ? 'text-warning' : 'text-muted'}`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment..."
          className="form-control mb-3"
          rows="4"
        />
        <button onClick={submitFeedback} className="btn btn-primary w-100">Submit Feedback</button>
      </div>
    </div>
  );
};

export default FeedbackForm;