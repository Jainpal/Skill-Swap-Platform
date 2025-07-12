// src/pages/Home.jsx
import { Link } from 'react-router-dom';

const Home = () => {
  return (
    <div className="container py-5 text-center">
      <h1 className="display-4 text-white mb-4">Welcome to Skill Swap</h1>
      <p className="lead text-light mb-5">
        Connect with others to exchange skills and learn something new!
      </p>
      <div className="d-flex justify-content-center gap-3">
        <Link to="/register" className="btn btn-primary btn-lg">
          Get Started
        </Link>
        <Link to="/search" className="btn btn-outline-light btn-lg">
          Browse Skills
        </Link>
      </div>
    </div>
  );
};

export default Home;