# Libro Maestro de Alterford

Estado: fuente de verdad operativa del proyecto Alterford v1.2 en desarrollo, compatible con la Constitucion v1.1.
Ultima actualizacion: 2026-07-15.
Repositorio local: `C:\Users\Windows 11 Pro\Documents\apuestas`.

Este documento consolida el estado real del proyecto, decisiones vigentes, arquitectura, contratos, despliegues, variables, comandos oficiales y pendientes. Debe actualizarse cada vez que cambien contratos, direcciones, red, arquitectura, scripts, credenciales no sensibles, checklist de produccion o estado de lanzamiento.

## Reglas De Seguridad Del Documento

- Nunca guardar private keys, seed phrases, contrasenas de keystore ni API keys privadas.
- La direccion publica, nombres de cuentas, direcciones de contratos, RPC publicos y project IDs frontend pueden documentarse.
- La cuenta usada para Base Sepolia fue importada en Foundry Keystore, pero la private key fue expuesta previamente en conversacion. Debe tratarse como comprometida y usarse solo para testnet.
- Para mainnet se debe crear una wallet nueva, no expuesta, con keystore nuevo y procedimiento limpio.
- La API key de Basescan/Etherscan fue compartida en conversacion. Debe rotarse antes de un lanzamiento serio.

## Vision Constitucional

Alterford es un ecosistema Web3 de mercados de prediccion, desafios y entretenimiento social construido inicialmente sobre Base.

Principios no negociables:

- La plataforma nunca apuesta contra los usuarios.
- La casa no arriesga capital propio.
- La casa actua como infraestructura, escrow, arbitro, resolucion y distribucion automatica.
- El protocolo debe ser escrow-first y no-house-risk.
- Fee de mercados: dinamico y limitado por el techo historico de `3.5%` sobre el losing pool. Mercados pequenos usan `3.0%`, mercados estandar conservan `3.5%`, mercados grandes usan `2.5%` y mercados muy grandes usan `2.0%`.
- Fee de retos: platform-only y escalonado por volumen, con `10%`, `8%`, `6%` o `4%` segun el tamano de la recompensa.
- Red inicial: Base.
- Testnet inicial: Base Sepolia.
- Preparacion futura: Base Mainnet, Arbitrum, Polygon y Optimism.
- UX dual: Vanilla y Underworld, con `isUnderworldMode` como estado global.

## Estado Actual

Alterford v1.1 esta en estado MVP on-chain desplegado en Base Sepolia.

Las Fases 1 y 2 de Alterford v1.2 estan implementadas y desplegadas en Base Sepolia. La activacion comercial de login social, relay gasless y fiat on-ramp sigue condicionada a credenciales externas.

Terminado:

- Monorepo pnpm con `apps/web`, `packages/contracts`, `packages/sdk`, `packages/indexer`.
- Contratos Solidity compilables y testeados con Foundry.
- OpenZeppelin Contracts fijado en `5.6.1` mediante pnpm; Foundry resuelve la dependencia desde `node_modules` en clones limpios.
- Dynamic bond policy implementada mediante `CreationBondPolicy`.
- FeePolicy dinamica implementada en source: mercados pequenos `3.0%`, mercados estandar `3.5%`, mercados grandes `2.5%`, mercados muy grandes `2.0%`; retos platform-only `10%`, `8%`, `6%` o `4%`.
- Deploy local Anvil funcional.
- Deploy Base Sepolia funcional mediante Foundry Keystore y `forge script --account`.
- `PRIVATE_KEY` eliminado del flujo Base Sepolia. Solo queda como compatibilidad opcional para Anvil/local.
- Deployment Phase 2 real en Base Sepolia actualizado el `2026-07-15T08:37:47.135Z`.
- Siete contratos desplegados y verificados en BaseScan, incluidos `AlterfordForwarder` y `BountyRecoveryVault`.
- Consejo de seguridad desplegado como Safe `2-de-2`, separado de la cold wallet.
- ABIs exportadas.
- Frontend env generado para Base Sepolia.
- Indexer env generado para Base Sepolia.
- Preflight de deploy operativo.
- Verificacion de contratos operativa.
- Indexer persistente implementado con store JSON, reorg handling, snapshots y endpoints read-only.
- Frontend React/Vite conectado a wagmi/viem/WalletConnect/Reown, con soporte Vanilla/Underworld.
- Indexer publico en Railway con `CONFIRMATIONS=6`, RPC privado y volumen persistente en `/data`.
- Frontend PWA publico en Railway: `https://alterford-web-production.up.railway.app`.
- PWA estatica final publicada en IPFS mediante Pinata con CID `bafybeih4oym45xk4nuq2hzrzbt52l6layaprxujm5mhkvf26g7dnnirjoi`.
- Tests TypeScript y Solidity pasando en la ultima verificacion registrada.
- Smoke E2E Base Sepolia historico del deployment Phase 1 completado con mercado `2`: mint, approve, create market, bet YES, bet NO, resolve y claim.
- Smoke E2E Base Sepolia historico del deployment Phase 1 completado con reto `1`: mint, approve, create challenge, cancel y refund de bond/recompensa.
- Indexer Railway actualizado al deployment Phase 2, sincronizado con `CONFIRMATIONS=6` y `0` errores; el nuevo read model inicia vacio desde el bloque `44168185`.
- `AlterfordForwarder` EIP-2771 y `ChallengeFactory` con `_msgSender()` implementados, con nonce, deadline, domain separator dinamico y replay protection de OpenZeppelin.
- Gateway server-only implementado con politica allowlist de acciones, simulacion previa, limites por wallet/IP/global, idempotencia y ledger persistente atomico.
- Gateway publico en Railway: `https://alterford-gateway-production.up.railway.app`.
- Integracion vigente de Biconomy MEE para relay gasless en Base Sepolia, sin exponer credenciales privadas al navegador.
- MetaMask Embedded Wallets/Web3Auth integrado como conector social MPC opcional sin reemplazar MetaMask, Trust, Binance Web3 Wallet ni WalletConnect.
- Fiat on-ramp Transak implementado mediante sesiones de backend de un solo uso; las credenciales privadas no entran al build estatico.
- Las ocho acciones core permitidas de retos usan firma EIP-712 y relay patrocinado cuando el gateway esta activo; conservan ejecucion directa cuando no esta configurado.
- Gateway Docker construido y health/config comprobados.
- Verificacion Fase 2 local: `43` tests Foundry, `79` tests de paquetes TS y `36` tests de pipeline web, todos aprobados.
- Smoke publico del `2026-07-15`: MetaMask conectada, approve confirmado, mercado `1` creado e indexado, apuesta `0.5 aUSDT` confirmada e indexada; indexer con `0` errores.

No terminado o pendiente:

- Completar cuando venza el mercado publico `1` la parte diferida del smoke: resolve -> claim/refund.
- Rotar API key de Basescan/Etherscan.
- Crear wallet nueva para mainnet.
- Ejecutar security scans estrictos con Slither, Echidna y Mythril instalados y `SECURITY_STRICT=1`.
- Completar auditoria externa antes de Base Mainnet.
- Revisar bundle splitting del frontend; Vite advierte chunks mayores a 500 kB.
- Completar una prueba de aceptacion humana del login social Web3Auth mediante email/OAuth y OTP.
- Obtener/configurar credenciales Transak staging/production y dominio autorizado para activar fiat on-ramp.
- Verificar Trust Wallet, Binance Web3 Wallet y WalletConnect desde dispositivos reales adicionales.

Descartado o reemplazado:

- Garantia fija unica de `10 USDT`: reemplazada por garantia dinamica `CreationBondPolicy`.
- `process.env.PRIVATE_KEY` para Base Sepolia: reemplazado por Foundry Keystore.
- Deploy Base Sepolia con clave plana: no permitido como flujo oficial.

## Arquitectura General

Capas:

- Smart contracts: Solidity + Foundry.
- SDK: TypeScript helpers, economics, bond policy, ABIs y web3 utilities.
- Frontend: React, Vite, TailwindCSS, Zustand, wagmi, viem, WalletConnect/Reown.
- Indexer: TypeScript service con listener, projections, persistent store, reorg support, API HTTP y observability.
- Gateway: servicio TypeScript separado para relay EIP-2771, politicas de patrocinio y sesiones fiat; el indexer permanece read-only.
- Scripts: deploy, preflight, release, verify, export ABIs, env writers, local demo y security scans.

Modulos constitucionales:

- `CoreProtocol`
- `MarketFactory`
- `BountyFactory`
- `Treasury`
- `RewardDistributor`
- `CreatorRegistry`
- `Statistics` conceptual, cubierto por indexer/projections en MVP.
- `Governance` conceptual, cubierto por ownership/governed modules en MVP.

Modulos complementarios v1.1:

- `CreationBondPolicy`
- `ReferralEngine`
- `QuestEngine`
- `AchievementRegistry`
- `CampaignManager`
- `ReputationEngine`
- `AntiSybilEngine`
- `OracleRouter`
- `EvidenceVault`
- `ModerationCouncil`
- `ComplianceGuard`
- `CreatorMonetization`
- `SponsoredMarketRegistry`
- `SocialGraph`

## Estructura Del Monorepo

```text
apps/
  web/                         React/Vite PWA
packages/
  contracts/                   Solidity + Foundry
  sdk/                         TypeScript SDK
  indexer/                     Event indexer + read API
  gateway/                     Gasless relay policy + fiat session API
deployments/                   Deployment manifests, envs y ABIs
docs/                          Constitucion, runbook y este libro maestro
scripts/                       Deploy, verify, env, demo, security
data/                          Indexer stores locales
```

Archivos clave:

- `docs/ALTERFORD_CONSTITUTION_v1.1.md`
- `docs/PRODUCTION_RUNBOOK.md`
- `docs/ALTERFORD_MASTER_BOOK.md`
- `deployments/84532.json`
- `deployments/84532.indexer.env`
- `apps/web/.env.local`
- `scripts/release-base-sepolia.mjs`
- `scripts/deploy.mjs`
- `scripts/deploy-preflight.mjs`
- `scripts/verify-contracts.mjs`
- `packages/contracts/script/DeployAlterford.s.sol`

## Contratos Desplegados En Base Sepolia

Red: Base Sepolia.
Chain ID: `84532`.
RPC: `https://sepolia.base.org`.
Explorer: `https://sepolia.basescan.org`.
Deployer: `0x6Bb15228CFC4CA9f39FD76EA1dbF98A9E53be772`.
Deployment manifest: `deployments/84532.json`.
Fecha de deploy: `2026-07-15T08:37:47.135Z`.

| Modulo | Address | Tx hash | Verificacion |
|---|---:|---:|---|
| MockSettlementToken | `0x13e136d971ab620d94213725bd5e14944f71427c` | `0xd5e2271a70ad4e44dbe9e06ab8d52b89302f5660aaab128ec770f8914980f14c` | Verificado |
| CreationBondPolicy | `0x7b881b34eb2319d4e52b29f5cb703a2d6a7c7278` | `0xcba5f9c6be7725954861a433c95ebdbe5e958ce2842dd3f9d375567797784694` | Verificado |
| AlterfordForwarder | `0x5021948dea935437edc26241d3354ffba901100c` | `0x9a9c04c55453fc90f56357335df3c606733be7acab6fa785282419f3ff8e7ede` | Verificado |
| MarketFactory | `0x4810a24defe948b07950eced0426cce7a0cef540` | `0x92b901e92beafe7cab7d928553be3f7fccaa1dc6de81268cbe595affbce0586d` | Verificado |
| BountyFactory | `0x7888a4924c1cf6ad72ff0e570c4285478b03c1f1` | `0x5c96852fae8ccdfff8488bcc6d6c04d1a89f53e474631af531ae57575d6fbcb1` | Verificado |
| ChallengeFactory | `0x61ad203a2eafd95002e5558381ebd04954706edd` | `0xd9c628be18ec31f7b68f0feaf33c8cd2a99354366919d8b900122c98bec89086` | Verificado |
| BountyRecoveryVault | `0x66f2baf2ce2b177cf80f98b81870dac484eb1b45` | `0x27b5c0fbfaeea99b181e345729fd628e9b6b31f15b4f5fa5d909fb3fdb03ca5b` | Verificado |

Gobernanza de emergencia Phase 1:

- Safe `2-de-2`: `0xcDe52A6D1c4bb32Aed4FA5C4489AbF32e237620b`.
- Cold wallet: `0xec463C1CB5a8D4bf21B75505DAEccBC12C6E3bb7`.
- El Safe posee `SECURITY_ADMIN_ROLE`; el vault solo puede enrutar fondos a la cold wallet configurada.

Bytecode confirmado por RPC despues del deploy:

- MockSettlementToken: `1477` bytes.
- CreationBondPolicy: `4078` bytes.
- AlterfordForwarder: `3540` bytes.
- MarketFactory: `11040` bytes.
- BountyFactory: `7217` bytes.
- ChallengeFactory: `17621` bytes.
- BountyRecoveryVault: `1636` bytes.

## Wallet Oficial De Testnet

Uso: deployer Base Sepolia y pruebas testnet.

- Address publica: `0x6Bb15228CFC4CA9f39FD76EA1dbF98A9E53be772`.
- Foundry account: `alterford-base-sepolia`.
- Keystore: Foundry encrypted keystore local.
- Password file local usado por scripts: `C:\Users\Windows 11 Pro\.foundry\alterford-phase2-password.txt`.
- Saldo despues del deploy Phase 2: `0.090736426085800153 ETH` en Base Sepolia.
- Advertencia: esta wallet debe considerarse comprometida por exposicion de private key en conversacion. No usar en mainnet.

## Redes

Local:

- Nombre: Anvil.
- Chain ID: `31337`.
- RPC default: `http://127.0.0.1:8545`.
- Private key local: solo para Anvil/dev. No usar para Base Sepolia ni mainnet.

Base Sepolia:

- Chain ID: `84532`.
- RPC: `https://sepolia.base.org`.
- Explorer: `https://sepolia.basescan.org`.
- Deployment actual: `deployments/84532.json`.

Base Mainnet:

- Chain ID: `8453`.
- Estado: preparado conceptualmente, no desplegado.
- Requisito: wallet nueva, auditoria, security scans estrictos, runbook mainnet y aprobacion final.

## Variables Del Proyecto

Variables Base Sepolia deploy:

```text
FOUNDRY_ACCOUNT=alterford-base-sepolia
FOUNDRY_PASSWORD_FILE=/home/telecom/.alterford/foundry-password.txt
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=<no guardar en git ni docs>
ETHERSCAN_API_KEY=<alternativa, no guardar en git ni docs>
```

Variables Base Sepolia frontend generadas en `apps/web/.env.local`:

```text
VITE_CHAIN_ID=84532
VITE_LOCAL_RPC_URL=http://127.0.0.1:8545
VITE_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
VITE_WALLETCONNECT_PROJECT_ID=502d1a6819ee42e793e15c5f90603c42
VITE_APP_URL=https://alterford-web-production.up.railway.app
VITE_SETTLEMENT_TOKEN_ADDRESS=0x13e136d971ab620d94213725bd5e14944f71427c
VITE_CREATION_BOND_POLICY_ADDRESS=0x7b881b34eb2319d4e52b29f5cb703a2d6a7c7278
VITE_ALTERFORD_FORWARDER_ADDRESS=0x5021948dea935437edc26241d3354ffba901100c
VITE_MARKET_FACTORY_ADDRESS=0x4810a24defe948b07950eced0426cce7a0cef540
VITE_BOUNTY_FACTORY_ADDRESS=0x7888a4924c1cf6ad72ff0e570c4285478b03c1f1
VITE_CHALLENGE_FACTORY_ADDRESS=0x61ad203a2eafd95002e5558381ebd04954706edd
VITE_GATEWAY_URL=https://alterford-gateway-production.up.railway.app
VITE_INDEXER_URL=https://web-production-73e1b.up.railway.app
```

Variables Base Sepolia indexer generadas en `deployments/84532.indexer.env`:

```text
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
MARKET_FACTORY_ADDRESS=0x4810a24defe948b07950eced0426cce7a0cef540
BOUNTY_FACTORY_ADDRESS=0x7888a4924c1cf6ad72ff0e570c4285478b03c1f1
CHALLENGE_FACTORY_ADDRESS=0x61ad203a2eafd95002e5558381ebd04954706edd
BOUNTY_RECOVERY_VAULT_ADDRESS=0x66f2baf2ce2b177cf80f98b81870dac484eb1b45
INDEXER_STORE=data/alterford-84532-44168185.json
CONFIRMATIONS=6
START_BLOCK=44168185
MAX_LOG_BLOCK_RANGE=2000
PORT=8787
POLL_INTERVAL_MS=12000
```

Variables locales importantes:

```text
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=<opcional solo Anvil/local>
SECURITY_STRICT=1
SKIP_VERIFY=1
```

## Comandos Oficiales

Instalacion:

```powershell
pnpm install
```

Build general:

```powershell
pnpm build
```

Typecheck:

```powershell
pnpm typecheck
```

Tests TypeScript:

```powershell
pnpm test
```

Contratos:

```powershell
pnpm contracts:build
pnpm contracts:test
pnpm contracts:coverage
```

Deploy local:

```powershell
anvil --chain-id 31337
pnpm deploy:local:preflight
pnpm deploy:local
pnpm web:env 31337
pnpm demo:local-flow
```

Deploy Base Sepolia:

```powershell
set FOUNDRY_ACCOUNT=alterford-base-sepolia
set FOUNDRY_PASSWORD_FILE=/home/telecom/.alterford/foundry-password.txt
set BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
set VITE_WALLETCONNECT_PROJECT_ID=502d1a6819ee42e793e15c5f90603c42
set BASESCAN_API_KEY=<api-key-no-documentar>

pnpm deploy:base-sepolia:preflight
pnpm release:base-sepolia
```

Verificacion de contratos:

```powershell
set BASESCAN_API_KEY=<api-key-no-documentar>
pnpm deploy:base-sepolia:verify
```

Frontend:

```powershell
pnpm web:env 84532
pnpm web:env:check 84532
pnpm dev
```

Indexer Base Sepolia:

```powershell
set CHAIN_ID=84532
set RPC_URL=https://sepolia.base.org
set MARKET_FACTORY_ADDRESS=0xff999c9dce00afaed5c5ea37b5ff2b52f59b0954
set CHALLENGE_FACTORY_ADDRESS=0xa1e9487ab3f5b55766e7908f4113d9a61a213996
set INDEXER_STORE=data/alterford-84532-43727910.json
set CONFIRMATIONS=6
set START_BLOCK=43727910
set MAX_LOG_BLOCK_RANGE=2000
pnpm --filter @alterford/indexer start
```

Security:

```powershell
pnpm security:slither
pnpm security:echidna
pnpm security:mythril
pnpm security:all
```

## Gas Y Costos Registrados

Deploy Base Sepolia real:

- Foundry estimo `9,621,942` gas total para el script.
- Gas price estimado en ejecucion: `0.011 gwei`.
- Monto estimado por Foundry: `0.000105841362 ETH`.
- Saldo antes del deploy observado: `0.090984881475589361 ETH`.
- Saldo despues del redeploy y smokes del deployment actual: `0.090866011781238824 ETH`.
- Consumo neto observado incluyendo smoke: aproximadamente `0.000056425655614469 ETH`.
- Verificacion en Basescan no consume gas on-chain.
- Exportacion de ABIs/envs no consume gas.
- Smoke E2E Base Sepolia posterior consumio gas adicional para mint, approve, create market, place bets, resolve, claim, create challenge y cancel challenge.

Saldo recomendado minimo para repetir `release:base-sepolia` sin riesgo:

- Minimo tecnico en condiciones similares: `0.001 ETH`.
- Recomendado operativo: `0.01 ETH`.
- Recomendado conservador para retries, gas spikes y errores: `0.03 ETH`.
- Saldo actual testnet despues del deploy: suficiente para multiples pruebas.

## Frontend

Stack:

- React.
- Vite.
- TailwindCSS.
- Zustand.
- wagmi.
- viem.
- WalletConnect/Reown.
- PWA.

Estado UX:

- Modo Vanilla implementado.
- Modo Underworld implementado.
- Underworld Gateway implementado como cambio de modo.
- `isUnderworldMode` en store global.
- Quick bets: `0.5`, `1`, `5`, `10`.
- High roller: `50`, `250`, `1000`, `ALL IN`.
- Balance, allowance, approve, create market, bet, resolve, claim/refund integrados a hooks web3.
- Frontend usa direcciones desde env generado.
- Build estatico agnostico publicado mediante Pinata.
- CID: `bafybeiebkyk5z3mjqjkwl5cnrb6fbx25cx2qrh6pfulwq7npt3n5ozqun4`.
- Gateway primario de prueba: `https://ipfs.io/ipfs/bafybeiebkyk5z3mjqjkwl5cnrb6fbx25cx2qrh6pfulwq7npt3n5ozqun4/`.
- Gateway alternativo: `https://bafybeiebkyk5z3mjqjkwl5cnrb6fbx25cx2qrh6pfulwq7npt3n5ozqun4.ipfs.dweb.link/`.
- Manifest, service worker, bundle e indexer publico validados desde ambos gateways.

Archivos clave:

- `apps/web/src/App.tsx`
- `apps/web/src/AppProviders.tsx`
- `apps/web/src/hooks/useWeb3Flow.ts`
- `apps/web/src/hooks/useIndexerFeed.ts`
- `apps/web/src/stores/appStore.ts`
- `apps/web/src/stores/walletStore.ts`
- `apps/web/src/web3/config.ts`
- `apps/web/src/web3/contracts.ts`

Pendiente frontend:

- Prueba manual con MetaMask en Base Sepolia real usando el deployment actual.
- Asignar dominio/ENS definitivo; mientras tanto WalletConnect usa el origen del gateway en runtime.
- Revisar code splitting por warnings de chunks grandes.

## SDK

Funciones principales:

- Economics, fee dinamico de mercados y fee escalonado de retos.
- Bond policy helpers.
- Web3 helpers.
- Tipos compartidos.
- ABIs exportadas.

Archivos clave:

- `packages/sdk/src/economics.ts`
- `packages/sdk/src/bondPolicy.ts`
- `packages/sdk/src/web3.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk/src/abis.ts`

## Indexer

Estado:

- Implementado en TypeScript.
- Soporta listener, projections, persistent store, reorg checks, snapshots y API read-only.
- Base Sepolia env generado en `deployments/84532.indexer.env`.
- Servicio publico: `https://web-production-73e1b.up.railway.app`.
- Base Sepolia usa `START_BLOCK=44168185`, bloque inicial del deployment Phase 2.
- Railway usa `MAX_LOG_BLOCK_RANGE=2000` con el RPC configurado actualmente.
- Opera con `CONFIRMATIONS=6`, polling de 12 segundos y volumen persistente Railway en `/data`.
- Persistencia verificada mediante redeploy: journal y cursor sobrevivieron al reinicio, cadena `84532`, cero errores.

Endpoints definidos en runbook:

- `/health`
- `/metrics`
- `/snapshot`
- `/markets`
- `/markets/:id`
- `/bets?marketId=1`
- `/claims?marketId=1`
- `/fees/:marketId`
- `/bonds/:entityType/:entityId`
- `/bounties`
- `/challenges`

Pendiente indexer:

- Configurar backup externo del volumen Railway antes de produccion mainnet.

Estado del nuevo deployment al cierre:

- Cursor procesado por encima del bloque de deployment y actualizado automaticamente.
- Journal persistente inicializado con el evento administrativo del nuevo deployment.
- Mercados, bounties y challenges nuevos comienzan vacios; los datos ficticios del deployment anterior no se migraron.

## Seguridad

Implementado:

- `ReentrancyGuardLite`.
- Checks-effects-interactions en flujos criticos.
- Double claim protection.
- Escrow accounting.
- Dynamic bond escrow, release y slash.
- Fuzz tests e invariant tests existentes.
- Slither/Echidna/Mythril integrados via scripts.

Ultima verificacion conocida:

- `pnpm typecheck`: paso.
- `pnpm test`: paso.
- `pnpm build`: paso con warnings de bundle.
- `forge build`: paso con warnings de timestamp.
- `forge test`: paso, `40/40`.
- `pnpm test`: paso, `55/55`.
- `pnpm test:web:pipeline`: paso, `36/36`.
- Slither: paso sobre 73 contratos y 98 detectores, `0` resultados.
- `pnpm web:env:check 84532`: paso.
- Verificacion BaseScan: paso para 6/6 contratos del deployment actual.
- Smoke E2E Base Sepolia on-chain: paso.
- Smoke reto Base Sepolia on-chain: paso con create challenge, cancel y bond released.
- Indexer Base Sepolia con eventos reales: paso con `/health`, `/snapshot`, `/markets`, `/bets`, `/claims`, `/fees` y `/bonds`.

Warnings conocidos:

- Foundry reporta `block.timestamp` en comparaciones de deadlines, lock times, resolution times y subscriptions. Aceptado para MVP, debe revisarse en auditoria.
- Vite reporta chunks mayores a 500 kB. No bloquea MVP, pero debe optimizarse antes de produccion publica.
- Tests frontend pueden mostrar warnings de WalletConnect/Reown si se usa project id de desarrollo o metadata local.
- Echidna y Mythril no estan instalados en el entorno actual; sus scans fueron omitidos y siguen pendientes antes de mainnet.

## Decisiones Historicas

- Base elegida como red inicial por bajo costo, compatibilidad EVM y estrategia Web3 consumer.
- Base Sepolia elegida como testnet inicial.
- La casa nunca toma riesgo de contraparte: todos los fondos de usuario van por escrow y distribucion on-chain.
- Fee fijo unico reemplazado por FeePolicy: mercados pequenos bajan friccion, mercados estandar preservan `3.5%`, mercados grandes reducen fee, y retos cobran fee platform-only escalonado.
- Garantia fija `10 USDT` fue reemplazada por politica dinamica para reducir friccion en mercados pequenos y mantener friccion alta para abuso.
- WalletConnect/Reown priorizado por compatibilidad con MetaMask, Trust Wallet, Binance Web3 Wallet y mobile wallets.
- Deploy Base Sepolia migro de private key plana a Foundry Keystore.
- Contratos core desplegados primero; modulos complementarios existen en codigo y tests, pero no todos forman parte del deployment Base Sepolia actual.

## Checklist Produccion

Antes de declarar production ready:

- Crear wallet mainnet nueva y no expuesta.
- Rotar API key de Basescan/Etherscan.
- Confirmar que `.env.local`, password files y keystores no estan versionados.
- [x] Ejecutar `pnpm typecheck`.
- [x] Ejecutar `pnpm test`.
- [x] Ejecutar `pnpm build`.
- Ejecutar `forge fmt --check`.
- Ejecutar `forge build`.
- [x] Ejecutar `forge test`.
- Ejecutar `forge coverage --ir-minimum`.
- Ejecutar `SECURITY_STRICT=1 pnpm security:all`.
- [x] Completar flujo publico Base Sepolia desde navegador: connect wallet, approve, create market, indexar, bet e indexar.
- Completar resolve y claim/refund del mercado publico cuando alcance sus timestamps on-chain.
- [x] Ejecutar indexer Base Sepolia en modo normal con `CONFIRMATIONS=6` y confirmar `/health`, `/snapshot`, `/markets`.
- [x] Validar persistencia del store mediante redeploy controlado.
- Revisar alertas y runbook operativo.
- [x] Publicar frontend PWA en IPFS staging.
- Verificar wallets reales: MetaMask, Trust Wallet, Binance Web3 Wallet y WalletConnect.
- Revisar UX mobile Android/iOS/Huawei sin GMS.
- Obtener auditoria externa.
- Preparar deployment plan Base Mainnet con rollback.

## Procedimiento Para Actualizar Este Libro

Actualizar este documento cuando ocurra cualquiera de estos cambios:

- Nuevo deployment.
- Nueva red.
- Nueva direccion de contrato.
- Cambio de wallet deployer.
- Cambio de RPC oficial.
- Cambio de comandos oficiales.
- Cambio de arquitectura.
- Cambio de FeePolicy, bond policy o reglas economicas.
- Cambio de estado de produccion.
- Cambio en indexer/frontend/env.
- Resultado importante de auditoria o security scan.

Formato recomendado de actualizacion:

1. Cambiar fecha de `Ultima actualizacion`.
2. Actualizar seccion afectada.
3. Agregar decision historica si el cambio altera una decision de producto o arquitectura.
4. Ejecutar checks relevantes.
5. Registrar verificaciones en `Seguridad` o `Estado Actual`.
