# Libro Maestro de Alterford

Estado: fuente de verdad operativa del proyecto Alterford v1.1.
Ultima actualizacion: 2026-07-03.
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

Terminado:

- Monorepo pnpm con `apps/web`, `packages/contracts`, `packages/sdk`, `packages/indexer`.
- Contratos Solidity compilables y testeados con Foundry.
- Dynamic bond policy implementada mediante `CreationBondPolicy`.
- FeePolicy dinamica implementada en source: mercados pequenos `3.0%`, mercados estandar `3.5%`, mercados grandes `2.5%`, mercados muy grandes `2.0%`; retos platform-only `10%`, `8%`, `6%` o `4%`.
- Deploy local Anvil funcional.
- Deploy Base Sepolia funcional mediante Foundry Keystore y `forge script --account`.
- `PRIVATE_KEY` eliminado del flujo Base Sepolia. Solo queda como compatibilidad opcional para Anvil/local.
- Deployment real en Base Sepolia actualizado el `2026-07-05T04:01:55.141Z`.
- Cinco contratos core desplegados y verificados en Basescan.
- ABIs exportadas.
- Frontend env generado para Base Sepolia.
- Indexer env generado para Base Sepolia.
- Preflight de deploy operativo.
- Verificacion de contratos operativa.
- Indexer persistente implementado con store JSON, reorg handling, snapshots y endpoints read-only.
- Frontend React/Vite conectado a wagmi/viem/WalletConnect/Reown, con soporte Vanilla/Underworld.
- Tests TypeScript y Solidity pasando en la ultima verificacion registrada.
- Smoke E2E Base Sepolia completado con mercado `2`: mint, approve, create market, bet YES, bet NO, resolve y claim.
- Smoke E2E Base Sepolia completado con reto `1`: mint, approve, create challenge, cancel y refund de bond/recompensa.
- Indexer Base Sepolia validado contra eventos reales del deployment actual: `2` markets, `3` bets, `1` claim, `3` bonds y `0` errores.

No terminado o pendiente:

- Ejecutar prueba E2E manual desde navegador con MetaMask/Reown: connect wallet -> approve -> create market -> bet -> resolve -> claim/refund.
- Publicar frontend en entorno publico PWA/IPFS/Fleek/Pinata.
- Rotar API key de Basescan/Etherscan.
- Crear wallet nueva para mainnet.
- Ejecutar security scans estrictos con Slither, Echidna y Mythril instalados y `SECURITY_STRICT=1`.
- Completar auditoria externa antes de Base Mainnet.
- Revisar bundle splitting del frontend; Vite advierte chunks mayores a 500 kB.

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
Fecha de deploy: `2026-07-05T04:01:55.141Z`.

| Modulo | Address | Tx hash | Verificacion |
|---|---:|---:|---|
| MockSettlementToken | `0x13e136d971ab620d94213725bd5e14944f71427c` | `0xd5e2271a70ad4e44dbe9e06ab8d52b89302f5660aaab128ec770f8914980f14c` | Verificado |
| CreationBondPolicy | `0x7b881b34eb2319d4e52b29f5cb703a2d6a7c7278` | `0xcba5f9c6be7725954861a433c95ebdbe5e958ce2842dd3f9d375567797784694` | Verificado |
| MarketFactory | `0xff999c9dce00afaed5c5ea37b5ff2b52f59b0954` | `0xe4599391ed9118ebf8e872883dde50c5d6f29339385c9951641b167ec0fae7d3` | Verificado |
| BountyFactory | `0xd1aa1350f7c6d75171eb1335064a2eb5738e0fca` | `0x76459f30157d353b6e2476b46ef5103e61f1b6a00767ff5c29c57898f2542568` | Verificado |
| ChallengeFactory | `0xa1e9487ab3f5b55766e7908f4113d9a61a213996` | `0x8db2a09a3c3fe42ca60e7f876ed87202e55720a006e82a2b8fe2a0df9f6ce5fc` | Verificado |

Bytecode confirmado por RPC despues del deploy:

- MockSettlementToken: `1477` bytes.
- CreationBondPolicy: `4078` bytes.
- MarketFactory: `8463` bytes.
- BountyFactory: `4742` bytes.
- ChallengeFactory: `10063` bytes.

## Wallet Oficial De Testnet

Uso: deployer Base Sepolia y pruebas testnet.

- Address publica: `0x6Bb15228CFC4CA9f39FD76EA1dbF98A9E53be772`.
- Foundry account: `alterford-base-sepolia`.
- Keystore: Foundry encrypted keystore local.
- Password file local usado por scripts: `/home/telecom/.alterford/foundry-password.txt`.
- Saldo despues del deploy y smoke: `0.090928455819974892 ETH` en Base Sepolia.
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
VITE_APP_URL=
VITE_SETTLEMENT_TOKEN_ADDRESS=0x13e136d971ab620d94213725bd5e14944f71427c
VITE_CREATION_BOND_POLICY_ADDRESS=0x7b881b34eb2319d4e52b29f5cb703a2d6a7c7278
VITE_MARKET_FACTORY_ADDRESS=0xff999c9dce00afaed5c5ea37b5ff2b52f59b0954
VITE_BOUNTY_FACTORY_ADDRESS=0xd1aa1350f7c6d75171eb1335064a2eb5738e0fca
VITE_CHALLENGE_FACTORY_ADDRESS=0xa1e9487ab3f5b55766e7908f4113d9a61a213996
VITE_INDEXER_URL=http://127.0.0.1:8787
```

Variables Base Sepolia indexer generadas en `deployments/84532.indexer.env`:

```text
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
MARKET_FACTORY_ADDRESS=0xff999c9dce00afaed5c5ea37b5ff2b52f59b0954
CHALLENGE_FACTORY_ADDRESS=0xa1e9487ab3f5b55766e7908f4113d9a61a213996
INDEXER_STORE=data/alterford-84532-43727910.json
CONFIRMATIONS=6
START_BLOCK=43727910
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
- Configurar `VITE_APP_URL` real antes de publicar.
- Publicar build PWA.
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
- Base Sepolia usa `START_BLOCK=43727910`, bloque inicial del deployment actual, para no escanear desde genesis.
- El RPC publico de Base Sepolia limita `eth_getLogs` a rangos de 2000 bloques; el listener soporta chunking con `MAX_LOG_BLOCK_RANGE=2000`.
- Smoke real indexado desde Base Sepolia con `CONFIRMATIONS=0` para validacion inmediata.

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

Pendiente indexer:

- Ejecutar operacion prolongada con `CONFIRMATIONS=6` para modo testnet normal.
- Persistir y respaldar `data/alterford-84532-43727910.json`.

Ultimo smoke indexado:

- Market id: `2`.
- Market state: `Resolved`.
- Bond requerido: `500000` aUSDT (`0.5` aUSDT), reasonFlags `1`.
- Bets: `1000000` aUSDT en YES y `1000000` aUSDT en NO.
- Winning outcome: `0`.
- Admin fee: `20000` aUSDT.
- Creator fee: `10000` aUSDT.
- Reward claimed: `1970000` aUSDT.
- MarketCreated tx: `0xad1da91b00bdf8d6cc993585d5bd226b8a80491da22c54b4641139633a938381`.
- Bet YES tx: `0x34ea878c9f2c56b4403c77399bb762b4d4c15d2d7849fd8f4b27a6a308105032`.
- Bet NO tx: `0x8f88d079fea7516f0a1eb2316b6ea653b552504f09afdee0614fca1de07d429b`.
- Resolve tx: `0x70e1b82a0f4e7a1032fb2aa868aeafbd4b9bfad156413d21cfbce002ecc85857`.
- Claim tx: `0xd19e727ea0655dbd8e2f735c7397cdc104e407f4c66f043b93fc6afaad0ca354`.

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
- `forge test`: paso, `32/32`.
- `pnpm web:env:check 84532`: paso.
- Verificacion Basescan: paso para 5/5 contratos del deployment actual.
- Smoke E2E Base Sepolia on-chain: paso.
- Smoke reto Base Sepolia on-chain: paso con create challenge, cancel y bond released.
- Indexer Base Sepolia con eventos reales: paso con `/health`, `/snapshot`, `/markets`, `/bets`, `/claims`, `/fees` y `/bonds`.

Warnings conocidos:

- Foundry reporta `block.timestamp` en comparaciones de deadlines, lock times, resolution times y subscriptions. Aceptado para MVP, debe revisarse en auditoria.
- Vite reporta chunks mayores a 500 kB. No bloquea MVP, pero debe optimizarse antes de produccion publica.
- Tests frontend pueden mostrar warnings de WalletConnect/Reown si se usa project id de desarrollo o metadata local.

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
- Ejecutar `pnpm typecheck`.
- Ejecutar `pnpm test`.
- Ejecutar `pnpm build`.
- Ejecutar `forge fmt --check`.
- Ejecutar `forge build`.
- Ejecutar `forge test`.
- Ejecutar `forge coverage --ir-minimum`.
- Ejecutar `SECURITY_STRICT=1 pnpm security:all`.
- Completar flujo manual Base Sepolia desde navegador: connect wallet, approve, create market, bet, resolve, claim/refund.
- Ejecutar indexer Base Sepolia en modo normal con `CONFIRMATIONS=6` y confirmar `/health`, `/snapshot`, `/markets`.
- Validar reorg/replay con store persistente.
- Revisar alertas y runbook operativo.
- Publicar frontend PWA en entorno staging.
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
