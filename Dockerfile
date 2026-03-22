# Use an official Node.js runtime as a parent image
FROM node:25-alpine AS build

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of your application code
COPY . .

# Expose the port your app runs on
EXPOSE 3550

# Define the command to run your app
CMD ["node", "server.js"]
