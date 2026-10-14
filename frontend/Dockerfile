# GymPulse web app image: build the React app, then serve it with nginx
# Build:  docker build -t gympulse-web --build-arg VITE_API_URL=http://localhost:8000 ./frontend
# Run:    docker run -p 8080:80 gympulse-web

# ---- Stage 1: build the static site ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Vite bakes the API URL into the bundle at build time
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Stage 2: serve it (no Node in the final image) ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
