import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import logoImg from '../../assets/logo.jpg';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response) {
        // Server responded with an error status
        const status = err.response.status;
        const detail = err.response.data?.detail;
        if (status === 401) {
          setError(detail || 'Login failed. Please check your credentials.');
        } else if (status === 422) {
          setError('Invalid input. Please enter a valid email and password.');
        } else {
          setError(detail || `Server error (${status}). Please try again later.`);
        }
      } else if (err.request) {
        // Request was made but no response received (server down / network issue)
        setError('Unable to connect to the server. Please check if the server is running and try again.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2D2A6E] via-[#3D3B8E] to-[#5553A0]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo / Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl mb-4 shadow-lg overflow-hidden bg-white border-2 border-gray-100">
              <img src={logoImg} alt="School Logo" className="w-full h-full object-contain p-1" />
            </div>
            <h1 className="text-xl font-extrabold tracking-wide" style={{ color: '#3D3B8E' }}>SRI SAI PRASANTHI VIDYANIKETAN</h1>
            <p className="text-gray-400 text-sm mt-1 tracking-widest uppercase font-medium">School Management System</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-[#E84040] p-4 mb-6 rounded">
              <div className="flex items-center">
                <span className="text-[#E84040] mr-2">⚠️</span>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F5A623] focus:border-transparent outline-none transition duration-200"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F5A623] focus:border-transparent outline-none transition duration-200"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: loading ? '#E8890C' : 'linear-gradient(135deg, #F5A623, #E8890C)' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#E8890C'; }}
              onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #F5A623, #E8890C)'; }}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Role Info */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-400 text-center">
              SRI SAI PRASANTHI VIDYANIKETAN
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
