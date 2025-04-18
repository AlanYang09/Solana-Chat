import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { config } from '../utils/config';
import { 
  sendMessage, 
  getMessages, 
  Message, 
  createGroup, 
  isUserOnline, 
  GroupChat, 
  getUserGroups, 
  addGroupMember, 
  removeGroupMember, 
  getGroupInfo,
  updateMessageStatus,
  getConnection
} from '../utils/solana';
import { formatDistanceToNow } from 'date-fns';
import { Connection, PublicKey } from '@solana/web3.js';

const ChatInterface: React.FC = () => {
  const wallet = useWallet();
  const [recipient, setRecipient] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupParticipants, setNewGroupParticipants] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMember, setNewMember] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [failedMessages, setFailedMessages] = useState<{[key: string]: Message}>({});
  const [updatingMessageStatus, setUpdatingMessageStatus] = useState<Set<string>>(new Set());
  
  // WebSocket connection reference
  const wsConnectionRef = useRef<WebSocket | null>(null);
  // Message textarea reference for focus management
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Function to generate a unique message ID for tracking failed messages
  const generateMessageId = (content: string, recipient: string): string => {
    return `${content.substring(0, 10)}_${recipient.substring(0, 5)}_${Date.now()}`;
  };
  const setupWebSocket = useCallback(() => {
    if (!wallet.publicKey) return;
    
    // Close existing connection if any
    if (wsConnectionRef.current) {
      wsConnectionRef.current.close();
    }
    
    setWsConnectionStatus('connecting');
    // Connect to a WebSocket server that listens for Solana program account changes
    // This would be a server that uses connection.onAccountChange or similar
    
    // Use the WebSocket URL from config
    const ws = new WebSocket(config.WS_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connection established');
      setWsConnectionStatus('connected');
      // Subscribe to updates for the current wallet
      ws.send(JSON.stringify({
        action: 'subscribe',
        wallet: wallet.publicKey?.toString(),
        group: selectedGroup
      }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'MESSAGE_UPDATE') {
        // Refresh messages when we get a notification about new message
        handleLoadMessages();
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnectionStatus('disconnected');
      setError('WebSocket connection error. Falling back to polling. Will retry connection shortly.');
      // Fall back to polling on error
      setTimeout(setupWebSocket, 5000);
    };
    
    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setWsConnectionStatus('disconnected');
      // Try to reconnect after a delay
      setTimeout(setupWebSocket, 5000);
    };
    wsConnectionRef.current = ws;
    
    return () => {
      ws.close();
    };
  }, [wallet.publicKey, selectedGroup]);
  // Function to handle keyboard shortcuts
  const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send message on Ctrl+Enter or Command+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };
  const handleSendMessage = useCallback(async (
    messageToRetry?: { id: string, content: string, recipient: string } 
  ): Promise<void> => {
    // If we're retrying a failed message, use its content and recipient
    const content = messageToRetry?.content || messageText;
    const targetRecipient = messageToRetry?.recipient || (selectedGroup ? selectedGroup : recipient);
    
    if (!wallet.publicKey || (!targetRecipient) || !content) {
      setError('Please connect your wallet, specify a recipient, and enter a message');
      return;
    }

    // Don't set global loading if we're retrying a specific message
    if (!messageToRetry) {
      setLoading(true);
    }
    setError(null);
    try {
      const messageId = messageToRetry?.id || generateMessageId(content, targetRecipient);
      
      // Remove from failed messages if we're retrying
      if (messageToRetry) {
        setFailedMessages(prev => {
          const updated = { ...prev };
          delete updated[messageId];
          return updated;
        });
      }
      
      // Send the message
      await sendMessage(targetRecipient, content, wallet, selectedGroup, isEncrypted);
      
      // Clear message text only if we're not retrying
      if (!messageToRetry) {
        setMessageText('');
        // Focus the textarea after sending
        if (messageTextareaRef.current) {
          messageTextareaRef.current.focus();
        }
      }
      
      await handleLoadMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      
      // If not retrying, save the failed message for potential retry
      if (!messageToRetry) {
        const messageId = generateMessageId(content, targetRecipient);
        setFailedMessages(prev => ({
          ...prev,
          [messageId]: {
            sender: wallet.publicKey?.toString() || '',
            recipient: targetRecipient,
            content,
            timestamp: Date.now(),
            isEncrypted,
            status: 'sent',
            groupId: selectedGroup
          }
        }));
      }
      
      setError('Failed to send message: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      // Don't set global loading to false if we're retrying a specific message
      if (!messageToRetry) {
        setLoading(false);
      }
    }
  }, [wallet, recipient, messageText, selectedGroup, isEncrypted]);
  // Helper function to retry sending a failed message
  const retryMessage = (messageId: string) => {
    const failedMessage = failedMessages[messageId];
    if (!failedMessage) return;
    
    handleSendMessage({
      id: messageId,
      content: failedMessage.content,
      recipient: failedMessage.recipient
    });
  };
  const handleLoadMessages = useCallback(async () => {
    if (!wallet.publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const fetchedMessages = await getMessages(wallet.publicKey.toString(), selectedGroup);
      
      // Mark incoming messages as read
      const messagesToUpdate = fetchedMessages.filter(
        msg => 
          msg.sender !== wallet.publicKey?.toString() && 
          msg.status !== 'read'
      );
      
      // Update message status for unread messages
      for (const msg of messagesToUpdate) {
        try {
          // Create a unique identifier for this message
          const messageKey = `${msg.sender}_${msg.timestamp}`;
          
          // Add to updating set
          setUpdatingMessageStatus(prev => new Set(prev).add(messageKey));
          
          // In a real implementation, you would:
          // 1. Find the message PDA
          // 2. Update its status on-chain
          
          // For now, we'll simulate the update with a delay
          setTimeout(() => {
            // Remove from updating set when done
            setUpdatingMessageStatus(prev => {
              const updated = new Set(prev);
              updated.delete(messageKey);
              return updated;
            });
          }, 2000);
          
          console.log('Marking message as read:', msg);
        } catch (updateError) {
          console.error('Error updating message status:', updateError);
        }
      }
      setMessages(fetchedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Failed to load messages: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey, selectedGroup]);
  
  const loadGroups = useCallback(async (): Promise<void> => {
    if (!wallet.publicKey) return;

    setLoading(true);
    try {
      const userGroups = await getUserGroups(wallet.publicKey.toString());
      setGroups(userGroups);
    } catch (error) {
      console.error('Error loading groups:', error);
      setError('Failed to load groups: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  const handleCreateGroup = async () => {
    if (!wallet.publicKey || !newGroupName || !newGroupParticipants) {
      setError('Please provide group name and participants');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const participants = newGroupParticipants.split(',').map(p => p.trim());
      
      // Validate public keys
      participants.forEach(address => {
        try {
          new PublicKey(address);
        } catch (e) {
          throw new Error(`Invalid address format: ${address}`);
        }
      });
      
      const newGroup = await createGroup(newGroupName, participants, wallet);
      await loadGroups(); // Reload groups from chain
      
      setNewGroupName('');
      setNewGroupParticipants('');
      setShowGroupForm(false);
      setSelectedGroup(newGroup.id);
    } catch (error) {
      console.error('Error creating group:', error);
      setError('Failed to create group: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddMember = async () => {
    if (!wallet.publicKey || !selectedGroup || !newMember) {
      setError('Please select a group and provide a member address');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Validate the address format
      try {
        new PublicKey(newMember);
      } catch (e) {
        throw new Error(`Invalid address format: ${newMember}`);
      }
      
      await addGroupMember(selectedGroup, newMember, wallet);
      await loadGroups(); // Reload groups from chain
      setNewMember('');
      setShowAddMember(false);
    } catch (error) {
      console.error('Error adding group member:', error);
      setError('Failed to add member: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };
  
  const handleRemoveMember = async (memberAddress: string) => {
    if (!wallet.publicKey || !selectedGroup) {
      setError('Please select a group first');
      return;
    }
    
    if (!confirm(`Are you sure you want to remove ${memberAddress}?`)) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await removeGroupMember(selectedGroup, memberAddress, wallet);
      await loadGroups(); // Reload groups from chain
    } catch (error) {
      console.error('Error removing group member:', error);
      setError('Failed to remove member: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };
  // Function to handle group selection
  const handleSelectGroup = async (groupId: string) => {
    setSelectedGroup(groupId);
    setRecipient(''); // Clear recipient when selecting a group
  };
  
  const clearError = () => {
    setError(null);
  };
  
  // Clear a failed message from the retry list
  const dismissFailedMessage = (messageId: string): void => {
    setFailedMessages(prev => {
      const updated = { ...prev };
      delete updated[messageId];
      return updated;
    });
  };
  // Initialize when wallet connects
  useEffect(() => {
    if (wallet.publicKey) {
      // Load initial data
      handleLoadMessages();
      loadGroups();
      
      // Set up WebSocket for real-time updates
      let wsCleanup;
      if (config.ENABLE_WEBSOCKET) {
        wsCleanup = setupWebSocket();
      }
      
      // Set up a fallback polling mechanism in case WebSocket fails
      const interval = setInterval(handleLoadMessages, config.POLLING_INTERVAL);
      // Proper cleanup function
      return () => {
        clearInterval(interval);
        
        // Clean up WebSocket
        if (typeof wsCleanup === 'function') {
          wsCleanup();
        } else if (wsConnectionRef.current) {
          wsConnectionRef.current.close();
        }
        
        // Set the connection status to disconnected
        setWsConnectionStatus('disconnected');
      };
    }
  }, [wallet.publicKey, handleLoadMessages, loadGroups, setupWebSocket]);
  // Reload messages when group selection changes
  useEffect(() => {
    if (wallet.publicKey && selectedGroup !== null) {
      handleLoadMessages();
      
      // Update WebSocket subscription for the new group
      if (wsConnectionRef.current && wsConnectionRef.current.readyState === WebSocket.OPEN) {
        wsConnectionRef.current.send(JSON.stringify({
          action: 'subscribe',
          wallet: wallet.publicKey.toString(),
          group: selectedGroup
        }));
      }
    }
  }, [selectedGroup, wallet.publicKey, handleLoadMessages]);

  if (!wallet.publicKey) {
    return (
      <div className="chat-interface">
        <p>Please connect your wallet to chat</p>
      </div>
    );
  }
  return (
    <div className="chat-interface">
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={clearError}>Dismiss</button>
        </div>
      )}
      
      {loading && (
        <div className="loading-indicator">
          <p>Loading...</p>
        </div>
      )}
      
      <div className="connection-status">
        <span className={`connection-indicator ${wsConnectionStatus}`}></span>
        {wsConnectionStatus === 'connected' ? 'Connected' : 
         wsConnectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
      </div>
      <div className="chat-controls">
        <button 
          onClick={() => setShowGroupForm(!showGroupForm)}
          className="create-group-button"
        >
          {showGroupForm ? 'Cancel' : 'Create Group'}
        </button>
        
        {selectedGroup && (
          <button 
            onClick={() => setShowAddMember(!showAddMember)}
            className="add-member-button"
          >
            {showAddMember ? 'Cancel' : 'Add Member'}
          </button>
        )}
        
        <label className="encrypt-toggle">
          <input
            type="checkbox"
            checked={isEncrypted}
            onChange={(e) => setIsEncrypted(e.target.checked)}
          />
          Encrypt Messages
        </label>
      </div>

      {showGroupForm && (
        <div className="group-form">
          <input
            type="text"
            placeholder="Group Name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Participant Addresses (comma-separated)"
            value={newGroupParticipants}
            onChange={(e) => setNewGroupParticipants(e.target.value)}
          />
          <button onClick={handleCreateGroup}>Create Group</button>
        </div>
      )}
      {showAddMember && selectedGroup && (
        <div className="add-member-form">
          <h4>Add New Member</h4>
          <input
            type="text"
            placeholder="Member Wallet Address"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
          />
          <button onClick={handleAddMember}>Add to Group</button>
        </div>
      )}

      {/* Failed Messages Section */}
      {Object.keys(failedMessages).length > 0 && (
        <div className="failed-messages">
          <h3>Failed Messages</h3>
          {Object.entries(failedMessages).map(([id, message]) => (
            <div key={id} className="failed-message">
              <p>To: {message.recipient.slice(0, 6)}...{message.recipient.slice(-4)}</p>
              <p>{message.content.substring(0, 30)}{message.content.length > 30 ? '...' : ''}</p>
              <div className="failed-message-actions">
                <button onClick={() => retryMessage(id)}>Retry</button>
                <button onClick={() => dismissFailedMessage(id)}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div className="group-list">
          <h3>Groups</h3>
          {groups.map(group => (
            <div key={group.id} className="group-item">
              <button
                onClick={() => handleSelectGroup(group.id)}
                className={selectedGroup === group.id ? 'active' : ''}
              >
                {group.name}
              </button>
              
              {selectedGroup === group.id && (
                <div className="group-details">
                  <h4>Members:</h4>
                  <ul className="group-members">
                    {group.participants.map((participant, idx) => (
                      <li key={idx} className="group-member">
                        <span className="member-address">
                          {participant.slice(0, 6)}...{participant.slice(-6)}
                        </span>
                        {participant !== wallet.publicKey?.toString() && (
                          <button 
                            className="remove-member-btn"
                            onClick={() => handleRemoveMember(participant)}
                            title="Remove member"
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="message-list">
        <h2>
          Messages {selectedGroup && 
            <span className="group-chat-indicator">
              (Group Chat: {groups.find(g => g.id === selectedGroup)?.name || selectedGroup})
            </span>
          }
        </h2>
        <button onClick={handleLoadMessages} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh Messages'}
        </button>
        {messages.length === 0 ? (
          <p>No messages yet</p>
        ) : (
          <ul>
            {messages.map((msg, index) => (
              <li 
                key={index} 
                className={msg.sender === wallet.publicKey?.toString() ? 'sent' : 'received'}
              >
                <div className="message-sender">
                  {msg.sender.slice(0, 6)}...{msg.sender.slice(-6)}
                  {isUserOnline(msg.sender) && <span className="online-status" title="User is online">●</span>}
                </div>
                <div className="message-content">
                  {msg.content}
                  {msg.isEncrypted && <span className="encrypted-badge" title="This message is encrypted">🔒</span>}
                </div>
                <div className="message-footer">
                  <span className="message-time" title={new Date(msg.timestamp).toLocaleString()}>
                    {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                  </span>
                  <span className="message-status">
                    {updatingMessageStatus.has(`${msg.sender}_${msg.timestamp}`) ? (
                      <span className="status-updating" title="Updating status">⟳</span>
                    ) : (
                      <>
                        {msg.status === 'sent' && <span title="Sent">✓</span>}
                        {msg.status === 'delivered' && <span title="Delivered">✓✓</span>}
                        {msg.status === 'read' && <span title="Read">✓✓✓</span>}
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="message-composer">
        {!selectedGroup && (
          <input
            type="text"
            placeholder="Recipient wallet address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        )}
        <textarea
          ref={messageTextareaRef}
          placeholder="Type your message here..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={handleMessageKeyDown}
        />
        <div className="message-controls">
          <button 
            onClick={handleSendMessage}
            disabled={loading || (!recipient && !selectedGroup) || !messageText}
          >
            {loading ? 'Sending...' : 'Send Message'}
          </button>
          {isEncrypted && (
            <span className="encryption-indicator" title="Messages will be encrypted">
              🔒 Encrypted
            </span>
          )}
        </div>
      </div>
      
      <style jsx>{`
        .chat-interface {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        
        .error-message {
          background-color: #ffdddd;
          border: 1px solid #ff0000;
          color: #ff0000;
          padding: 10px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .loading-indicator {
          background-color: #f0f0f0;
          padding: 5px;
          text-align: center;
          margin-bottom: 10px;
        }
        
        .chat-controls {
          display: flex;
          justify-content: space-between;
          margin-bottom: 15px;
        }
        
        .group-form, .add-member-form {
          background-color: #f5f5f5;
          padding: 15px;
          margin-bottom: 15px;
          border-radius: 5px;
        }
        
        .group-list {
          margin-bottom: 15px;
        }
        
        .group-item {
          margin-bottom: 10px;
        }
        
        .group-item button {
          background-color: #e0e0e0;
          border: none;
          padding: 5px 10px;
          cursor: pointer;
          margin-right: 5px;
        }
        
        .group-item button.active {
          background-color: #007bff;
          color: white;
        }
        
        .group-details {
          margin-top: 5px;
          padding-left: 15px;
          border-left: 3px solid #007bff;
        }
        
        .group-members {
          list-style: none;
          padding-left: 0;
        }
        
        .group-member {
          display: flex;
          justify-content: space-between;
          padding: 3px 0;
        }
        
        .remove-member-btn {
          background: none;
          border: none;
          color: red;
          cursor: pointer;
        }
        
        .message-list {
          flex: 1;
          overflow-y: auto;
          border: 1px solid #ccc;
          padding: 10px;
          margin-bottom: 15px;
        }
        
        .message-list ul {
          list-style: none;
          padding: 0;
        }
        
        .message-list li {
          margin-bottom: 10px;
          padding: 10px;
          border-radius: 8px;
        }
        
        .message-list li.sent {
          background-color: #d1f0d1;
          margin-left: 20%;
        }
        
        .message-list li.received {
          background-color: #e1e1e1;
          margin-right: 20%;
        }
        
        .message-sender {
          font-weight: bold;
          margin-bottom: 5px;
        }
        
        .online-status {
          color: green;
          margin-left: 5px;
        }
        
        .encrypted-badge {
          margin-left: 5px;
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
          font-size: 0.9em;
        }
        
        .connection-indicator {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 5px;
        }
        
        .connection-indicator.connected {
          background-color: green;
        }
        
        .connection-indicator.connecting {
          background-color: orange;
        }
        
        .connection-indicator.disconnected {
          background-color: red;
        }
        
        .failed-messages {
          background-color: #fff8f8;
          border: 1px solid #ffcccc;
          padding: 10px;
          margin-bottom: 15px;
          border-radius: 5px;
        }
        
        .failed-message {
          padding: 8px;
          margin-bottom: 8px;
          border-bottom: 1px solid #eee;
        }
        
        .failed-message-actions {
          display: flex;
          gap: 10px;
          margin-top: 5px;
        }
        
        .failed-message-actions button {
          padding: 3px 8px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        
        .failed-message-actions button:first-child {
          background-color: #4CAF50;
          color: white;
        }
        
        .failed-message-actions button:last-child {
          background-color: #f44336;
          color: white;
        }
        
        .status-updating {
          animation: spin 1s linear infinite;
          display: inline-block;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .message-footer {
          display: flex;
          justify-content: space-between;
          font-size: 0.8em;
          color: #666;
          margin-top: 5px;
        }
        
        .message-composer {
          display: flex;
          flex-direction: column;
        }
        
        .message-composer input,
        .message-composer textarea {
          padding: 10px;
          margin-bottom: 10px;
        }
        
        .message-composer textarea {
          height: 80px;
          resize: vertical;
        }
        
        .message-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .encryption-indicator {
          color: #007bff;
        }
      `}</style>
