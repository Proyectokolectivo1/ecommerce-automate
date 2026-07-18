# Dockerfile para mini-services/realtime
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 3003
CMD ["node", "index.js"]
