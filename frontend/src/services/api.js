import axios from 'axios';

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;

const api = axios.create({
  baseURL: `${apiBaseUrl}/api`, // URL de base pour les appels API
  withCredentials: true,
});

export default api;
