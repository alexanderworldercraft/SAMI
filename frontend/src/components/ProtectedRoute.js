import React from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';


const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    api.get('/users/me')
      .then(() => {
        if (mounted) setIsAuthenticated(true);
      })
      .catch(() => {
        localStorage.removeItem('token');
        if (mounted) setIsAuthenticated(false);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div>Chargement...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
