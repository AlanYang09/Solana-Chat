
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

use crate::{
    error::ChatError,
    instruction::ChatInstruction,
    state::{GroupAccount, MessageAccount, MAX_MESSAGE_LENGTH},
};

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = ChatInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        ChatInstruction::SendMessage {
            content,
            timestamp,
            is_encrypted,
            group_id,
        } => {
            send_message(program_id, accounts, content, timestamp, is_encrypted, group_id)
        }
        ChatInstruction::CreateGroup { name, participants } => {
            create_group(program_id, accounts, name, participants)
        }
        ChatInstruction::UpdateMessageStatus { status } => {
            update_message_status(program_id, accounts, status)
        }
    }
}

fn send_message(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    content: String,
    timestamp: u64,
    is_encrypted: bool,
    group_id: Option<String>,
) -> ProgramResult {
    // Validate content length
    if content.len() > MAX_MESSAGE_LENGTH {
        return Err(ChatError::MessageTooLong.into());
    }

    let account_info_iter = &mut accounts.iter();

    // Get accounts
    let sender_account = next_account_info(account_info_iter)?;
    let message_account = next_account_info(account_info_iter)?;
    let recipient_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    let rent_account = next_account_info(account_info_iter)?;

    // Verify the sender signed the transaction
    if !sender_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Derive the message PDA to verify it's correct
    let message_seeds = [
        b"message",
        sender_account.key.as_ref(),
        recipient_account.key.as_ref(),
        &timestamp.to_le_bytes(),
    ];
    let (expected_message_pubkey, bump_seed) =
        Pubkey::find_program_address(&message_seeds, program_id);

    // Verify the derived address matches the provided message account
    if expected_message_pubkey != *message_account.key {
        return Err(ProgramError::InvalidArgument);
    }

    // Calculate the rent-exempt amount for the account
    let rent = Rent::from_account_info(rent_account)?;
    let message_size = std::mem::size_of::<MessageAccount>();
    let content_size = content.len();
    let account_size = message_size + content_size;
    let rent_lamports = rent.minimum_balance(account_size);

    // Create the message account with enough space
    invoke_signed(
        &system_instruction::create_account(
            sender_account.key,
            message_account.key,
            rent_lamports,
            account_size as u64,
            program_id,
        ),
        &[
            sender_account.clone(),
            message_account.clone(),
            system_program.clone(),
        ],
        &[&[
            b"message",
            sender_account.key.as_ref(),
            recipient_account.key.as_ref(),
            &timestamp.to_le_bytes(),
            &[bump_seed],
        ]],
    )?;

    // Set message data
    let message_data = MessageAccount {
        is_initialized: true,
        sender: *sender_account.key,
        recipient: *recipient_account.key,
        content,
        timestamp,
        is_encrypted,
        status: "sent".to_string(),
        group_id,
    };
    
    // Save the message data to the account
    message_data.serialize(&mut &mut message_account.data.borrow_mut()[..])?;

    msg!("Message sent successfully");
    Ok(())
}

fn create_group(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    name: String,
    participants: Vec<Pubkey>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    // Get accounts
    let creator_account = next_account_info(account_info_iter)?;
    let group_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    let rent_account = next_account_info(account_info_iter)?;

    // Verify the creator signed the transaction
    if !creator_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Create a unique group ID
    let timestamp = solana_program::clock::Clock::get()?.unix_timestamp;
    let group_id = format!("group_{}_{}",
        timestamp,
        creator_account.key.to_string().chars().take(8).collect::<String>()
    );

    // Derive the group PDA
    let group_seeds = [b"group", group_id.as_bytes()];
    let (expected_group_pubkey, bump_seed) =
        Pubkey::find_program_address(&group_seeds, program_id);

    // Verify the derived address matches the provided group account
    if expected_group_pubkey != *group_account.key {
        return Err(ProgramError::InvalidArgument);
    }

    // Calculate the required space and rent
    let rent = Rent::from_account_info(rent_account)?;

