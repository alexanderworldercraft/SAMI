import axios from 'axios';

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;

const api = axios.create({
  baseURL: `${apiBaseUrl}/api`, // URL de base pour les appels API
});

// Ajouter un interceptor pour inclure le token JWT dans chaque requête
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
