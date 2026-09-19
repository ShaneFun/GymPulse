import axios from 'axios';
import { supabase } from '../lib/supabase';

const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (error) => {
    // A rejected token means the session is no longer usable; drop it so the
    // app falls back to the login screen rather than looping on failures.
    if (error.response?.status === 401) supabase.auth.signOut();
    return Promise.reject(error);
  }
);

export const fitnessApi = {
  // Feature 1: Programs
  getPrograms: () => apiClient.get('/programs'),
  createProgram: (name) => apiClient.post('/programs', { name }),

  // Feature 2: Schedules
  getSchedules: (programId) => apiClient.get(`/schedules?program_id=${programId}`),
  createSchedule: (scheduleData) => apiClient.post('/schedules', scheduleData),
  advanceSchedule: (scheduleId) => apiClient.post(`/schedules/${scheduleId}/advance`),

  // Feature 3 & 4: Logs & Analysis
  logWorkout: (logData) => apiClient.post('/workout-logs', logData),
  getAnalysis: (scheduleId) => apiClient.get(`/analysis/${scheduleId}`),
};