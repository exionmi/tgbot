FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and rebuild native modules
RUN npm ci --omit=dev && npm rebuild better-sqlite3

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "start.js"]
