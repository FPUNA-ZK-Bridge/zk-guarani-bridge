# Guarani Bridge

Puente de tokens descentralizado que transfiere **GuaraniTokens** entre dos cadenas (L1 ↔ L2) usando el patrón **lock-and-mint**, con verificación de cabeceras del beacon chain mediante **pruebas Groth16** generadas por un circuito Circom (`VerifyHeaderMock(512, 7)`) y protección anti-replay.

```
    L1 (Chain N1)                            L2 (Chain N2)
    ┌─────────────────────────┐              ┌─────────────────────────┐
    │  GuaraniToken            │              │  GuaraniToken            │
    │  Sender Contract        │              │  Receiver + Verifier    │
    └────────────┬────────────┘              └────────────▲────────────┘
                 │                                        │
                 │ 1. lock(recipient, amount)             │ 4. mintRemote(proof,...)
                 │    emite "Locked"                      │    Verifier valida ZK proof
                 │                                        │
                 └──────────────┐                         │
                                ▼                         │
                       ┌─────────────────┐                │
                       │    RELAYER      │────────────────┘
                       │ 2. Escucha      │
                       │    "Locked"     │
                       │ 3. Genera ZK    │
                       │    proof        │
                       └─────────────────┘
```

---

## 1. Requisitos previos

| Dependencia | Versión recomendada | Para qué |
|-------------|---------------------|----------|
| Node.js     | ≥ 18                | Hardhat, relayer, frontend |
| npm         | ≥ 9                 | Gestión de paquetes |
| Foundry (anvil) | última estable | Nodo L2 local (`npm run node:n2`) |
| circom      | ≥ 2.0.3             | Compilar el circuito |
| snarkjs     | ya viene como dep   | Trusted setup, generación y verificación de pruebas |
| Beacon node (opcional) | Lighthouse / Nimbus | Para que el relayer obtenga `input.json` real. Si no hay, se usa el fixture en `circom/verify_header/input.json` |

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

# Genera la config del frontend desde deploy-*.json
npm run config

# Inicia el relayer (escucha eventos Locked en N1 y mintea en N2 con prueba ZK)
npm run relayer
```

Las cuentas locales (deployer, relayer, usuarios) se derivan automáticamente del mnemonic de Hardhat — **no se necesitan private keys** ni configurar nada más.

### Terminal 4 (opcional) — Frontend

```bash
npm run frontend          # http://localhost:3000
```


## 4. MetaMask (modo local)

| Red | RPC URL | Chain ID |
|-----|---------|----------|
| L1 Hardhat | http://localhost:8545 | 31337 |
| L2 Anvil   | http://localhost:9545 | 1338 |

Cuenta de prueba pre-funded:

```
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

---

## 5. Estructura del proyecto

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
│   ├── lockTokens.js / mintTokens.js / approveTokens.js
│   └── resolve-network.js / generate-config.js
├── relayer/                   # Relayer Node.js (escucha + genera proofs)
├── generate_data/             # Fetch beacon data + transformer a input.json
├── public/                    # Frontend web
├── test/                      # Tests Hardhat + ZK
├── bridge-env.js              # Configuración local/testnet
├── hardhat.config.js
├── deploy-N1.json             # ⚙ generado por deploy:n1
├── deploy-N2.json             # ⚙ generado por deploy:n2
├── bridge-config*.json        # ⚙ generados por deploy/config
├── accounts.json              # ⚙ generado en local
└── .env / .env.example
```

⚙ = generado, **no se versiona** (ver `.gitignore`).

---

## 6. Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `Error: Contract Groth16Verifier not found` al hacer `deploy:n2` | Falta el verifier generado | Correr el paso **2.5** (export solidityverifier) y luego `npm run compile` |
| `ENOENT verify_header.wasm` o `.zkey` | Circuito no compilado / sin trusted setup | Correr pasos **2.4** y **2.5** |
| Relayer: `No pude leer deploy-N1.json` | No se hizo deploy todavía | Correr `npm run deploy:n1` y `npm run deploy:n2` |
| Tests ZK aparecen como `pending` (skipped) | Faltan `wasm`/`zkey`/`input.json` | Completar paso **2** |
| `Internal JSON-RPC error` en MetaMask | Nonce desincronizado o sin tokens | Reset account en MetaMask y/o `mintTokens.js` |
| Relayer no procesa `Locked` | Direcciones desactualizadas | Re-deployar y reiniciar el relayer |
| `Frontend: Contract not found` | Falta `bridge-config.json` | `npm run config` |

---

## 10. Seguridad

- **Nonce incremental**: cada transferencia tiene un ID único.
- **Replay protection**: mapping de transacciones procesadas evita duplicados.
- **Role-based access**: solo el relayer autorizado puede minar en L2.
- **Verificación ZK on-chain**: `Receiver` exige una prueba Groth16 válida del circuito `VerifyHeaderMock` antes de mintear.
