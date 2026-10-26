import { SESSION_CHANGED_EVENT } from "../utils/sessionEvents";
import axios from 'axios';

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;

const api = axios.create({
  baseURL: `${apiBaseUrl}/api`, // URL de base pour les appels API
  withCredentials: true,
});

api.interceptors.response.use(response => response, error => {
  if (error.response?.data?.code === "PASSWORD_CHANGE_REQUIRED") {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: { passwordChangeRequired: true } }));
  }
  return Promise.reject(error);
});

export default api;
