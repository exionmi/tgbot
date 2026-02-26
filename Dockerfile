FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci

# Copy source code (node_modules excluded via .dockerignore)
COPY . .

# Rebuild native modules for Linux
RUN npm rebuild better-sqlite3

# Create data directory
RUN mkdir -p /app/data

# Порт Railway назначает сам через $PORT
# EXPOSE убран — Railway автоматически определит порт

CMD ["node", "start.js"]
