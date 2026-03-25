# Build stage
FROM node:24.9.0-alpine AS builder

WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache python3 make g++

# Copiar archivos de dependencias
COPY package.json ./

# Instalar dependencias
RUN npm install && npm install --only=dev

# Copiar fuentes y artifacts ya compilados
COPY . .

# Runtime stage for general services
FROM node:24.9.0-alpine AS runtime

WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache bash curl

# Copiar dependencias y código desde builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts ./artifacts
COPY . .

# Port por defecto
EXPOSE 8545 9545 3000

# Health check básico
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8545 || exit 1

CMD ["node"]
