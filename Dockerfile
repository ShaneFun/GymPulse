# GymPulse API (FastAPI) image
# Build:  docker build -t gympulse-api .
# Run:    docker run -p 8000:8000 --env-file .env gympulse-api
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first so this layer is cached between code changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./backend/app

# Don't run as root inside the container
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

# main.py is a standalone module; --app-dir puts backend/app on the import path.
# Hosting platforms (e.g. Render) set $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn main:app --app-dir backend/app --host 0.0.0.0 --port ${PORT:-8000}"]
