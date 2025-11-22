import React, { useEffect, useState } from 'react';
import Profile from '../../components/Profile';
import { axiosInstance } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const AdminProfilePage: React.FC = () => {
  useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Replace with API call that uses runtime-aware axiosInstance
    axiosInstance.get('/admin/profile')
      .then(resp => {
        setProfile(resp.data);
        setError(null);
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading profile...</div>;
  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;
  if (!profile) return <div className="p-8 text-center text-gray-400">No profile data.</div>;

  return <Profile profile={profile} onProfileUpdate={setProfile} />;
};

export default AdminProfilePage;
