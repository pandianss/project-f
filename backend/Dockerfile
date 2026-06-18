# Fasal Mitra AI — core API
# Runs TypeScript directly via tsx (no separate build step).
FROM node:22-slim

WORKDIR /app

# Install deps (incl. tsx, used at runtime) with reproducible lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# App source
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
# Platforms inject PORT; default to 3001 for local container runs.
ENV PORT=3001
EXPOSE 3001

# Migrate then serve. DATABASE_URL must be provided by the platform.
CMD ["npm", "run", "start:prod"]
