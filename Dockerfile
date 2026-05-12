FROM node:20-alpine

WORKDIR /app

# Install root deps (concurrently etc.)
COPY package.json ./
RUN npm install --ignore-scripts 2>/dev/null || true

# ── Build frontend ────────────────────────────────────────────────────────────
COPY frontend/package.json frontend/
RUN cd frontend && npm install

COPY frontend/ frontend/
RUN cd frontend && npm run build

# ── Build backend ─────────────────────────────────────────────────────────────
COPY backend/package.json backend/
RUN cd backend && npm install

COPY backend/ backend/
RUN cd backend && npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
# Uploads dir must exist
RUN mkdir -p backend/data backend/uploads

EXPOSE 3001

CMD ["node", "backend/dist/index.js"]
