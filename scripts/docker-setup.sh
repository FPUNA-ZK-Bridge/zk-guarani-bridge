#!/bin/bash

# Complete Docker setup script
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🐳 Guarani Bridge Docker Setup"
echo "================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Build images
echo "🔨 Building Docker images..."
cd "$PROJECT_DIR"
docker-compose build

echo ""
echo "✅ Images built successfully!"
echo ""

# Ask to start services
read -p "Do you want to start the services now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting services..."
    docker-compose up -d hardhat-n1 anvil-n2
    
    echo ""
    echo "⏳ Waiting for services to be ready..."
    sleep 5
    
    # Run deployment
    read -p "Do you want to deploy contracts now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📦 Running deployment..."
        docker-compose run --rm deployer bash "$SCRIPT_DIR/docker-deploy.sh"
        
        echo ""
        echo "🚀 Starting relayer..."
        docker-compose up -d relayer
    fi
    
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "📊 Service Status:"
    docker-compose ps
    echo ""
    echo "📝 Logs:"
    echo "  docker-compose logs -f hardhat-n1"
    echo "  docker-compose logs -f anvil-n2"
    echo "  docker-compose logs -f relayer"
fi
