export { allowedVaults, canAccessVault, type KeyIdentity } from "./auth";
export { createValidator, type ValidatorOptions } from "./validator";
export {
  makeListVaultFiles,
  makeReadVaultFile,
  VaultError,
  type VaultFile,
} from "./vaults";
export { createMcpServer, type McpServerOptions } from "./server";
