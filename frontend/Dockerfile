# GymPulse web app image: build the React app, then serve it with nginx.
# nginx also forwards /api to the API container, so the browser only talks to
# one origin, exactly like the Vite dev proxy (no CORS needed).
#
# Build:  docker build -t gympulse-web \
#           --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... ./frontend

# ---- Stage 1: build the static site ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Vite bakes these into the bundle at build time (publishable key only)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---- Stage 2: serve it (no Node in the final image) ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
