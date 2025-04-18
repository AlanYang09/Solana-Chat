// Configuration settings for the application

// Get environment variables with fallbacks
const getEnvVariable = (key: string, defaultValue: string): string => {
  // For create-react-app, environment variables must be prefixed with REACT_APP_
  const envVar = process.env[`REACT_APP_${key}`] || process.env[key];
  return envVar || defaultValue;
};

// API endpoints and configuration
export const config = {
  // Solana network configuration
  SOLANA_RPC_URL: getEnvVariable('SOLANA_RPC_URL', 'https://api.devnet.solana.com'),
  SOLANA_NETWORK: getEnvVariable('SOLANA_NETWORK', 'devnet'),
  SOLANA_CHAT_PROGRAM_ID: getEnvVariable('SOLANA_CHAT_PROGRAM_ID', 'ChatProgramPubkey11111111111111111111111'),
  
  // WebSocket configuration
  WS_URL: getEnvVariable('WS_URL', 'wss://solana-chat-ws.example.com'),
  
  // Feature flags
  ENABLE_ENCRYPTION: getEnvVariable('ENABLE_ENCRYPTION', 'true') === 'true',
  ENABLE_WEBSOCKET: getEnvVariable('ENABLE_WEBSOCKET', 'true') === 'true',
  POLLING_INTERVAL: parseInt(getEnvVariable('POLLING_INTERVAL', '30000')), // milliseconds
};

