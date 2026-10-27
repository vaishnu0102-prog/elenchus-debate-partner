FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY public ./public
COPY db ./db

EXPOSE 3000

CMD ["npm", "start"]