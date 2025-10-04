FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm i
COPY . .
EXPOSE 5173
ENV VITE_API_BASE=${VITE_API_BASE}
CMD ["npm", "run", "dev"]  # dev server at 0.0.0.0:5173
