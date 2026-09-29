<div align="center">
  <h1>💪 GymPulse (AI Fitness Analyzer)</h1>
  <p><strong>AI-powered fitness tracking using real-time computer vision.</strong></p>

  <!-- Badges -->
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/Frontend-React-blue?style=flat-square&logo=react" alt="React" /></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi" alt="FastAPI" /></a>
  <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Database-Supabase-3ECF8E?style=flat-square&logo=supabase" alt="Supabase" /></a>
  <a href="https://google.github.io/mediapipe/"><img src="https://img.shields.io/badge/AI-MediaPipe-orange?style=flat-square&logo=google" alt="MediaPipe" /></a>
</div>

<br />

GymPulse is an intelligent web application designed to automatically track, count, and analyze your workout sessions. By leveraging **client-side machine learning**, the app evaluates your form and rep counts in real time, all without compromising your privacy.

## 📋 Table of Contents
- [✨ Key Features](#-key-features)
- [🏗 Architecture & Tech Stack](#-architecture--tech-stack)
- [🚀 Getting Started](#-getting-started)
- [🧠 How the AI Works](#-how-the-ai-works)

---

## ✨ Key Features

- **📸 Computer Vision Rep Counting**
  Tracks 8 different exercises (Squats, Bicep Curls, Push-ups, etc.) by mapping 33 3D anatomical body keypoints using the device camera.
- **📊 Automated Analytics & Progression**
  Logs your performance and compares it against your customized target schedules. Automatically assigns PASS/FAIL scores and generates progressive overload recommendations.
- **📈 Visual Progress Dashboard**
  Interactive charts tracking your strength progression and completion rates over time.

---

## 🏗 Architecture & Tech Stack

### Frontend
- **React.js & Vite**: Fast, modern UI development.
- **HTML5 Canvas**: For drawing live skeletal overlay networks on top of the webcam feed.
- **Chart.js**: For interactive data visualization.

### Backend
- **FastAPI (Python)**: High-performance async API for schedule management and workout evaluation logic.
- **Supabase**: PostgreSQL database for persistent logging and user tracking.

---

## 🚀 Getting Started

Follow these instructions to run the project locally.

### 1. Backend Setup

```bash
# Navigate to project root and create a virtual environment
python -m venv venv

# Activate the virtual environment
source venv/Scripts/activate  # (On Windows)
# source venv/bin/activate    # (On Mac/Linux)

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file in the root directory with your Supabase credentials:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

Start the FastAPI server:
```bash
python backend/app/main.py
```
*The API will be available at `http://localhost:8000`*

### 2. Frontend Setup

Open a new terminal window:
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```
*The app will be available at `http://localhost:5173`*

---

## 🧠 How the AI Works

1. **Privacy-First Pose Estimation**: The Google MediaPipe Pose neural network runs entirely inside your browser via WebAssembly. **No video data is ever sent to a server.**
2. **Kinematic Math**: The app extracts the coordinates for specific joints (e.g., Hip, Knee, Ankle for squats) and calculates the internal angles using vector trigonometry. 
3. **State Machine & Signal Processing**: The raw angle data is passed through a 5-frame moving average filter to eliminate sensor jitter. The smoothed angles trigger state transitions (e.g., `down` -> `up`) to register perfect repetitions.
