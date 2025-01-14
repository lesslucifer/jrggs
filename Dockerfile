# Build stage
FROM node:22.3.0 AS builder

WORKDIR /app

COPY package*.json ./
COPY yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn run build

RUN rm -rf node_modules

# Build production node_modules stage
FROM node:22.3.0 AS builder_prod

WORKDIR /app

COPY package*.json ./
COPY yarn.lock ./

RUN yarn install --only=production --frozen-lockfile

# Production stage
FROM node:22.3.0-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder_prod /app/node_modules ./node_modules

ENV NODE_ENV=production

CMD ["yarn", "serve"]
