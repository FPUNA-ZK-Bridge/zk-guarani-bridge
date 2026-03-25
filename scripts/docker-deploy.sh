#!/bin/bash

# Script to deploy contracts after Docker services are up
set -e

echo "🚀 Starting Guarani Bridge deployment..."

# Wait for services to be ready
echo "⏳ Waiting for Hardhat (L1)..."
timeout 60 bash -c 'until curl -s http://hardhat-n1:8545 > /dev/null; do sleep 2; done' || exit 1

echo "⏳ Waiting for Anvil (L2)..."
timeout 60 bash -c 'until curl -s http://anvil-n2:9545 > /dev/null; do sleep 2; done' || exit 1

echo "✅ Services are ready!"

# Deploy to L1
echo "📦 Deploying GuaraniToken and Sender to L1..."
npm run deploy:n1

# Deploy to L2
echo "📦 Deploying Receiver to L2..."
npm run deploy:n2

# Generate config if needed
echo "⚙️ Generating configuration..."
npm run config

echo "✅ Deployment complete!"
echo ""
echo "📄 Deployment files:"
echo "  - deploy-N1.json (L1 contracts)"
echo "  - deploy-N2.json (L2 contracts)"
echo ""
echo "🌉 Bridge is ready to use!"
