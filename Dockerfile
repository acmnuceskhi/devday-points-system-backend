FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/
RUN npm ci && npx prisma generate && npm prune --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
