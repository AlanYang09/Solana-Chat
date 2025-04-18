
use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum ChatError {
    #[error("Invalid Instruction")]
    InvalidInstruction,
    
    #[error("Not Rent Exempt")]
    NotRentExempt,
    
    #[error("Expected Amount Mismatch")]
    ExpectedAmountMismatch,
    
    #[error("Amount Overflow")]
    AmountOverflow,
    
    #[error("Unauthorized")]
    Unauthorized,
    
    #[error("Message Too Long")]
    MessageTooLong,
    
    #[error("Invalid Recipient")]
    InvalidRecipient,
    
    #[error("Invalid Group")]
    InvalidGroup,
    
    #[error("Message Not Found")]
    MessageNotFound,
}

impl From<ChatError> for ProgramError {
    fn from(e: ChatError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

