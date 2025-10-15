# Use Node.js 18 LTS
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port (Cloud Run will set PORT env variable)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
