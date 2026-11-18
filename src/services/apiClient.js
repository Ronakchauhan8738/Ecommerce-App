import axios from 'axios';

const normalizeUrl = (url = '') => {
  let cleanUrl = url.trim().replace(/\/$/, '');
  if (cleanUrl && !cleanUrl.endsWith('/api')) {
    cleanUrl = `${cleanUrl}/api`;
  }
  return cleanUrl;
};

const resolveBaseURL = () => {
  // Check for React App env vars (Create React App)
  const craUrl = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL;
  if (craUrl) {
    return normalizeUrl(craUrl);
  }

  // Support Vite environment variable if provided (e.g. VITE_API_URL or REACT_APP_VITE_API_URL)
  let viteUrl = '';
  try {
    if (typeof process !== 'undefined' && process?.env) {
      viteUrl = process.env.VITE_API_URL || process.env.REACT_APP_VITE_API_URL;
    }
  } catch (e) {
    // ignore
  }
  if (viteUrl) {
    return normalizeUrl(viteUrl);
  }

  if (process.env.REACT_APP_API_USE_PROXY === 'true') {
    return '/api';
  }

  // When running locally in browser or Node
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:5001/api';
  }

  // Default production fallback pointing to Render backend
  return 'https://techkart-kd9f.onrender.com/api';
};

export const API_BASE_URL = resolveBaseURL();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('MERNEcommerceToken');
  if (token) {
    config.headers['x-auth-token'] = token;
  }
  return config;
});

export async function withRetry(request, { retries = 2, delay = 400 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      const status = error?.response?.status;
      if (status && status >= 400 && status < 500) {
        throw error;
      }
      lastError = error;
      if (attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
    }
  }
  throw lastError;
}
