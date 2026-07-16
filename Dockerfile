FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
COPY server.mjs ./
COPY webapp ./webapp

EXPOSE 8080

CMD ["node", "server.mjs"]
