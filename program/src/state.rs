
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    program_pack::{IsInitialized, Sealed},
    pubkey::Pubkey,
};

/// Maximum length for a message content
pub const MAX_MESSAGE_LENGTH: usize = 1024;

/// Message account data structure
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct MessageAccount {
    /// Whether this account has been initialized
    pub is_initialized: bool,
    /// Sender's public key
    pub sender: Pubkey,
    /// Recipient's public key
    pub recipient: Pubkey,
    /// Content of the message (possibly encrypted)
    pub content: String,
    /// Timestamp when message was sent
    pub timestamp: u64,
    /// Whether the message is encrypted
    pub is_encrypted: bool,
    /// Status of the message: "sent", "delivered", or "read"
    pub status: String,
    /// Optional group ID if this is a group message
    pub group_id: Option<String>,
}

impl Sealed for MessageAccount {}

impl IsInitialized for MessageAccount {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

/// Group chat account data structure
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct GroupAccount {
    /// Whether this account has been initialized
    pub is_initialized: bool,
    /// Group ID
    pub id: String,
    /// Group name
    pub name: String,
    /// List of participant public keys
    pub participants: Vec<Pubkey>,
    /// Timestamp when the group was created
    pub created_at: u64,
    /// Creator's public key
    pub creator: Pubkey,
}

impl Sealed for GroupAccount {}

impl IsInitialized for GroupAccount {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

