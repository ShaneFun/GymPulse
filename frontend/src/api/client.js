import axios from 'axios';

const apiClient = axios.create({
  // set VITE_API_URL when deploying (e.g. on Vercel); falls back to the local backend
  baseURL: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fitnessApi = {
  // Feature 1: Programs
  getPrograms: () => apiClient.get('/programs'),
  createProgram: (name) => apiClient.post('/programs', { name }),

  // Feature 2: Schedules
  getSchedules: (programId) => apiClient.get(`/schedules?program_id=${programId}`),
  createSchedule: (scheduleData) => apiClient.post('/schedules', scheduleData),

  // Feature 3 & 4: Logs & Analysis
  logWorkout: (logData) => apiClient.post('/workout-logs', logData),
  getAnalysis: (scheduleId) => apiClient.get(`/analysis/${scheduleId}`),
};