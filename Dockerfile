FROM node:22-slim

WORKDIR /app

# Copy ONLY the dependency manifest first, then install.
# This is the caching trick: if package.json hasn't changed between builds,
# Docker reuses the cached "npm install" layer instead of re-downloading
# everything. Order matters a lot for build speed.
COPY package*.json ./
RUN npm install --omit=dev

# Now copy the rest of the source code.
COPY . .

# Document the port the app listens on (informational).
EXPOSE 3000

# Run as a non-root user (the node image ships with one). Basic container security:
# if the app is compromised, the attacker isn't root inside the container.
USER node

# The command that launches the app when a container starts.
CMD ["node", "server.js"]