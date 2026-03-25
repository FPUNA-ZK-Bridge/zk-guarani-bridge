# Guarani Bridge

Puente de tokens descentralizado que permite transferir **GuaraniTokens** entre dos cadenas (L1 ↔ L2) usando el patron **lock-and-mint** con proteccion contra replay attacks.

## Quick Start

Todo el proyecto se controla con una sola variable: `BRIDGE_ENV` en `.env`.

### Local (default)

```bash
npm install

# Terminal 1 - L1 (Hardhat, puerto 8545)
npm run node:n1

# Terminal 2 - L2 (Anvil, puerto 9545)
npm run node:n2

# Terminal 3 - Deploy y relayer
npm run deploy:n1        # despliega en localN1
npm run deploy:n2        # despliega en localN2
npm run relayer
```

Las cuentas locales se derivan automaticamente del mnemonic de Hardhat. No se necesitan private keys.

### Testnet

```bash
# 1. Cambiar en .env:
BRIDGE_ENV=testnet

# 2. Completar las private keys en .env (ver .env.example)

# 3. Deploy y relayer (no se necesitan nodos locales)
npm run deploy:n1        # despliega en Ephemery
npm run deploy:n2        # despliega en BlockDAG
npm run relayer
```

### Frontend (opcional, ambos entornos)

```bash
npm run config           # genera config del frontend desde deploy-*.json
npm run frontend         # http://localhost:3000
```

## Como Funciona

```
    L1 (Chain N1)                            L2 (Chain N2)
    ┌─────────────────────────┐              ┌─────────────────────────┐
    │  GuaraniToken            │              │  GuaraniToken            │
    │  Sender Contract        │              │  Receiver Contract      │
    └────────────┬────────────┘              └────────────▲────────────┘
                 │                                        │
                 │ 1. lock(recipient, amount)             │ 3. mintRemote()
                 │    tokens bloqueados                   │    tokens creados en L2
                 │    emite evento "Locked"               │    emite evento "Minted"
                 │                                        │
                 └──────────────┐                         │
                                ▼                         │
                       ┌─────────────────┐                │
                       │    RELAYER      │────────────────┘
                       │                 │
                       │ 2. Escucha      │
                       │    "Locked"     │
                       └─────────────────┘
```

1. Usuario aprueba tokens al contrato Sender en L1
2. Usuario llama `lock(recipientL2, amount)` → tokens se bloquean, se emite evento `Locked`
3. Relayer detecta el evento y ejecuta `mintRemote()` en el Receiver de L2
4. Se acunan tokens equivalentes para el destinatario en L2

## Configuracion de Entorno

El archivo `.env` controla todo. Copia `.env.example` como punto de partida:

```bash
cp .env.example .env
```

| Variable | Descripcion |
|----------|-------------|
| `BRIDGE_ENV` | `local` o `testnet` — unica variable requerida para cambiar de entorno |
| `EPHEMERY_RPC_URL` | RPC de Ephemery (solo testnet) |
| `EPHEMERY_PRIVATE_KEY` | Private key para Ephemery (solo testnet) |
| `BLOCKDAG_RPC_URL` | RPC de BlockDAG (solo testnet) |
| `BLOCKDAG_PRIVATE_KEY` | Private key para BlockDAG (solo testnet) |
| `PRIVATE_KEY_RELAYER` | Private key del relayer (solo testnet) |
| `RELAYER_ADDRESS` | Direccion del relayer (solo testnet) |

**En modo local** todas las cuentas (deployer, relayer, usuarios) se derivan automaticamente del mnemonic de Hardhat. No se necesita configurar nada mas.

## Redes Soportadas

| Entorno | L1 (N1) | L2 (N2) |
|---------|---------|---------|
| `local` | Hardhat — `localhost:8545`, chainId 31337 | Anvil — `localhost:9545`, chainId 1338 |
| `testnet` | Ephemery — configurable via `.env` | BlockDAG — configurable via `.env` |

## Docker Compose (alternativa)

Para correr todo en contenedores (usa redes Docker internas, independiente de `BRIDGE_ENV`):

```bash
docker compose build
docker compose up -d hardhat-n1 anvil-n2

# Esperar a que hardhat-n1 este healthy
docker compose ps

# Deploy
docker compose run --rm deployer npx hardhat run scripts/deployN1.js --network dockerN1
docker compose run --rm deployer npx hardhat run scripts/deployN2.js --network dockerN2

# Servicios
docker compose up -d relayer frontend
```

- **Frontend**: http://localhost:3000
- **L1 RPC**: http://localhost:8545
- **L2 RPC**: http://localhost:9545

## Contratos

| Contrato | Descripcion |
|----------|-------------|
| `GuaraniToken.sol` | Token ERC20 con mint/burn y roles |
| `Sender.sol` | Bloquea tokens en L1, emite evento `Locked` |
| `Receiver.sol` | Acuna tokens en L2 tras verificacion del relayer |
| `Verifier.sol` | Verificacion criptografica adicional (opcional) |

## Seguridad

- **Nonce incremental**: Cada transferencia tiene un ID unico
- **Replay protection**: Mapping de transacciones procesadas previene duplicados
- **Role-based access**: Solo el relayer autorizado puede acunar tokens

## Scripts Utiles

```bash
npm run compile          # Compilar contratos
npm run deploy:n1        # Deploy en N1 (segun BRIDGE_ENV)
npm run deploy:n2        # Deploy en N2 (segun BRIDGE_ENV)
npm run relayer          # Iniciar relayer
npm run config           # Generar config del frontend
npm run frontend         # Servidor frontend en :3000

npm test                 # Todos los tests
npm run test:bridge      # Tests del puente
```

## MetaMask (modo local)

| Red | RPC URL | Chain ID |
|-----|---------|----------|
| L1 Hardhat | http://localhost:8545 | 31337 |
| L2 Anvil | http://localhost:9545 | 1338 |

Cuenta de prueba (pre-funded):
```
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

## Estructura del Proyecto

```
guarani-bridge/
├── contracts/           # Contratos Solidity
├── scripts/             # Deploy y utilidades
│   ├── deployN1.js      # Deploy L1
│   ├── deployN2.js      # Deploy L2
│   └── resolve-network.js  # Resuelve red segun BRIDGE_ENV
├── relayer/             # Servicio relayer (Node.js)
├── public/              # Frontend web
├── utils/               # Utilidades (accounts, etc.)
├── bridge-env.js        # Configuracion centralizada local/testnet
├── hardhat.config.js    # Config de Hardhat (redes dinamicas)
├── deploy-N1.json       # Direcciones desplegadas en N1 (generado)
├── deploy-N2.json       # Direcciones desplegadas en N2 (generado)
└── bridge-config.json   # Config del frontend (generado)
```

## Troubleshooting

**"Contract not found" en el frontend**: Los contratos no estan desplegados. Ejecutar `npm run deploy:n1` y `npm run deploy:n2`.

**"Internal JSON-RPC error"**: Problemas de nonce o falta de tokens. Resetear cuenta en MetaMask y/o mintear tokens.

**Relayer no procesa eventos**: Verificar que el relayer esta corriendo y que las direcciones en `deploy-N1.json` / `deploy-N2.json` son correctas.
