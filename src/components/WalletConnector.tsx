import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const WalletConnector: React.FC = () => {
  const { publicKey } = useWallet();

  return (
    <div className="wallet-connector">
      <div className="wallet-connection-status">
        {publicKey ? (
          <div className="wallet-connected">
            <p>Connected: {publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-6)}</p>
          </div>
        ) : (
          <p>Connect your wallet to start chatting</p>
        )}
      </div>
      <WalletMultiButton />
    </div>
  );
};

export default WalletConnector;
