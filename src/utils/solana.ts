import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  AccountInfo,
  AccountMeta,
  Keypair,
  SendTransactionError,
  AccountLayout,
  TransactionSignature,
} from '@solana/web3.js';
import * as borsh from 'borsh';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { box, randomBytes } from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
// Import configuration settings
import { config } from './config';

// Use the program ID from config
const CHAT_PROGRAM_ID = new PublicKey(config.SOLANA_CHAT_PROGRAM_ID);

// Instruction types that match the Solana program
enum ChatInstructionType {
  SendMessage = 0,
  CreateGroup = 1,
  UpdateMessageStatus = 2,
}

// Schemas for borsh serialization/deserialization
class SendMessageInstruction {
  content: string;
  timestamp: bigint;
  isEncrypted: boolean;
  groupId: string | null;

  constructor(props: {
    content: string;
    timestamp: bigint;
    isEncrypted: boolean;
    groupId: string | null;
  }) {
    this.content = props.content;
    this.timestamp = props.timestamp;
    this.isEncrypted = props.isEncrypted;
    this.groupId = props.groupId;
  }
}

class CreateGroupInstruction {
  name: string;
  participants: Uint8Array[];

  constructor(props: { name: string; participants: Uint8Array[] }) {
    this.name = props.name;
    this.participants = props.participants;
  }
}

class UpdateMessageStatusInstruction {
  status: string;

  constructor(props: { status: string }) {
    this.status = props.status;
  }
}

class MessageAccount {
  isInitialized: boolean;
  sender: Uint8Array;
  recipient: Uint8Array;
  content: string;
  timestamp: bigint;
  isEncrypted: boolean;
  status: string;
  groupId: string | null;

  constructor(props: {
    isInitialized: boolean;
    sender: Uint8Array;
    recipient: Uint8Array;
    content: string;
    timestamp: bigint;
    isEncrypted: boolean;
    status: string;
    groupId: string | null;
  }) {
    this.isInitialized = props.isInitialized;
    this.sender = props.sender;
    this.recipient = props.recipient;
    this.content = props.content;
    this.timestamp = props.timestamp;
    this.isEncrypted = props.isEncrypted;
    this.status = props.status;
    this.groupId = props.groupId;
  }
}

class GroupAccount {
  isInitialized: boolean;
  id: string;
  name: string;
  participants: Uint8Array[];
  createdAt: bigint;
  creator: Uint8Array;

  constructor(props: {
    isInitialized: boolean;
    id: string;
    name: string;
    participants: Uint8Array[];
    createdAt: bigint;
    creator: Uint8Array;
  }) {
    this.isInitialized = props.isInitialized;
    this.id = props.id;
    this.name = props.name;
    this.participants = props.participants;
    this.createdAt = props.createdAt;
    this.creator = props.creator;
  }
}

// Setup borsh schemas for serialization/deserialization
const messageSchema = new Map([
  [
    MessageAccount,
    {
      kind: 'struct',
      fields: [
        ['isInitialized', 'boolean'],
        ['sender', [32]],
        ['recipient', [32]],
        ['content', 'string'],
        ['timestamp', 'u64'],
        ['isEncrypted', 'boolean'],
        ['status', 'string'],
        ['groupId', { kind: 'option', type: 'string' }],
      ],
    },
  ],
]);

const groupSchema = new Map([
  [
    GroupAccount,
    {
      kind: 'struct',
      fields: [
        ['isInitialized', 'boolean'],
        ['id', 'string'],
        ['name', 'string'],
        ['participants', ['pubkey']],
        ['createdAt', 'u64'],
        ['creator', [32]],
      ],
    },
  ],
]);

const instructionSchema = new Map([
  [
    SendMessageInstruction,
    {
      kind: 'struct',
      fields: [
        ['variant', 'u8'],
        ['content', 'string'],
        ['timestamp', 'u64'],
        ['isEncrypted', 'boolean'],
        ['groupId', { kind: 'option', type: 'string' }],
      ],
    },
  ],
  [
    CreateGroupInstruction,
    {
      kind: 'struct',
      fields: [
        ['variant', 'u8'],
        ['name', 'string'],
        ['participants', ['pubkey']],
      ],
    },
  ],
  [
    UpdateMessageStatusInstruction,
    {
      kind: 'struct',
      fields: [
        ['variant', 'u8'],
        ['status', 'string'],
      ],
    },
  ],
]);

// Helper functions for PDA derivation
export const findMessagePDA = (
  sender: PublicKey,
  recipient: PublicKey,
  timestamp: number
): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('message'),
      sender.toBuffer(),
      recipient.toBuffer(),
      Buffer.from(new BigUint64Array([BigInt(timestamp)]).buffer),
    ],
    CHAT_PROGRAM_ID
  );
};

export const findGroupPDA = (groupId: string): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('group'), Buffer.from(groupId)],
    CHAT_PROGRAM_ID
  );
};
// Interface for a message
export interface Message {
  sender: string;
  recipient: string;
  content: string;
  timestamp: number;
  isEncrypted: boolean;
  groupId?: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface GroupChat {
  id: string;
  name: string;
  participants: string[];
  createdAt: number;
}

// Store for online users (in a real app, this would be handled by a server)
const onlineUsers = new Set<string>();

// Encryption utilities
const generateKeyPair = () => box.keyPair();

const encrypt = (message: string, recipientPublicKey: Uint8Array, senderSecretKey: Uint8Array): string => {
  const ephemeralKeyPair = box.keyPair();
  const nonce = randomBytes(box.nonceLength);
  const encryptedMessage = box(
    decodeBase64(message),
    nonce,
    recipientPublicKey,
    senderSecretKey
  );
  return encodeBase64(
    Buffer.concat([ephemeralKeyPair.publicKey, nonce, encryptedMessage])
  );
};

const decrypt = (encryptedMessage: string, senderPublicKey: Uint8Array, recipientSecretKey: Uint8Array): string => {
  const messageBytes = decodeBase64(encryptedMessage);
  const ephemeralPublicKey = messageBytes.slice(0, box.publicKeyLength);
  const nonce = messageBytes.slice(
    box.publicKeyLength,
    box.publicKeyLength + box.nonceLength
  );
  const ciphertext = messageBytes.slice(box.publicKeyLength + box.nonceLength);
  const decryptedMessage = box.open(
    ciphertext,
    nonce,
    ephemeralPublicKey,
    recipientSecretKey
  );
  return encodeBase64(decryptedMessage || new Uint8Array());
};
export const sendMessage = async (
  recipientAddress: string,
  message: string,
  wallet: WalletContextState,
  groupId?: string,
  isEncrypted: boolean = false
): Promise<string> => {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    // Validate recipient address
    const recipient = new PublicKey(recipientAddress);
    
    // Get current timestamp
    const timestamp = Date.now();
    
    // Generate message PDA
    const [messagePDA, messageBump] = findMessagePDA(
      wallet.publicKey,
      recipient,
      timestamp
    );
    
    // Encrypt the message if necessary
    let finalMessage = message;
    if (isEncrypted) {
      // In a real application, you would fetch the recipient's public key
      // from some key registry and use it for encryption
      // For now, we'll just mark it as encrypted and handle encryption later
    }
    
    const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');
    // Create instruction data
    const instruction = new SendMessageInstruction({
      content: finalMessage,
      timestamp: BigInt(timestamp),
      isEncrypted,
      groupId: groupId || null,
    });
    
    const data = Buffer.from([
      ChatInstructionType.SendMessage,
      ...Buffer.from(borsh.serialize(instructionSchema, instruction)),
    ]);
    
    // Create a transaction
    const transaction = new Transaction().add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: messagePDA, isSigner: false, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: CHAT_PROGRAM_ID,
        data,
      })
    );
    
    // Send the transaction
    const signature = await wallet.sendTransaction(transaction, connection);
    
    // Update online status
    onlineUsers.add(wallet.publicKey.toString());
    
    console.log('Message sent with signature:', signature);
    return signature;
  } catch (error) {
    console.error('Error in sendMessage:', error);
    throw error;
  }
};
export const getMessages = async (walletAddress: string, groupId?: string): Promise<Message[]> => {
  try {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const walletPublicKey = new PublicKey(walletAddress);
    
    // Find all accounts owned by our program
    const programAccounts = await connection.getProgramAccounts(CHAT_PROGRAM_ID, {
      filters: [
        // Filter for message accounts
        { dataSize: 300 }, // Approximate size for messages - adjust as needed
      ],
    });
    
    const messages: Message[] = [];
    
    for (const account of programAccounts) {
      try {
        // Deserialize the account data
        const messageData = borsh.deserialize(
          messageSchema,
          MessageAccount,
          account.account.data
        );
        
        // Convert public keys from bytes to string format
        const senderPubkey = new PublicKey(messageData.sender);
        const recipientPubkey = new PublicKey(messageData.recipient);
        
        // Only include messages where this wallet is sender or recipient
        if (
          senderPubkey.equals(walletPublicKey) || 
          recipientPubkey.equals(walletPublicKey)
        ) {
          // If group filter is provided, apply it
          if (groupId && messageData.groupId !== groupId) {
            continue;
          }
          
          // Decrypt message if needed
          let content = messageData.content;
          if (messageData.isEncrypted) {
            // In a real application, we would decrypt here
            // content = decrypt(...);
          }
          
          messages.push({
            sender: senderPubkey.toString(),
            recipient: recipientPubkey.toString(),
            content,
            timestamp: Number(messageData.timestamp),
            isEncrypted: messageData.isEncrypted,
            status: messageData.status as 'sent' | 'delivered' | 'read',
            groupId: messageData.groupId || undefined,
          });
        }
      } catch (err) {
        console.error('Error deserializing message account:', err);
        // Skip this account and continue with others
      }
    }
    
    // Sort messages by timestamp, newest first
    // Sort messages by timestamp, newest first
    return messages.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error in getMessages:', error);
    throw error;
  }
};

export const getConnection = (endpoint: string): Connection => {
  return new Connection(config.SOLANA_RPC_URL, export const createGroup = async (
  name: string,
  participants: string[],
  wallet: WalletContextState
): Promise<GroupChat> => {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    // Create a unique group ID
    const timestamp = Date.now();
    const groupId = `group_${timestamp}_${wallet.publicKey.toString().substring(0, 8)}`;
    
    // Convert participant addresses to PublicKey objects
    const participantPubkeys = participants.map(addr => new PublicKey(addr));
    
    // Generate group PDA
    const [groupPDA, groupBump] = findGroupPDA(groupId);
    
    // Create a connection to the Solana network
    const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');
    
    // Create instruction data
    const participantBuffers = participantPubkeys.map(pubkey => pubkey.toBuffer());
    const instruction = new CreateGroupInstruction({
      name,
      participants: participantBuffers,
    });
    
    const data = Buffer.from([
      ChatInstructionType.CreateGroup,
      ...Buffer.from(borsh.serialize(instructionSchema, instruction)),
    ]);
    
    // Create a transaction
    const transaction = new Transaction().add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: groupPDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: CHAT_PROGRAM_ID,
        data,
      })
    );
    
    // Send the transaction
    const signature = await wallet.sendTransaction(transaction, connection);
    console.log('Group created with signature:', signature);
    
    // Return group information
    return {
      id: groupId,
      name,
      participants: [...participants, wallet.publicKey.toString()],
      createdAt: timestamp
    };
  } catch (error) {
    console.error('Error in createGroup:', error);
    throw error;
  }
};

// Group management functions
export const addGroupMember = async (
  groupId: string,
  newMemberAddress: string,
  wallet: WalletContextState
): Promise<string> => {
    // First fetch the existing group data
    const groupInfo = await getGroupInfo(groupId);
    if (!groupInfo) {
      throw new Error('Group not found');
    }
    
    // Check if the user is already a member
    if (groupInfo.participants.includes(newMemberAddress)) {
      throw new Error('User is already a member of this group');
    }
    
    // Verify the caller is a member of the group
    if (!wallet.publicKey || !groupInfo.participants.includes(wallet.publicKey.toString())) {
      throw new Error('Only group members can add new participants');
    }
    
    // Create a new version of the group with the additional member
    const newParticipants = [
      ...groupInfo.participants, 
      newMemberAddress
    ];
    
    return await updateGroupMembers(groupId, newParticipants, wallet);
  } catch (error) {
    console.error('Error in addGroupMember:', error);
    throw error;
  }
};

export const removeGroupMember = async (
  groupId: string,
  memberToRemove: string,
  wallet: WalletContextState
): Promise<string> => {
  try {
    // First fetch the existing group data
    const groupInfo = await getGroupInfo(groupId);
    if (!groupInfo) {
      throw new Error('Group not found');
    }
    
    // Verify the caller is a member of the group
    if (!wallet.publicKey || !groupInfo.participants.includes(wallet.publicKey.toString())) {
      throw new Error('Only group members can remove participants');
    }
    
    // Create a new version of the group without the removed member
    const newParticipants = groupInfo.participants.filter(p => p !== memberToRemove);
    
    // Make sure we don't remove all members
    if (newParticipants.length === 0) {
      throw new Error('Cannot remove the last member of a group');
    }
    
    return await updateGroupMembers(groupId, newParticipants, wallet);
  } catch (error) {
    console.error('Error in removeGroupMember:', error);
    throw error;
  }
};

// Helper function to update group members
async function updateGroupMembers(
  groupId: string,
  participants: string[],
  wallet: WalletContextState
): Promise<string> {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Derive the group PDA
  const [groupPDA, _] = findGroupPDA(groupId);
  
  // Convert participant addresses to PublicKey objects
  const participantPubkeys = participants.map(addr => new PublicKey(addr));
  const participantBuffers = participantPubkeys.map(pubkey => pubkey.toBuffer());
  
  // We will create a custom instruction to update the group members
  // Note: In a production implementation, you'd have a dedicated instruction for this
  const instruction = new CreateGroupInstruction({
    name: groupId, // Just using the ID as a placeholder, will be ignored
    participants: participantBuffers,
  });
  
  const data = Buffer.from([
    ChatInstructionType.CreateGroup, // Reusing the CreateGroup instruction for simplicity
    ...Buffer.from(borsh.serialize(instructionSchema, instruction)),
  ]);
  
  // Create a transaction
  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: groupPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: CHAT_PROGRAM_ID,
      data,
    })
  );
  
  // Send the transaction
  const signature = await wallet.sendTransaction(transaction, connection);
  console.log('Group members updated with signature:', signature);
  return signature;
}

// Function to get group information
export const getGroupInfo = async (groupId: string): Promise<GroupChat | null> => {
    const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');
    
    // Derive the group PDA
    const [groupPDA, _] = findGroupPDA(groupId);
    
    // Fetch the account data
    const accountInfo = await connection.getAccountInfo(groupPDA);
    if (!accountInfo) {
      return null;
    }
    
    // Deserialize the group data
    const groupData = borsh.deserialize(
      groupSchema,
      GroupAccount,
      accountInfo.data
    );
    
    // Convert public keys from bytes to string format
    const participants = groupData.participants.map(
      pubkeyBytes => new PublicKey(pubkeyBytes).toString()
    );
    
    return {
      id: groupData.id,
      name: groupData.name,
      participants,
      createdAt: Number(groupData.createdAt)
    };
  } catch (error) {
    console.error('Error in getGroupInfo:', error);
    return null;
  }
};

// Get all groups where the user is a participant
export const getUserGroups = async (walletAddress: string): Promise<GroupChat[]> => {
  try {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const walletPublicKey = new PublicKey(walletAddress);
    
    // Find all accounts owned by our program
    const programAccounts = await connection.getProgramAccounts(CHAT_PROGRAM_ID, {
      filters: [
        // Filter for group accounts (adjust dataSize based on your group structure)
        { dataSize: 200 }, // Approximate size for groups
      ],
    });
    
    const groups: GroupChat[] = [];
    
    for (const account of programAccounts) {
      try {
        // Try to deserialize as a group account
        const groupData = borsh.deserialize(
          groupSchema,
          GroupAccount,
          account.account.data
        );
        
        // Convert participant public keys to strings
        const participants = groupData.participants.map(
          pubkeyBytes => new PublicKey(pubkeyBytes).toString()
        );
        
        // Check if the user is a participant
        if (participants.includes(walletPublicKey.toString())) {
          groups.push({
            id: groupData.id,
            name: groupData.name,
            participants,
            createdAt: Number(groupData.createdAt)
          });
        }
      } catch (err) {
        // Skip if this is not a group account
        continue;
      }
    }
    
    return groups;
  } catch (error) {
    console.error('Error in getUserGroups:', error);
    return [];
  }
};
// Get message PDAs for a specific conversation or group
export const getMessagePDAs = async (
  sender: PublicKey, 
  recipient: PublicKey
): Promise<PublicKey[]> => {
  try {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Find all accounts owned by our program that match our message pattern
    const programAccounts = await connection.getProgramAccounts(CHAT_PROGRAM_ID, {
      filters: [
        // Filter for message accounts
        { dataSize: 300 }, // Approximate size for messages
      ],
    });
    
    return programAccounts
      .filter(account => {
        try {
          // Try to deserialize as a message account
          const messageData = borsh.deserialize(
            messageSchema,
            MessageAccount,
            account.account.data
          );
          
          // Check if this message is between the specified sender and recipient
          const msgSender = new PublicKey(messageData.sender);
          const msgRecipient = new PublicKey(messageData.recipient);
          
          return (
            (msgSender.equals(sender) && msgRecipient.equals(recipient)) ||
            (msgSender.equals(recipient) && msgRecipient.equals(sender))
          );
        } catch {
          return false;
        }
      })
      .map(account => account.pubkey);
  } catch (error) {
    console.error('Error in getMessagePDAs:', error);
    return [];
  }
};
