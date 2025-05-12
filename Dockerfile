FROM node:18-alpine

WORKDIR /app

# Install Redis client dependencies
RUN apk add --no-cache redis

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Create necessary directories with proper permissions
RUN mkdir -p /app/backups /app/logs /app/uploads && \
    chmod -R 777 /app/backups /app/logs /app/uploads

# Copy source code and env file
COPY . .
COPY .env.server .env

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]