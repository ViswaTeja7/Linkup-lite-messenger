/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, Group, Message } from './types';
import LoginScreen from './components/LoginScreen';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import SystemLogConsole, { SystemLog } from './components/SystemLogConsole';
import { Bell, Lock, ShieldAlert, Sparkles, X, Volume2 } from 'lucide-react';
import { SignalCryptoManager } from './utils/crypto';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [preKeyBundle, setPreKeyBundle] = useState<any | null>(null);

  // Core collections
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // Selection states
  const [activeChat, setActiveChat] = useState<{ type: 'dm' | 'group'; id: string } | null>(null);
  const [unreadChats, setUnreadChats] = useState<Record<string, number>>({});
  const [typingStatus, setTypingStatus] = useState<{ isTyping: boolean; senderName: string } | null>(null);

  // Simulated Console logs
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [showConsole, setShowConsole] = useState(true);

  // Simulated FCM Push Notification state
  const [toast, setToast] = useState<{ id: string; title: string; body: string; avatar?: string } | null>(null);

  // Socket reference
  const socketRef = useRef<Socket | null>(null);
  const activeChatRef = useRef<{ type: 'dm' | 'group'; id: string } | null>(null);

  // Update activeChatRef to avoid stale closures in socket callbacks
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Add system console logger helper
  const addSystemLog = (module: string, message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const newLog: SystemLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      module,
      message
    };
    setLogs(prev => [newLog, ...prev].slice(0, 300)); // cap at 300 logs
  };

  // 1. Session Restoration on startup
  useEffect(() => {
    addSystemLog('System', 'LinkUp Messenger Initialized. Awaiting credentials...');
    
    const savedUser = localStorage.getItem('linkup_user');
    const savedToken = localStorage.getItem('linkup_token');
    const savedBundle = localStorage.getItem('linkup_prekey');

    if (savedUser && savedToken) {
      const parsedUser = JSON.parse(savedUser);
      setCurrentUser(parsedUser);
      setToken(savedToken);
      if (savedBundle) {
        setPreKeyBundle(JSON.parse(savedBundle));
      }
      addSystemLog('System', `Restored active offline session for user: ${parsedUser.username}`);
    }
    
    // Fetch registered contacts list on startup
    fetchUsers();
  }, []);

  // Fetch Users
  const fetchUsers = async (retries = 3) => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else if (retries > 0) {
        setTimeout(() => fetchUsers(retries - 1), 1500);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchUsers(retries - 1), 1500);
      } else {
        console.warn('Error fetching users:', err);
      }
    }
  };

  // Fetch Groups
  const fetchGroups = async (userId: string, retries = 3) => {
    try {
      const res = await fetch(`/api/groups?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      } else if (retries > 0) {
        setTimeout(() => fetchGroups(userId, retries - 1), 1500);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchGroups(userId, retries - 1), 1500);
      } else {
        console.warn('Error fetching groups:', err);
      }
    }
  };

  // 2. Socket Connection management when logged in
  useEffect(() => {
    if (!currentUser) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    addSystemLog('System', 'Connecting to Socket.IO real-time relay server on port 3000...');
    const socket = io(window.location.origin);
    socketRef.current = socket;

    // Register Presence
    socket.on('connect', () => {
      addSystemLog('System', 'Connected! Sockets active.');
      socket.emit('register-presence', currentUser.id);
    });

    // Handle presence updates from other users (Redis Simulation)
    socket.on('presence-changed', (data: { userId: string; isOnline: boolean }) => {
      setUsers(prev => prev.map(u => u.id === data.userId ? { ...u, isOnline: data.isOnline } : u));
      if (data.userId !== currentUser.id) {
        addSystemLog('Redis', `Presence Event: Contact ${data.userId} is now ${data.isOnline ? 'ONLINE 🟢' : 'OFFLINE ⚪'}`);
      }
    });

    // Synchronize initial online users list
    socket.on('initial-presence-sync', (onlineIds: string[]) => {
      setUsers(prev => prev.map(u => ({
        ...u,
        isOnline: onlineIds.includes(u.id) || u.id === currentUser.id
      })));
      addSystemLog('Redis', `Cached presence synchronization complete. Online users count: ${onlineIds.length}`);
    });

    // Receive Message (MongoDB + WebSockets)
    socket.on('new-message', (msg: Message & { tempId?: string }) => {
      // Reconcile optimistic UI or insert message
      setMessages(prev => {
        // Check if message with this ID or tempId exists to prevent duplicates
        const exists = prev.find(m => m.id === msg.id || (msg.tempId && m.id === msg.tempId));
        if (exists) {
          // Update temp message with real ID and real timestamps
          return prev.map(m => (m.id === msg.id || (msg.tempId && m.id === msg.tempId)) ? msg : m);
        }
        return [...prev, msg];
      });

      // Update unread badges if message is not in active chat and not from ourselves
      const active = activeChatRef.current;
      const belongsToActive = active && (
        (active.type === 'group' && msg.groupId === active.id) ||
        (active.type === 'dm' && msg.senderId === active.id && msg.receiverId === currentUser.id)
      );

      if (!belongsToActive && msg.senderId !== currentUser.id) {
        const key = msg.groupId ? `group_${msg.groupId}` : `dm_${msg.senderId}`;
        setUnreadChats(prev => ({
          ...prev,
          [key]: (prev[key] || 0) + 1
        }));
      }

      addSystemLog('MongoDB', `Relayed message received: ID ${msg.id.substring(0, 8)}, Encrypted: ${msg.isEncrypted}`);
    });

    // Listen for real-time typing indicators
    socket.on('typing-status', (data: { senderId: string; senderName: string; roomId: string; isTyping: boolean }) => {
      const active = activeChatRef.current;
      const activeRoomId = active ? (active.type === 'group' ? active.id : [currentUser.id, active.id].sort().join('_')) : '';
      
      if (data.roomId === activeRoomId && data.senderId !== currentUser.id) {
        setTypingStatus(data.isTyping ? { isTyping: true, senderName: data.senderName } : null);
      }
    });

    // Listen for real-time message reactions
    socket.on('message-reaction-updated', (data: { messageId: string; reactions: Record<string, string[]> }) => {
      setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m));
      addSystemLog('Redis', `Reaction synced for message ${data.messageId.substring(0, 8)}`);
    });

    // Listen for FCM Background Push Notifications (Simulated)
    socket.on('push-notification', (notif: { id: string; title: string; body: string; senderId: string; senderName: string; senderAvatar: string; receiverId?: string; groupId?: string; message: Message }) => {
      const active = activeChatRef.current;
      // Show Push notification only if the message is NOT currently focused on the active chat panel and not from us
      const isActiveChatSource = active && (
        (notif.groupId && active.id === notif.groupId) ||
        (!notif.groupId && active.id === notif.senderId)
      );

      if (!isActiveChatSource && notif.senderId !== currentUser.id) {
        addSystemLog('FCM', `Simulated Firebase Cloud Notification dispatched to device: "${notif.title}"`);
        setToast({
          id: notif.id,
          title: notif.title,
          body: notif.body,
          avatar: notif.senderAvatar
        });

        // Play standard soft push ping
        try {
          const ping = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav');
          ping.volume = 0.3;
          ping.play();
        } catch {}

        // Auto-close toast after 5 seconds
        setTimeout(() => {
          setToast(prev => prev && prev.id === notif.id ? null : prev);
        }, 5000);
      }
    });

    // Load initial channels/chats
    fetchGroups(currentUser.id);
    fetchUsers();

    return () => {
      socket.disconnect();
      addSystemLog('System', 'Socket server connection terminated.');
    };
  }, [currentUser]);

  // Auth Handling Success callback
  const handleAuthSuccess = (user: User, userToken: string, bundle: any) => {
    localStorage.setItem('linkup_user', JSON.stringify(user));
    localStorage.setItem('linkup_token', userToken);
    localStorage.setItem('linkup_prekey', JSON.stringify(bundle));
    
    setCurrentUser(user);
    setToken(userToken);
    setPreKeyBundle(bundle);
  };

  // Safe Logout
  const handleLogout = () => {
    addSystemLog('System', `Logging out user: ${currentUser?.username}`);
    localStorage.removeItem('linkup_user');
    localStorage.removeItem('linkup_token');
    localStorage.removeItem('linkup_prekey');
    
    setCurrentUser(null);
    setToken(null);
    setPreKeyBundle(null);
    setActiveChat(null);
    setMessages([]);
    setUnreadChats({});
  };

  // Change active chat channel/dm room
  const handleSelectChat = (type: 'dm' | 'group', id: string) => {
    const prevActive = activeChat;
    if (prevActive && socketRef.current) {
      // Leave previous room to maintain isolation
      const prevRoomId = prevActive.type === 'group' 
        ? prevActive.id 
        : [currentUser!.id, prevActive.id].sort().join('_');
      socketRef.current.emit('leave-room', prevRoomId);
    }

    setActiveChat({ type, id });
    setTypingStatus(null);

    // Clear unread badge
    const key = `${type}_${id}`;
    setUnreadChats(prev => ({ ...prev, [key]: 0 }));

    // Join new socket room for E2E isolation (Real-time and Multi-user requirement)
    if (socketRef.current && currentUser) {
      const newRoomId = type === 'group' 
        ? id 
        : [currentUser.id, id].sort().join('_');
      socketRef.current.emit('join-room', newRoomId);
      addSystemLog('System', `Joined WebSocket isolation room: ${newRoomId}`);
    }
  };

  // Send message emitter
  const handleSendMessage = (payload: {
    encryptedData: string;
    ephemeralPublicKey?: string;
    isEncrypted: boolean;
    mediaUrl?: string;
    mediaType: 'text' | 'image' | 'video' | 'voice' | 'document';
    fileName?: string;
    fileSize?: number;
    duration?: number;
  }) => {
    if (!socketRef.current || !currentUser || !activeChat) return;

    const tempId = `temp_${Date.now()}`;
    const destination = activeChat.type === 'dm' 
      ? { receiverId: activeChat.id } 
      : { groupId: activeChat.id };

    const socketPayload = {
      ...payload,
      ...destination,
      senderId: currentUser.id,
      tempId
    };

    // Optimistic UI updates (highly responsive experience)
    const optimisticMsg: Message = {
      id: tempId,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderAvatar: currentUser.avatar,
      createdAt: new Date().toISOString(),
      ...destination,
      ...payload
    };

    setMessages(prev => [...prev, optimisticMsg]);

    // Send real-time Socket event
    socketRef.current.emit('send-message', socketPayload);
  };

  // Emit typing indicators
  const handleEmitTyping = (isTyping: boolean) => {
    if (!socketRef.current || !currentUser || !activeChat) return;
    const roomId = activeChat.type === 'group'
      ? activeChat.id
      : [currentUser.id, activeChat.id].sort().join('_');

    socketRef.current.emit('typing-status', {
      senderId: currentUser.id,
      senderName: currentUser.username,
      roomId,
      isTyping
    });
  };

  // React to message with emoji
  const handleReactToMessage = (messageId: string, emoji: string) => {
    if (!socketRef.current || !currentUser || !activeChat) return;

    const roomId = activeChat.type === 'group'
      ? activeChat.id
      : [currentUser.id, activeChat.id].sort().join('_');

    // Optimistic UI update for immediate responsiveness
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;

      const reactions = { ...(m.reactions || {}) };
      const userIds = [...(reactions[emoji] || [])];
      const index = userIds.indexOf(currentUser.id);
      
      if (index > -1) {
        userIds.splice(index, 1);
      } else {
        userIds.push(currentUser.id);
      }

      if (userIds.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = userIds;
      }

      return { ...m, reactions };
    }));

    socketRef.current.emit('reaction', {
      messageId,
      userId: currentUser.id,
      emoji,
      roomId
    });
    
    addSystemLog('Redis', `Dispatched reaction "${emoji}" for message ID ${messageId.substring(0, 8)}`);
  };

  // Create group
  const handleCreateGroup = async (name: string, description: string, members: string[]) => {
    try {
      addSystemLog('MongoDB', `Creating group '${name}' with members: ${JSON.stringify(members)}`);
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          creatorId: currentUser!.id,
          members
        })
      });

      if (res.ok) {
        const newGroup = await res.json();
        setGroups(prev => [...prev, newGroup]);
        addSystemLog('System', `Group channel '${name}' successfully configured.`);
        
        // Auto select newly created group
        handleSelectChat('group', newGroup.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Start E2E chat with an unknown username (provision on the fly if needed)
  const handleMessageUnknownUser = async (targetUsername: string): Promise<User> => {
    addSystemLog('System', `Initiating lookup for unknown username: '${targetUsername}'`);
    
    // 1. Check if the user is already in our loaded users list
    const existing = users.find(u => u.username.toLowerCase() === targetUsername.trim().toLowerCase());
    if (existing) {
      addSystemLog('System', `Contact '${targetUsername}' found. Transitioning to secure chat...`);
      handleSelectChat('dm', existing.id);
      return existing;
    }

    // 2. Otherwise, check if they exist on the server by doing a registry request
    addSystemLog('SignalCrypto', `Generating cryptographic prekey bundle for secure handshake with ${targetUsername}...`);
    const keyBundle = await SignalCryptoManager.generatePreKeyBundle(targetUsername);
    
    addSystemLog('MongoDB', `Provisioning secure virtual contact profile: ${targetUsername}`);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: targetUsername.trim(),
        password: 'simulated_password_123',
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(targetUsername.trim())}`,
        preKeyBundle: keyBundle.publicBundle
      })
    });

    if (res.ok) {
      const data = await res.json();
      addSystemLog('Redis', `Virtual user '${targetUsername}' successfully registered with ID ${data.user.id}`);
      
      // Refresh user list so they are available
      await fetchUsers();
      
      // Select chat
      handleSelectChat('dm', data.user.id);
      return data.user;
    } else {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to provision contact.');
    }
  };

  const handleUpdateProfile = async (updates: Partial<User>) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        addSystemLog('System', 'User profile updated successfully.');
        await fetchUsers(); // Refresh contacts
      }
    } catch (err) {
      console.warn('Failed to update profile:', err);
    }
  };

  const handleResetPassword = async (newPassword: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        addSystemLog('Security', 'User password updated and re-encrypted successfully.');
      } else {
        throw new Error('Failed to update password');
      }
    } catch (err) {
      console.warn('Failed to reset password:', err);
      throw err;
    }
  };

  return (
    <div id="main_app" className="h-screen flex flex-col overflow-hidden bg-[#0A0D12] font-sans text-[#E6EDF3]">
      {/* Simulated Firebase Cloud Messaging Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-[9999] w-80 bg-[#161B22]/95 backdrop-blur-xs text-[#E6EDF3] p-4 rounded-2xl shadow-2xl border border-[#30363D] flex items-start gap-3 animate-in slide-in-from-top-4 duration-300 shadow-blue-900/20">
          <Bell className="text-[#1F6FEB] mt-1 animate-bounce" size={20} />
          <div className="flex-1 leading-tight text-left">
            <h4 className="text-xs font-bold text-[#F0F6FC]">{toast.title}</h4>
            <p className="text-[11px] text-[#8B949E] mt-1">{toast.body}</p>
          </div>
          <button 
            onClick={() => setToast(null)}
            className="p-1 hover:bg-[#21262D] rounded-lg text-[#8B949E] hover:text-[#F0F6FC] transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Core Content Panel */}
      <div className="flex-1 flex overflow-hidden">
        {!currentUser ? (
          <LoginScreen 
            onAuthSuccess={handleAuthSuccess} 
            addSystemLog={addSystemLog} 
          />
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Chat Contacts / Group list */}
            <div className={`${activeChat ? 'hidden md:flex md:w-20' : 'flex w-full md:w-20'} h-full shrink-0 overflow-hidden`}>
              <ChatList
                currentUser={currentUser}
                users={users}
                groups={groups}
                activeChat={activeChat}
                onSelectChat={handleSelectChat}
                onLogout={handleLogout}
                onCreateGroup={handleCreateGroup}
                onMessageUnknownUser={handleMessageUnknownUser}
                unreadChats={unreadChats}
                onToggleConsole={() => setShowConsole(!showConsole)}
                showConsole={showConsole}
                onUpdateProfile={handleUpdateProfile}
                onResetPassword={handleResetPassword}
              />
            </div>

            {/* Right Active Conversation panel */}
            <div className={`${activeChat ? 'flex w-full md:flex-1' : 'hidden md:flex md:flex-1'} h-full overflow-hidden`}>
              <ChatWindow
                currentUser={currentUser}
                activeChat={activeChat}
                users={users}
                groups={groups}
                messages={messages}
                onSendMessage={handleSendMessage}
                typingStatus={typingStatus}
                onEmitTyping={handleEmitTyping}
                onReactToMessage={handleReactToMessage}
                addSystemLog={addSystemLog}
                onBack={() => setActiveChat(null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom togglable System Log Console for Redis, MinIO & FFmpeg */}
      {currentUser && showConsole && (
        <SystemLogConsole
          logs={logs}
          onClear={() => setLogs([])}
          onClose={() => setShowConsole(false)}
        />
      )}
    </div>
  );
}
