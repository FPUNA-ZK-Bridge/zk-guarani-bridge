<div align="center">

# 🌉 ZK Guarani Bridge

### *Puente cross-chain con verificación Zero-Knowledge del estado de Ethereum*

[![Status](https://img.shields.io/badge/Status-Research_Prototype-orange?style=flat-square)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](#-licencia)
[![Circom](https://img.shields.io/badge/Circom-2.0+-1A73E8?style=flat-square)](https://docs.circom.io/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.x-363636?style=flat-square&logo=solidity&logoColor=white)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-FFF100?style=flat-square&logo=hardhat&logoColor=black)](https://hardhat.org/)
[![Foundry](https://img.shields.io/badge/Foundry-Anvil-363636?style=flat-square)](https://book.getfoundry.sh/)

[**📋 Setup**](#-1-requisitos-previos) ·
[**🚀 Quickstart**](#-3-probar-el-bridge-en-local) ·
[**🏛 Arquitectura**](#%EF%B8%8F-decisiones-de-arquitectura) ·
[**🔒 Seguridad**](#-10-seguridad) ·
[**🐛 Troubleshooting**](#-9-troubleshooting)

</div>

---

## 🎓 Sobre este proyecto

Este repositorio es el **prototipo de referencia** del proyecto de investigación [**FPUNA-ZK-Bridge**](https://github.com/FPUNA-ZK-Bridge), desarrollado como parte de una tesis de grado en la **Facultad Politécnica – Universidad Nacional de Asunción (FP-UNA)**.

`zk-guarani-bridge` implementa un puente de tokens entre dos cadenas (L1 ↔ L2) bajo el patrón **Lock-and-Mint**, donde la cadena destino verifica criptográficamente — vía una **prueba Groth16** — que el estado reportado por el relayer es genuino. La verificación se ancla a **cabeceras del beacon chain de Ethereum** mediante el circuito Circom `VerifyHeaderMock(512, 7)`.

> 💡 **La tesis central:** *La cadena destino no necesita confiar en quién entregó la prueba — solo en la prueba misma.*

### Repositorios relacionados en la organización

| Componente | Repositorio | Rol |
|---|---|---|
| 🌉 **Bridge ZK (este)** | [`zk-guarani-bridge`](https://github.com/FPUNA-ZK-Bridge/zk-guarani-bridge) | Puente principal con verificación Groth16 |
| 🪶 Bridge baseline | [`guarani-bridge-vanilla`](https://github.com/FPUNA-ZK-Bridge/guarani-bridge-vanilla) | Versión sin ZK — *baseline* de comparación |
| 🛰️ Beacon data fetcher | [`ethereum-sync-committee-validator`](https://github.com/FPUNA-ZK-Bridge/ethereum-sync-committee-validator) | Construcción de `input.json` desde el beacon node |
| 🔑 Verificación BLS | [`verify-headers`](https://github.com/FPUNA-ZK-Bridge/verify-headers) | PoC en Python de la verificación de firmas BLS del sync committee |
| 🧪 Testnet local | [`ephemery-ethereum-testnet`](https://github.com/FPUNA-ZK-Bridge/ephemery-ethereum-testnet) | Nodo Ephemery dockerizado para testing realista |

---

## 🏛 Decisiones de arquitectura

| Decisión | Justificación |
|---|---|
| **Lock-and-Mint** vs. burn-and-release | El patrón es más simple de auditar y permite implementación incremental. La cadena origen mantiene custodia; la destino solo emite tras verificación válida. |
| **Circom + Groth16** vs. Noir/UltraHonk | Circom tiene un ecosistema maduro (`snarkjs`, ceremony pública de Hermez), verificador on-chain estándar y tooling estable. Noir queda como línea de investigación paralela para benchmarking. |
| **Verificación de cabeceras** vs. light client completo | `VerifyHeaderMock(512, 7)` valida participación del sync committee sin reimplementar todo el protocolo de consenso — suficiente como base de seguridad y mantenible para una tesis. |
| **Hardhat (L1) + Anvil (L2)** | Dos engines distintos garantizan que el código no se acopla a particularidades de un cliente; además permite simular cadenas con configuraciones independientes (chainId, mnemonic, gas). |
| **Relayer fuera del trust boundary** | El relayer puede ser malicioso o caerse — la cadena destino solo acepta lo que la prueba ZK valida. Esto es lo que diferencia un *bridge ZK* de un *bridge multisig*. |

---

## 🌉 Arquitectura del bridge

```text
                                       ┌──────────────────────┐
                                       │       Usuario        │
                                       └──────────┬───────────┘
                                                  │
                                       ┌──────────▼───────────┐ ◄─── 6. event Minted ─────┐
                                       │   Frontend / dApp    │                             │
                                       └──────────┬───────────┘                             │
                                                  │ 1. lock(recipientL2, amount)            │
                                                  ▼                                          │
   L1 (Chain N1)                                                                             │
   ┌──────────────────────────────────┐                                                      │
   │                                  │                                                      │
   │   ┌──────────────────────────┐   │                                                      │
   │   │  GuaraniToken (ERC20)    │   │                                                      │
   │   └─────────────▲────────────┘   │                                                      │
   │                 │ approve(Sender, amount)                                                │
   │   ┌─────────────┴────────────┐   │                                                      │
   │   │         Sender           │   │                                                      │
   │   └─────────────┬────────────┘   │                                                      │
   │                 │ 2. event Locked                                                        │
   └─────────────────┼────────────────┘                                                      │
                     ▼                                                                        │
            ┌──────────────────────────┐                                                      │
            │        RELAYER            │── 5. mintRemote(pA, pB, pC, pubSignals) ───┐        │
            │  (off-chain, fuera del   │                                              │        │
            │   trust boundary)         │                                              │        │
            └──────┬───────────▲───────┘                                              │        │
                   │           │                                                       │        │
      3. input.json│           │ 4. proof + publicSignals                              │        │
                   ▼           │                                                       │        │
            ┌──────────────────────────┐                                              │        │
            │   Off-chain prover        │                                              │        │
            │   • Beacon node           │                                              │        │
            │   • Circom                │                                              │        │
            │     VerifyHeaderMock      │                                              │        │
            │   • snarkjs groth16 prove │                                              │        │
            └──────────────────────────┘                                              │        │
                                                                                      ▼        │
   L2 (Chain N2)                                                                               │
   ┌──────────────────────────────────────┐                                                    │
   │                                      │                                                    │
   │   ┌──────────────────────────┐       │                                                    │
   │   │       Receiver           │       │                                                    │
   │   └──┬────────────────┬──────┘       │                                                    │
   │      │ verifyProof()  │ mint(to, amount) (si la prueba se verifica)                       │
   │      ▼                ▼              │                                                    │
   │   ┌──────────────┐ ┌──────────────────────┐                                              │
   │   │ Groth16      │ │ GuaraniToken (ERC20) │                                              │
   │   │  Verifier    │ └──────────────────────┘                                              │
   │   └──────────────┘            │                                                          │
   │                               └────── emite event Minted ───────────────────────────────┘
   └──────────────────────────────────────┘
```

### Flujo de una transferencia

1. **Lock** — El usuario llama `lock(recipient, amount)` en el contrato `Sender` de L1. Los tokens quedan bloqueados y se emite el evento `Locked`.
2. **Detección** — El relayer escucha el evento y obtiene la cabecera del beacon chain correspondiente (real, vía `ethereum-sync-committee-validator`, o un fixture en modo local).
3. **Generación de la prueba** — El relayer ejecuta el circuito Circom `VerifyHeaderMock` con `snarkjs` para producir una prueba **Groth16**.
4. **Verificación on-chain** — El relayer envía la prueba a `mintRemote()` en el `Receiver` de L2. El contrato `Groth16Verifier.sol` la valida.
5. **Mint** — Si la prueba es válida y no fue procesada antes (anti-replay), el `Receiver` mintea el equivalente al destinatario en L2.

---

## 1. Requisitos previos

| Dependencia | Versión recomendada | Para qué |
|---|---|---|
| Node.js | ≥ 18 | Hardhat, relayer, frontend |
| npm | ≥ 9 | Gestión de paquetes |
| Foundry (anvil) | última estable | Nodo L2 local (`npm run node:n2`) |
| circom | ≥ 2.0.3 | Compilar el circuito |
| snarkjs | ya viene como dep | Trusted setup, generación y verificación de pruebas |
| Beacon node *(opcional)* | Lighthouse / Nimbus | Para que el relayer obtenga `input.json` real. Si no hay, se usa el fixture en `circom/verify_header/input.json` |

Instalar `circom` (una sola vez):

```bash
# macOS / Linux
git clone https://github.com/iden3/circom.git && cd circom
cargo build --release
cargo install --path circom
```

---

## 2. Setup inicial (correr **una sola vez** después de clonar)

Estos pasos generan todos los artefactos que **no** están versionados (ver `.gitignore`).

### 2.1 Instalar dependencias

```bash
npm install
cd circom && npm install && cd ..
```

### 2.2 Configurar el entorno

```bash
cp .env.example .env
# Por defecto BRIDGE_ENV=local — no hace falta tocar nada para pruebas locales.
```

### 2.3 Compilar contratos Solidity

```bash
npm run compile
```

### 2.4 Compilar el circuito Circom

`VerifyHeaderMock(512, 7)` es un circuito grande (~2-3M constraints). Necesita un Powers of Tau de potencia suficiente (usar **`pot22`** o superior, `2^22 ≈ 4.2M`).

```bash
cd circom/verify_header

# Compilar el circuito → genera verify_header.r1cs, .wasm, .sym y verify_header_js/
circom verify_header.circom \
  --r1cs --wasm --sym \
  -l ../node_modules \
  -l ../utils
```

### 2.5 Trusted setup (Powers of Tau + Groth16)

Powers of Tau es genérico — podés descargar el archivo final ya contribuido (mucho más rápido que hacerlo a mano para `2^22`):

```bash
# Descargar pot22_final.ptau (~2 GB) desde el ceremony oficial de Hermez
curl -L -o pot22_final.ptau https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_22.ptau
```

> Alternativa local (lenta, solo para circuitos pequeños): ver el [tutorial oficial de snarkjs](https://github.com/iden3/snarkjs#guide).

Setup de Groth16 específico para este circuito:

```bash
# Aún en circom/verify_header/

# 1) Setup inicial → verify_header_0000.zkey
npx snarkjs groth16 setup verify_header.r1cs pot22_final.ptau verify_header_0000.zkey

# 2) Contribuir al ceremony → verify_header_0001.zkey
npx snarkjs zkey contribute verify_header_0000.zkey verify_header_0001.zkey \
  --name="contribucion-tesis" -v -e="entropia random aqui"

# 3) Exportar verification_key.json
npx snarkjs zkey export verificationkey verify_header_0001.zkey verification_key.json

# 4) Exportar el verificador Solidity → ../../contracts/Groth16Verifier.sol
npx snarkjs zkey export solidityverifier verify_header_0001.zkey ../../contracts/Groth16Verifier.sol

cd ../..
```

Después del setup deberías tener:

```
circom/verify_header/verify_header.wasm
circom/verify_header/verify_header_0001.zkey
circom/verify_header/verification_key.json
contracts/Groth16Verifier.sol
```

### 2.6 (Opcional) Generar un witness/proof de smoke-test

Asegurate de que `circom/verify_header/input.json` existe (hay un fixture commiteado o lo genera el relayer). Para validar que todo el pipeline funciona antes de correr el bridge:

```bash
cd circom/verify_header

# Generar witness
node generate_witness.js verify_header.wasm input.json witness.wtns

# Generar prueba
npx snarkjs groth16 prove verify_header_0001.zkey witness.wtns proof.json public.json

# Verificar prueba off-chain
npx snarkjs groth16 verify verification_key.json public.json proof.json
# → "OK!" si todo está bien
cd ../..
```

### 2.7 Recompilar contratos (ahora que existe `Groth16Verifier.sol`)

```bash
npm run compile
```

---

## 3. Probar el bridge en local

Abrir **3 terminales** desde la raíz del proyecto:

### Terminal 1 — Nodo L1 (Hardhat, puerto 8545)

```bash
npm run node:n1
```

### Terminal 2 — Nodo L2 (Anvil, puerto 9545)

```bash
npm run node:n2
```

### Terminal 3 — Deploy y relayer

```bash
# Despliega Token + Sender en N1 y guarda direcciones en deploy-N1.json
npm run deploy:n1

# Despliega Token + Verifier + Receiver en N2 y guarda direcciones en deploy-N2.json
npm run deploy:n2

# Inicia el relayer (escucha eventos Locked en N1 y mintea en N2 con prueba ZK)
npm run relayer
```

Las cuentas locales (deployer, relayer, usuarios) se derivan automáticamente del mnemonic de Hardhat — **no se necesitan private keys** ni configurar nada más.

### Terminal 4 *(opcional)* — Frontend

```bash
npm run frontend          # http://localhost:3000
```

### Probar una transferencia desde scripts

El deployer recibe 1.000.000 GUA al desplegar el token, así que no hace falta mintear nada extra. Con el relayer corriendo en otra terminal:

```bash
# Aprobar al Sender que gaste tokens del deployer
node scripts/approveTokensNode.js

# Hacer lock → dispara el flujo del bridge
node scripts/lockTokens.js

# Verificar balances (uso: <direccion> <red 1|2>)
node scripts/checkBalance.js 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 1
node scripts/checkBalance.js 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 2
```

El relayer detectará el evento `Locked`, generará la prueba ZK con el circuito y llamará a `mintRemote()` en N2.

---

## 4. Tests automatizados

```bash
npm test
```

> Los tests que requieren prueba ZK (`describeProof`) **se saltan automáticamente** si faltan `verify_header.wasm`, `verify_header_0001.zkey` o `circom/verify_header/input.json`. Completá el paso 2 si querés ejecutarlos.

---

## 5. Modo testnet (Ephemery + BlockDAG)

```bash
# 1) Cambiar en .env
BRIDGE_ENV=testnet

# 2) Completar las private keys requeridas
EPHEMERY_RPC_URL=...
EPHEMERY_PRIVATE_KEY=...
BLOCKDAG_RPC_URL=...
BLOCKDAG_PRIVATE_KEY=...
PRIVATE_KEY_RELAYER=...
RELAYER_ADDRESS=0x...

# 3) Deploy y relayer (no se levantan nodos locales)
npm run deploy:n1
npm run deploy:n2
npm run relayer
```

| Variable | Descripción |
|---|---|
| `BRIDGE_ENV` | `local` o `testnet` — única variable que cambia el entorno |
| `EPHEMERY_RPC_URL` / `EPHEMERY_PRIVATE_KEY` | Conexión a Ephemery (L1 testnet) |
| `BLOCKDAG_RPC_URL` / `BLOCKDAG_PRIVATE_KEY` | Conexión a BlockDAG (L2 testnet) |
| `PRIVATE_KEY_RELAYER` / `RELAYER_ADDRESS` | Relayer en testnet |
| `BEACON_NODE_URL` | URL del beacon node (default `http://localhost:5052`) — usado por el relayer para construir `input.json` |

---

## 6. Docker Compose (alternativa)

```bash
docker compose build
docker compose up -d hardhat-n1 anvil-n2

docker compose run --rm deployer npx hardhat run scripts/deployN1.js --network dockerN1
docker compose run --rm deployer npx hardhat run scripts/deployN2.js --network dockerN2

docker compose up -d relayer frontend
```

Frontend en `http://localhost:3000`, RPCs en `:8545` (L1) y `:9545` (L2).

---

## 7. MetaMask (modo local)

| Red | RPC URL | Chain ID |
|---|---|---|
| L1 Hardhat | http://localhost:8545 | 31337 |
| L2 Anvil | http://localhost:9545 | 1338 |

Cuenta de prueba pre-funded:

```
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

> ⚠️ **Solo para desarrollo local.** No usar nunca esta clave en testnet ni mainnet — es pública y compartida por cualquiera que use Hardhat.

---

## 8. Estructura del proyecto

```
zk-guarani-bridge/
├── contracts/                 # Contratos Solidity
│   ├── GuaraniToken.sol       # ERC20 con mint/burn y roles
│   ├── Sender.sol             # Bloquea tokens en L1
│   ├── Receiver.sol           # Mintea en L2 tras verificar prueba ZK
│   └── Groth16Verifier.sol    # ⚙ generado por snarkjs (no versionado)
├── circom/
│   ├── verify_header/         # Circuito principal del light client
│   │   ├── verify_header.circom
│   │   ├── input.json         # ⚙ generado por relayer / fixture
│   │   ├── *.r1cs *.wasm *.sym *.zkey  # ⚙ generados (no versionados)
│   │   ├── proof.json public.json verification_key.json  # ⚙ generados
│   │   └── verify_header_js/  # ⚙ generado
│   └── utils/                 # Helpers Circom (Poseidon, sha256, BLS)
├── scripts/                   # Deploy y utilidades de testing
│   ├── deployN1.js / deployN2.js
│   ├── lockTokens.js / approveTokensNode.js / checkBalance.js
│   └── resolve-network.js / docker-setup.sh / docker-deploy.sh
├── relayer/                   # Relayer Node.js (escucha + genera proofs)
├── generate_data/             # Fetch beacon data + transformer a input.json
├── public/                    # Frontend web
├── test/                      # Tests Hardhat + ZK
├── bridge-env.js              # Configuración local/testnet
├── hardhat.config.js
├── deploy-N1.json             # ⚙ generado por deploy:n1
├── deploy-N2.json             # ⚙ generado por deploy:n2
├── bridge-config.json         # ⚙ generado por deploy:n1 y deploy:n2 (raíz y public/)
├── accounts.json              # ⚙ generado en local
└── .env / .env.example
```

⚙ = generado, **no se versiona** (ver `.gitignore`).

---

## 9. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Error: Contract Groth16Verifier not found` al hacer `deploy:n2` | Falta el verifier generado | Correr el paso **2.5** (export solidityverifier) y luego `npm run compile` |
| `ENOENT verify_header.wasm` o `.zkey` | Circuito no compilado / sin trusted setup | Correr pasos **2.4** y **2.5** |
| Relayer: `No pude leer deploy-N1.json` | No se hizo deploy todavía | Correr `npm run deploy:n1` y `npm run deploy:n2` |
| Tests ZK aparecen como `pending` (skipped) | Faltan `wasm`/`zkey`/`input.json` | Completar paso **2** |
| `Internal JSON-RPC error` en MetaMask | Nonce desincronizado o sin tokens | Reset account en MetaMask y/o re-deployar |
| Relayer no procesa `Locked` | Direcciones desactualizadas | Re-deployar y reiniciar el relayer |
| `Frontend: Contract not found` | Falta `bridge-config.json` | Re-correr `npm run deploy:n1` y `npm run deploy:n2` |

---

## 10. Seguridad

El modelo de seguridad del bridge se basa en cuatro garantías:

- 🔢 **Nonce incremental** — cada transferencia tiene un ID único monótonamente creciente.
- 🛡️ **Replay protection** — un mapping de transacciones procesadas en `Receiver` evita que la misma prueba se use dos veces.
- 🎭 **Role-based access** — solo el relayer autorizado puede invocar `mintRemote()` en L2.
- ✅ **Verificación ZK on-chain** — `Receiver` exige una prueba **Groth16** válida del circuito `VerifyHeaderMock` antes de mintear. Sin prueba válida, no hay mint — punto.

> ⚠️ **Limitaciones conocidas (este es un prototipo de investigación):**
> - El circuito `VerifyHeaderMock` **no** valida la rotación completa del sync committee — esa es una de las líneas de trabajo abiertas.
> - El trusted setup actual fue contribuido localmente con fines de testing. Para producción se requeriría una ceremony multi-party adecuada.
> - El bridge **no ha sido auditado** y no está pensado para uso en producción ni con activos reales.

---

## 📚 Referencias

- [Documentación de Circom 2](https://docs.circom.io/)
- [snarkjs — toolkit Groth16/PLONK](https://github.com/iden3/snarkjs)
- [Powers of Tau Ceremony (Hermez)](https://github.com/iden3/snarkjs#7-prepare-phase-2)
- [Ethereum Light Client Specification](https://github.com/ethereum/consensus-specs/blob/dev/specs/altair/light-client/sync-protocol.md)
- [Tornado Cash — Inspiración de patrones ZK on-chain](https://github.com/tornadocash/tornado-core)

---

## 📄 Licencia

Este proyecto se distribuye bajo licencia **MIT**. Ver el archivo [`LICENSE`](LICENSE) para más detalles.

---

<div align="center">

### 🎓 Facultad Politécnica – Universidad Nacional de Asunción

*Investigación en Zero-Knowledge Bridges · Asunción, Paraguay*

[![Universidad](https://img.shields.io/badge/FP--UNA-Investigación-blue?style=flat-square)](https://www.pol.una.py/)
[![Org](https://img.shields.io/badge/Org-FPUNA--ZK--Bridge-green?style=flat-square)](https://github.com/FPUNA-ZK-Bridge)

⭐ *Si te resulta útil para tu propia investigación, dale star — ayuda a que otros estudiantes lo encuentren.*

</div>
