# Build the frontend, then run the combined server (static app + /ws
# signalling) as a single small Node process.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 3001
# Terminate TLS in front of this (Caddy / nginx / a PaaS) — WebRTC requires
# the page to be served over HTTPS everywhere except localhost.
CMD ["node", "server/index.js"]
