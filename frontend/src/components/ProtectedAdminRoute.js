import React from 'react';
import api from '../services/api';
import { Navigate } from 'react-router-dom';

function ProtectedAdminRoute({ children }) {
    const token = localStorage.getItem("token");
    const [isAuthorized, setIsAuthorized] = React.useState(false);
    const [loading, setLoading] = React.useState(true);
  
    React.useEffect(() => {
      const checkAuthorization = async () => {
        try {
          const response = await api.get("/users/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
  
          const { GradeID } = response.data;
          if (GradeID === 1 || GradeID === 2) {
            setIsAuthorized(true);
          } else {
            setIsAuthorized(false);
          }
        } catch (err) {
          setIsAuthorized(false);
        } finally {
          setLoading(false);
        }
      };
  
      if (token) {
        checkAuthorization();
      } else {
        setLoading(false);
      }
    }, [token]);
  
    if (loading) {
      return <div>Chargement...</div>;
    }
  
    if (!isAuthorized) {
      return <Navigate to="/" replace />;
    }
  
    return children;
  }  

export default ProtectedAdminRoute;