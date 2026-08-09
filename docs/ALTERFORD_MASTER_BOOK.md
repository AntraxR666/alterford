# Libro Maestro de Alterford

Estado: fuente de verdad operativa del proyecto Alterford v1.2 en desarrollo, compatible con la Constitucion v1.1.
Ultima actualizacion: 2026-07-22.
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

Alterford v1.1 esta en estado MVP on-chain endurecido, desplegado y verificado en Base Sepolia.

Las Fases 1 y 2 de Alterford v1.2 estan implementadas. El deployment vigente de Base Sepolia del 2026-08-09 incorpora el settlement token con permit, `CreationBondContextResolver`, `AlterfordForwarder`, las tres factories, el vault de recuperacion y el modelo de retos financiados por el patrocinador o propuestos por el ejecutor. Los deployments anteriores quedan archivados como historicos. El login social de MetaMask Embedded Wallets fue validado en la URL publica. El relay Biconomy staging esta configurado y el flujo `prepare` EIP-2771 fue comprobado contra los contratos vigentes; el envio patrocinado firmado queda dentro del smoke de aceptacion del propietario. Fiat on-ramp sigue deshabilitado. El rail XMR vigente es una conversion no custodial y agnostica de proveedor: el usuario paga XMR al proveedor y recibe USDC real directamente en su wallet Base. Permanece deshabilitado hasta Base Mainnet y no se permite contra el aUSDT mock de Base Sepolia.

Terminado:

- Monorepo pnpm con `apps/web`, `packages/contracts`, `packages/sdk`, `packages/indexer`.
- Contratos Solidity compilables y testeados con Foundry.
- OpenZeppelin Contracts fijado en `5.6.1` mediante pnpm; Foundry resuelve la dependencia desde `node_modules` en clones limpios.
- Dynamic bond policy implementada mediante `CreationBondPolicy`.
- Contexto de garantia endurecido mediante `CreationBondContextResolver`: categoria, modo, riesgo y perfil del creador ya no son controlados por calldata del usuario.
- FeePolicy dinamica implementada en source: mercados pequenos `3.0%`, mercados estandar `3.5%`, mercados grandes `2.5%`, mercados muy grandes `2.0%`; retos platform-only `10%`, `8%`, `6%` o `4%`.
- Deploy local Anvil funcional.
- Deploy Base Sepolia funcional mediante Foundry Keystore y `forge script --account`.
- `PRIVATE_KEY` eliminado del flujo Base Sepolia. Solo queda como compatibilidad opcional para Anvil/local.
- Deployment vigente en Base Sepolia completado el `2026-08-09T01:49:07.837Z`.
- Ocho contratos vigentes registrados y verificados en BaseScan, incluido `CreationBondContextResolver`.
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
- PWA estatica final publicada en IPFS mediante Pinata con CID `bafybeighmwesy6luned6iglmmfygt4mjscsvcxjht7xf3x5dtznqcn6esa`.
- Tests TypeScript y Solidity pasando en la ultima verificacion registrada: `196/196` pruebas de paquetes y `50/50` pruebas Foundry.
- Smoke E2E Base Sepolia historico del deployment Phase 1 completado con mercado `2`: mint, approve, create market, bet YES, bet NO, resolve y claim.
- Smoke E2E Base Sepolia historico del deployment Phase 1 completado con reto `1`: mint, approve, create challenge, cancel y refund de bond/recompensa.
- Indexer Railway actualizado al deployment vigente, con `CONFIRMATIONS=6`, read model limpio desde el bloque `45235925`, cursor sincronizado y `0` errores.
- `AlterfordForwarder` EIP-2771 y `ChallengeFactory` con `_msgSender()` implementados, con nonce, deadline, domain separator dinamico y replay protection de OpenZeppelin.
- Gateway server-only implementado con politica allowlist de acciones, simulacion previa, limites por wallet/IP/global, idempotencia y ledger persistente atomico.
- Gateway publico en Railway: `https://alterford-gateway-production.up.railway.app`.
- Integracion vigente de Biconomy MEE para relay gasless en Base Sepolia, sin exponer credenciales privadas al navegador.
- MetaMask Embedded Wallets/Web3Auth integrado como conector social MPC opcional sin reemplazar MetaMask, Trust, Binance Web3 Wallet ni WalletConnect.
- Fiat on-ramp Transak implementado mediante sesiones de backend de un solo uso; las credenciales privadas no entran al build estatico.
- Rail XMR no custodial implementado con cotizacion transparente, atencion asistida configurable desde `1,500 USDC`, adaptador de proveedor, ledger atomico, idempotencia, firma EIP-712 con nonce por wallet y verificacion independiente de la transferencia ERC-20 en Base.
- El flujo cripto permissionless no depende de Transak, Coinbase, Google OAuth ni aprobacion comercial. Esos proveedores siguen siendo adaptadores opcionales.
- Los contratos nunca reciben XMR: el proveedor convierte y liquida USDC directamente a la wallet del usuario; solo despues de verificarse on-chain ese USDC puede utilizarse en Alterford.
- Las ocho acciones core permitidas de retos usan firma EIP-712 y relay patrocinado cuando el gateway esta activo; conservan ejecucion directa cuando no esta configurado.
- Gateway Docker construido y health/config comprobados.
- Verificacion vigente del `2026-07-22`: `50/50` tests Foundry, `196/196` tests de paquetes TS, typecheck completo, preflight de variables y build PWA estatico aprobados.
- Smoke publico del `2026-07-15`: MetaMask conectada, approve confirmado, mercado `1` creado e indexado, apuesta `0.5 aUSDT` confirmada e indexada; indexer con `0` errores.
- Actualizacion local del `2026-07-17`: API, proveedor SideShift normalizado, verificador Base, nonce EIP-712 compartido en SDK y panel de conversion XMR no custodial implementados. El rail custodial anterior queda deprecado y deshabilitado.
- La cuenta de integracion SideShift ya fue seleccionada y `XMR_PROVIDER_ACCOUNT_ID` y `XMR_PROVIDER_SECRET` estan almacenados como variables privadas en Railway. `XMR_CONVERSION_PROVIDER` permanece en `disabled`.
- Verificacion local del `2026-07-17`: `pnpm typecheck`, `pnpm build` y `134/134` pruebas de paquetes aprobadas. Se conservan como evidencia previa `37/37` pruebas del pipeline web, `48/48` pruebas Solidity y Slither sobre `85` contratos con `98` detectores y `0` resultados; no hubo cambios Solidity en el cierre XMR.
- Deploy local limpio, demos E2E de mercado y reto, indexacion de `20` eventos y recuperacion del journal tras reinicio aprobados con el resolver autoritativo.
- Smoke Base Sepolia vigente aprobado: mercados reales creados y apostados, reto creado/cancelado y ambos tipos de evento visibles en el indexer publico sin errores.

No terminado o pendiente:

- Ejecutar una prueba de aceptacion con wallets externas antes de incorporar usuarios de beta cerrada.
- Rotar API key de Basescan/Etherscan.
- Crear wallet nueva para mainnet.
- Integrar la ejecucion Docker reproducible de Echidna y Mythril en `security:all`; los tres analizadores ya fueron ejecutados manualmente contra el estado actual.
- Completar auditoria externa antes de Base Mainnet.
- Revisar bundle splitting del frontend; Vite advierte chunks mayores a 500 kB.
- Confirmar en dispositivos adicionales la reconexion del login social; Google OAuth ya fue validado en la URL publica y crea la misma wallet embebida al volver a entrar.
- Obtener/configurar credenciales Transak staging/production y dominio autorizado para activar fiat on-ramp.
- Desplegar Alterford en Base Mainnet con USDC oficial y configurar el RPC Mainnet en el gateway.
- Ejecutar una conversion canary XMR -> USDC de bajo importe y habilitar `XMR_CONVERSION_PROVIDER=sideshift` solo despues de comprobar cotizacion, firma, pago XMR, liquidacion directa, confirmaciones, limites, monitoreo y enlace BaseScan.
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
- Gateway: servicio TypeScript separado para relay EIP-2771, politicas de patrocinio, sesiones fiat opcionales y conversion XMR no custodial; el indexer permanece read-only.
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
- `CreationBondContextResolver`
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

> Deployment vigente endurecido. El manifiesto anterior se conserva en `deployments/archive/84532-2026-07-15.json` solo como historial.

Red: Base Sepolia.
Chain ID: `84532`.
RPC: `https://sepolia.base.org`.
Explorer: `https://sepolia.basescan.org`.
Deployer: `0x6Bb15228CFC4CA9f39FD76EA1dbF98A9E53be772`.
Deployment manifest: `deployments/84532.json`.
Fecha de deploy: `2026-08-09T01:49:07.837Z`.

| Modulo | Address | Tx hash | Verificacion |
|---|---:|---:|---|
| MockSettlementToken | `0x237a9d70e5f521617be81ffca47155659c238b14` | `0xad884a45de7a28fac251f5ba8cf30faa5436be7d5d638fb113e8958461c2e81a` | Verificado |
| CreationBondPolicy | `0x7b881b34eb2319d4e52b29f5cb703a2d6a7c7278` | `0xcba5f9c6be7725954861a433c95ebdbe5e958ce2842dd3f9d375567797784694` | Verificado |
| CreationBondContextResolver | `0x7f3fd8f3e3e9440647925ab720d4506c0cc193bf` | `0xa7c49533d4aa6adaba93d19bb12ee6e45e88576520360248689b119cc36b30ea` | Verificado |
| AlterfordForwarder | `0x7d0020a5129fd8c987ee93b06bc41e56f699e40a` | `0xfbd19d1123f8105452b133c9fbc0760669a40bc3106944db96a77592f66fccba` | Verificado |
| MarketFactory | `0x2f4ded37ae8738b14373e920bf9c46d23c3afe2c` | `0xf2ff862b84073eb43e72d7778fa9eca1248bbb3f4ecc2377ada3a224c4565418` | Verificado |
| BountyFactory | `0x4a3bfcce57d7d53eafaa692b947c7d39737879c4` | `0xbad6bb0de1ccdae20b091aba9856b630802a2079ce160dab518230e1a52acd23` | Verificado |
| ChallengeFactory | `0xfbe5188bdc06b0675cec8f325da7a4de3f1f5067` | `0xdf35307323ecec9a3ba93d5a051e4b58117078c78961dcb506d91bb0dcb09f6a` | Verificado |
| BountyRecoveryVault | `0xc958bff53b94f3443202f22212e78ed56c744fe9` | `0x15707784ce9fb08872ace49bc00f16140be470daa94172ff324b70228da7d6d3` | Verificado |

Gobernanza de emergencia Phase 1:

- Safe `2-de-2`: `0xcDe52A6D1c4bb32Aed4FA5C4489AbF32e237620b`.
- Cold wallet: `0xec463C1CB5a8D4bf21B75505DAEccBC12C6E3bb7`.
- El Safe posee `SECURITY_ADMIN_ROLE`; el vault solo puede enrutar fondos a la cold wallet configurada.

El preflight confirmo bytecode para los contratos reutilizados y BaseScan verifico los ocho contratos del manifiesto vigente.

## Wallet Oficial De Testnet

Uso: deployer Base Sepolia y pruebas testnet.

- Address publica: `0x6Bb15228CFC4CA9f39FD76EA1dbF98A9E53be772`.
- Foundry account: `alterford-base-sepolia-v4`.
- Keystore: Foundry encrypted keystore local.
- Password file local: `/home/telecom/.alterford/foundry-password-v4.txt`, permisos `600`; no versionado.
- Saldo posterior al deploy: `0.075453068306284972 ETH` en Base Sepolia.
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

## Registro Privado De Operaciones

Existe un registro local no versionado en `C:\Users\Windows 11 Pro\Desktop\ALTERFORD_PRIVATE_OPERATIONS`.

- `ALTERFORD_PRIVATE_REGISTRY.md` contiene inventario, clasificacion, direcciones publicas y ubicacion de cada secreto.
- `Initialize-AlterfordPrivateVault.ps1` crea un vault DPAPI cifrado para el usuario actual de Windows. El vault no se versiona ni se copia a hosting.
- Las private keys de despliegue no se copian al vault: permanecen en Foundry Keystore bajo `FOUNDRY_ACCOUNT`.
- Una direccion EVM es publica; las private keys, passwords, JWT, API secrets, tokens de pinning y claves RPC nunca se escriben en Markdown ni en Git.

## Variables Del Proyecto

Variables Base Sepolia deploy:

```text
FOUNDRY_ACCOUNT=alterford-base-sepolia-v4
FOUNDRY_PASSWORD_FILE=<ruta local privada; no versionar>
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
VITE_SETTLEMENT_TOKEN_ADDRESS=0x237a9d70e5f521617be81ffca47155659c238b14
VITE_CREATION_BOND_POLICY_ADDRESS=0x7b881b34eb2319d4e52b29f5cb703a2d6a7c7278
VITE_BOND_CONTEXT_RESOLVER_ADDRESS=0x7f3fd8f3e3e9440647925ab720d4506c0cc193bf
VITE_ALTERFORD_FORWARDER_ADDRESS=0x7d0020a5129fd8c987ee93b06bc41e56f699e40a
VITE_MARKET_FACTORY_ADDRESS=0x2f4ded37ae8738b14373e920bf9c46d23c3afe2c
VITE_BOUNTY_FACTORY_ADDRESS=0x4a3bfcce57d7d53eafaa692b947c7d39737879c4
VITE_CHALLENGE_FACTORY_ADDRESS=0xfbe5188bdc06b0675cec8f325da7a4de3f1f5067
VITE_GATEWAY_URL=https://alterford-gateway-production.up.railway.app
VITE_INDEXER_URL=https://web-production-73e1b.up.railway.app
```

Variables Base Sepolia indexer generadas en `deployments/84532.indexer.env`:

```text
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
MARKET_FACTORY_ADDRESS=0x2f4ded37ae8738b14373e920bf9c46d23c3afe2c
BOUNTY_FACTORY_ADDRESS=0x4a3bfcce57d7d53eafaa692b947c7d39737879c4
CHALLENGE_FACTORY_ADDRESS=0xfbe5188bdc06b0675cec8f325da7a4de3f1f5067
BOUNTY_RECOVERY_VAULT_ADDRESS=0xc958bff53b94f3443202f22212e78ed56c744fe9
INDEXER_STORE=data/alterford-84532-45235925.json
CONFIRMATIONS=6
START_BLOCK=45235925
MAX_LOG_BLOCK_RANGE=2000
PORT=8787
POLL_INTERVAL_MS=12000
```

Variables del rail XMR no custodial, exclusivamente en el servidor gateway:

```text
XMR_CONVERSION_PROVIDER=disabled
XMR_ASSISTED_THRESHOLD_MINOR=1500000000
XMR_SETTLEMENT_TOKEN_ADDRESS=<USDC oficial en Base Mainnet>
XMR_SETTLEMENT_CONFIRMATIONS=12
XMR_CONVERSION_LEDGER_PATH=/data/xmr-conversion-ledger.json
XMR_PROVIDER_BASE_URL=https://sideshift.ai/api/v2
XMR_PROVIDER_ACCOUNT_ID=<server-only>
XMR_PROVIDER_SECRET=<server-only>
XMR_OPERATOR_TOKEN=<secret de al menos 24 caracteres>
BASE_MAINNET_RPC_URL=<RPC Base Mainnet>
```

`XMR_CONVERSION_PROVIDER=disabled` es el valor seguro por defecto. Solo se habilita con `CHAIN_ID=8453`, RPC Mainnet explicito y ledger absoluto sobre un volumen persistente. Ninguna credencial `XMR_*` debe usar prefijo `VITE_`. Las variables `MONERO_*` pertenecen al rail custodial deprecado y deben permanecer vacias.

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
set FOUNDRY_ACCOUNT=alterford-base-sepolia-v4
set FOUNDRY_PASSWORD_FILE=/home/telecom/.alterford/foundry-password-v4.txt
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
set MARKET_FACTORY_ADDRESS=0x2f4ded37ae8738b14373e920bf9c46d23c3afe2c
set BOUNTY_FACTORY_ADDRESS=0x4a3bfcce57d7d53eafaa692b947c7d39737879c4
set CHALLENGE_FACTORY_ADDRESS=0xfbe5188bdc06b0675cec8f325da7a4de3f1f5067
set BOUNTY_RECOVERY_VAULT_ADDRESS=0xc958bff53b94f3443202f22212e78ed56c744fe9
set INDEXER_STORE=data/alterford-84532-45235925.json
set CONFIRMATIONS=6
set START_BLOCK=45235925
set MAX_LOG_BLOCK_RANGE=5
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
- CID: `bafybeighmwesy6luned6iglmmfygt4mjscsvcxjht7xf3x5dtznqcn6esa`.
- Gateway primario de prueba: `https://ipfs.io/ipfs/bafybeighmwesy6luned6iglmmfygt4mjscsvcxjht7xf3x5dtznqcn6esa/`.
- Gateway alternativo: `https://bafybeighmwesy6luned6iglmmfygt4mjscsvcxjht7xf3x5dtznqcn6esa.ipfs.dweb.link/`.
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
- Base Sepolia usa `START_BLOCK=45235925`, bloque inicial indexable del deployment vigente.
- Railway usa el RPC publico de Base Sepolia como primario y conserva soporte de endpoints alternativos mediante `RPC_URLS`.
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
- `forge test`: paso, `43/43`.
- `pnpm test`: paso, `86/86`.
- `pnpm test:web:pipeline`: paso, `37/37`.
- Slither: paso sobre 82 contratos y 98 detectores, `0` resultados.
- Echidna: paso con 20,041 secuencias; las tres propiedades economicas reportaron `passing`.
- Mythril: analisis fuente de `MarketFactory`, `BountyFactory`, `ChallengeFactory` y `Treasury` con Solidity 0.8.28, optimizer y `viaIR`; `0` issues detectados.
- Foundry coverage: 70.88% lineas, 63.55% statements, 21.62% branches y 80.92% funciones; no se agregaron tests artificiales para elevar cifras.
- Responsive publico: 390x844, 768x1024 y 1440x900 sin overflow horizontal ni controles fuera del viewport.
- `pnpm web:env:check 84532`: paso.
- Verificacion BaseScan: paso para 6/6 contratos del deployment actual.
- Smoke E2E Base Sepolia on-chain: paso.
- Smoke reto Base Sepolia on-chain: paso con create challenge, cancel y bond released.
- Indexer Base Sepolia con eventos reales: paso con `/health`, `/snapshot`, `/markets`, `/bets`, `/claims`, `/fees` y `/bonds`.

Warnings conocidos:

- Foundry reporta `block.timestamp` en comparaciones de deadlines, lock times, resolution times y subscriptions. Aceptado para MVP, debe revisarse en auditoria.
- Vite reporta chunks mayores a 500 kB. No bloquea MVP, pero debe optimizarse antes de produccion publica.
- Tests frontend pueden mostrar warnings de WalletConnect/Reown si se usa project id de desarrollo o metadata local.
- Echidna y Mythril se ejecutaron mediante sus contenedores oficiales; falta incorporar ese fallback Docker al comando agregado `security:all`.

## Decisiones Historicas

- Base elegida como red inicial por bajo costo, compatibilidad EVM y estrategia Web3 consumer.
- Base Sepolia elegida como testnet inicial.
- La casa nunca toma riesgo de contraparte: todos los fondos de usuario van por escrow y distribucion on-chain.
- Fee fijo unico reemplazado por FeePolicy: mercados pequenos bajan friccion, mercados estandar preservan `3.5%`, mercados grandes reducen fee, y retos cobran fee platform-only escalonado.
- Garantia fija `10 USDT` fue reemplazada por politica dinamica para reducir friccion en mercados pequenos y mantener friccion alta para abuso.
- WalletConnect/Reown priorizado por compatibilidad con MetaMask, Trust Wallet, Binance Web3 Wallet y mobile wallets.
- La entrada XMR no crea custodia ni saldo sintetico: un adaptador externo convierte XMR y liquida USDC directamente en la wallet Base del usuario. Los proveedores son reemplazables y no son autoridades del protocolo, pero cada proveedor puede imponer disponibilidad o credenciales propias.
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
- [x] Ejecutar `forge fmt --check`.
- [x] Ejecutar `forge build`.
- [x] Ejecutar `forge test`.
- Ejecutar `forge coverage --ir-minimum`.
- Ejecutar `SECURITY_STRICT=1 pnpm security:all`.
- [x] Completar flujo publico Base Sepolia desde navegador: connect wallet, approve, create market, indexar, bet e indexar.
- [x] Completar resolve y claim del smoke endurecido de mercado en Base Sepolia.
- [x] Ejecutar indexer Base Sepolia en modo normal con `CONFIRMATIONS=6` y confirmar `/health`, `/snapshot`, `/markets`.
- [x] Validar persistencia del store mediante redeploy controlado.
- Revisar alertas y runbook operativo.
- [x] Publicar frontend PWA en IPFS staging.
- Ejecutar el smoke manual final del deployment actual con MetaMask; despues verificar Trust Wallet, Binance Web3 Wallet y WalletConnect.
- [x] Revisar layout responsive en viewports mobile, tablet y desktop; queda la aceptacion en dispositivos Android/iOS/Huawei fisicos.
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
