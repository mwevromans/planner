# --- frontend bouwen ---
FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- backend bouwen ---
FROM node:24-alpine AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

# --- runtime ---
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/planner.db FRONTEND_DIR=/app/frontend/dist
WORKDIR /app
COPY --from=backend /app/backend/dist ./backend/dist
COPY --from=backend /app/backend/node_modules ./backend/node_modules
COPY --from=backend /app/backend/package.json ./backend/package.json
COPY --from=frontend /app/frontend/dist ./frontend/dist
COPY tutor ./tutor
VOLUME /data
EXPOSE 3000
CMD ["node", "backend/dist/index.js"]
