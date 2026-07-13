FROM node:20-alpine

RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
RUN npm ci
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8010
CMD ["sh", "-c", "npm run prisma:migrate:deploy && node dist/main.js"]
