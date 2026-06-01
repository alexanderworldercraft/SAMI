import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await api.get('/users/me');
        console.log('User profile data'); //console.log('User profile data:', response.data);
        setUser(response.data);
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        navigate('/login');
      }
    };
  
    fetchUserProfile();
  }, [navigate]);  

  if (!user) {
    return <div className="dark:text-white">Loading...</div>;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="dark:text-white p-8 w-96">
        <h2 className="text-2xl font-bold mb-6">Votre Profil</h2>
        {user.CheminImage && (
          <div className='mb-6 rounded-lg w-48 h-48 mx-auto overflow-hidden'>
            <img
            src={user.CheminImage}
            alt="Profile"
            className="h-full w-full object-cover"
          />
          </div>
        )}
        <p><strong>Surnom :</strong> <span className='italic text-sky-600'>{user.Surnom}</span></p>
        <p><strong>Email :</strong> <span className='italic text-sky-600'>{user.Email}</span></p>
        <p><strong>Grade :</strong> <span className='italic text-sky-600'>{user.GradeID}</span></p>
      </div>
    </div>
  );  
};

export default ProfilePage;