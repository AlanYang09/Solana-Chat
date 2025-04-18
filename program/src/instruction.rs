
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    sysvar,
};

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum ChatInstruction {
    /// Sends a message to another user
    /// Accounts expected:
    /// 0. `[signer]` The sender's account
    /// 1. `[writable]` The PDA for the message
    /// 2. `[]` The recipient's account
    /// 3. `[]` System program
    /// 4. `[]` Rent sysvar
    SendMessage {
        /// The content of the message (possibly encrypted)
        content: String,
        /// Timestamp of the message
        timestamp: u64,
        /// Whether the message is encrypted
        is_encrypted: bool,
        /// Optional group ID
        group_id: Option<String>,
    },

    /// Creates a group chat
    /// Accounts expected:
    /// 0. `[signer]` The creator's account
    /// 1. `[writable]` The PDA for the group
    /// 2. `[]` System program
    /// 3. `[]` Rent sysvar
    CreateGroup {
        /// Name of the group
        name: String,
        /// List of participant public keys
        participants: Vec<Pubkey>,
    },

    /// Updates the status of a message
    /// Accounts expected:
    /// 0. `[signer]` The user updating the status
    /// 1. `[writable]` The PDA for the message
    UpdateMessageStatus {
        /// New status ('sent', 'delivered', 'read')
        status: String,
    },
}

/// Creates a `SendMessage` instruction
pub fn send_message(
    program_id: &Pubkey,
    sender: &Pubkey,
    recipient: &Pubkey,
    message_pda: &Pubkey,
    content: String,
    timestamp: u64,
    is_encrypted: bool,
    group_id: Option<String>,
) -> Instruction {
    let data = ChatInstruction::SendMessage {
        content,
        timestamp,
        is_encrypted,
        group_id,
    }
    .try_to_vec()
    .unwrap();

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new_readonly(*sender, true),
            AccountMeta::new(*message_pda, false),
            AccountMeta::new_readonly(*recipient, false),
            AccountMeta::new_readonly(solana_program::system_program::id(), false),
            AccountMeta::new_readonly(sysvar::rent::id(), false),
        ],
        data,
    }
}

/// Creates a `CreateGroup` instruction
pub fn create_group(
    program_id: &Pubkey,
    creator: &Pubkey,
    group_pda: &Pubkey,
    name: String,
    participants: Vec<Pubkey>,
) -> Instruction {
    let data = ChatInstruction::CreateGroup { name, participants }.try_to_vec().unwrap();

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new_readonly(*creator, true),
            AccountMeta::new(*group_pda, false),
            AccountMeta::new_readonly(solana_program::system_program::id(), false),
            AccountMeta::new_readonly(sysvar::rent::id(), false),
        ],
        data,
    }
}

/// Creates an `UpdateMessageStatus` instruction
pub fn update_message_status(
    program_id: &Pubkey,
    user: &Pubkey,
    message_pda: &Pubkey,
    status: String,
) -> Instruction {
    let data = ChatInstruction::UpdateMessageStatus { status }.try_to_vec().unwrap();

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new_readonly(*user, true),
            AccountMeta::new(*message_pda, false),
        ],
        data,
    }
}

