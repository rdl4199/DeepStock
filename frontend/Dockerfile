# frontend/Dockerfile
FROM node:20-alpine
WORKDIR /app

# install deps first for better caching
COPY package.json package-lock.json* ./
RUN npm ci

# bring in the app
COPY . .

EXPOSE 5173
ENV VITE_API_BASE=${VITE_API_BASE}

# IMPORTANT: no inline comment here
CMD ["npm", "run", "dev"]
