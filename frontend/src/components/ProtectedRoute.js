import React from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';


const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');

  if (!token || token === 'undefined') {
    return <Navigate to="/login" replace />;
  }

  try {
    // Décoder le token pour vérifier son expiration
    const decodedToken = jwtDecode(token);
    const currentTime = Date.now() / 1000; // Convertir le temps actuel en secondes

    if (decodedToken.exp < currentTime) {
      // Token expiré
      localStorage.removeItem('token'); // Supprime le token expiré
      return <Navigate to="/login" replace />;
    }
  } catch (error) {
    console.error("Invalid token:", error);
    localStorage.removeItem('token');
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;