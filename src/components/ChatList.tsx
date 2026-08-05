/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Group, MediaType } from '../types';
import { Search, Plus, MessageSquare, Shield, Users, LogOut, Terminal, Sparkles, Circle, UserPlus, Loader2, Settings, Key } from 'lucide-react';

interface ChatListProps {
  currentUser: User;
  users: User[];
  groups: Group[];
  activeChat: { type: 'dm' | 'group'; id: string } | null;
  onSelectChat: (type: 'dm' | 'group', id: string) => void;
  onLogout: () => void;
  onCreateGroup: (name: string, description: string, members: string[]) => Promise<void>;
  onMessageUnknownUser: (username: string) => Promise<User>;
  unreadChats: Record<string, number>; // key: 'dm_userId' or 'group_groupId'
  onToggleConsole: () => void;
  showConsole: boolean;
  onUpdateProfile: (updates: Partial<User>) => Promise<void>;
  onResetPassword: (newPassword: string) => Promise<void>;
}

export default function ChatList({
  currentUser,
  users,
  groups,
  activeChat,
  onSelectChat,
  onLogout,
  onCreateGroup,
  onMessageUnknownUser,
  unreadChats,
  onToggleConsole,
  showConsole,
  onUpdateProfile,
  onResetPassword
}: ChatListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Profile Settings state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(currentUser.username);
  const [editStatusMessage, setEditStatusMessage] = useState(currentUser.statusMessage || '');
  const [editAvatarColor, setEditAvatarColor] = useState(currentUser.avatarColor || '#1F6FEB');
  const [isProfileUpdating, setIsProfileUpdating] = useState(false);

  // Password Reset state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isPasswordResetting, setIsPasswordResetting] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{type: 'error' | 'success', text: string} | null>(null);

  // Unknown User messaging state
  const [isUnknownUserModalOpen, setIsUnknownUserModalOpen] = useState(false);
  const [unknownUsername, setUnknownUsername] = useState('');
  const [isProvisioningUnknown, setIsProvisioningUnknown] = useState(false);
  const [unknownUserError, setUnknownUserError] = useState<string | null>(null);

  // Filter users (excluding current user)
  const filteredUsers = users
    .filter(u => u.id !== currentUser.id)
    .filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()));

  // Filter groups
  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    // Creator is always a member
    const members = [...selectedMembers, currentUser.id];
    await onCreateGroup(newGroupName, newGroupDesc, members);
    
    // Reset state
    setNewGroupName('');
    setNewGroupDesc('');
    setSelectedMembers([]);
    setIsGroupModalOpen(false);
  };

  const handleUnknownUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = unknownUsername.trim();
    if (!cleanUsername) {
      setUnknownUserError('Please enter a username.');
      return;
    }

    if (cleanUsername.toLowerCase() === currentUser.username.toLowerCase()) {
      setUnknownUserError('You cannot start a chat with yourself.');
      return;
    }

    setIsProvisioningUnknown(true);
    setUnknownUserError(null);

    try {
      await onMessageUnknownUser(cleanUsername);
      setUnknownUsername('');
      setIsUnknownUserModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setUnknownUserError(err.message || 'Could not connect to this username.');
    } finally {
      setIsProvisioningUnknown(false);
    }
  };

  const toggleMemberSelection = (userId: string) => {
    if (selectedMembers.includes(userId)) {
      setSelectedMembers(selectedMembers.filter(id => id !== userId));
    } else {
      setSelectedMembers([...selectedMembers, userId]);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProfileUpdating(true);
    await onUpdateProfile({
      username: editDisplayName,
      statusMessage: editStatusMessage,
      avatarColor: editAvatarColor
    });
    setIsProfileUpdating(false);
    setIsProfileModalOpen(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;
    setIsPasswordResetting(true);
    setPasswordMessage(null);
    try {
      await onResetPassword(newPassword);
      setPasswordMessage({ type: 'success', text: 'Password reset successfully.' });
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordMessage(null);
        setNewPassword('');
      }, 2000);
    } catch (err) {
      setPasswordMessage({ type: 'error', text: 'Failed to reset password.' });
    } finally {
      setIsPasswordResetting(false);
    }
  };

  return (
    <div id="chat_list" className="w-full md:w-20 h-full bg-[#161B22] border-r border-[#30363D] flex flex-col items-stretch md:items-center text-[#E6EDF3] select-none">
      {/* Profile Header */}
      <div className="p-3.5 md:p-4 bg-[#161B22] text-[#F0F6FC] border-b border-[#30363D] w-full flex flex-row md:flex-col justify-between md:justify-start items-center gap-3 md:gap-4">
        <div className="flex items-center gap-3 md:flex-col md:gap-1.5 w-auto">
          <div className="relative group flex justify-center shrink-0">
            <img
              src={currentUser.avatar}
              alt="My Avatar"
              className="w-9 h-9 md:w-10 md:h-10 rounded-full border-2 border-[#1F6FEB] bg-[#0D1117] p-0.5 shadow-lg shadow-blue-950/40 cursor-help"
              referrerPolicy="no-referrer"
            />
            {/* Tooltip on hover */}
            <div className="absolute left-16 top-2 hidden md:group-hover:block bg-[#161B22] text-xs font-semibold px-2 py-1 rounded border border-[#30363D] whitespace-nowrap z-50 shadow-md text-[#F0F6FC]">
              {currentUser.username} (E2E Active)
            </div>
          </div>
          <div className="text-left md:text-center min-w-0">
            <h2 className="text-xs font-bold text-[#F0F6FC] md:hidden truncate max-w-[120px]">{currentUser.username}</h2>
            <span className="text-[9px] text-[#8B949E] flex items-center gap-1 md:hidden">
              <span className="w-1.5 h-1.5 bg-[#238636] rounded-full"></span> Secure Session
            </span>
          </div>
        </div>

        <div className="flex items-center md:flex-col gap-2">
          {/* New Group Button (on Mobile, we put it in the header for easy access) */}
          <button
            onClick={() => setIsGroupModalOpen(true)}
            className="md:hidden p-2 bg-[#1F6FEB]/10 text-[#1F6FEB] hover:bg-[#1F6FEB]/20 border border-[#1F6FEB]/30 rounded-xl transition-all cursor-pointer flex items-center justify-center"
            title="Create New Group"
          >
            <Plus size={16} />
          </button>

          {/* New DM / Message Unknown Username Button */}
          <button
            onClick={() => setIsUnknownUserModalOpen(true)}
            className="p-2 bg-[#21262D] hover:bg-[#30363D] border border-dashed border-[#30363D] hover:border-[#8B949E] rounded-xl text-[#8B949E] hover:text-[#F0F6FC] transition-all cursor-pointer flex items-center justify-center shadow-md hover:scale-105"
            title="Message Unknown Username"
          >
            <UserPlus size={16} />
          </button>
          
          <button
            onClick={onToggleConsole}
            title="Toggle S3/Redis System Console"
            className={`hidden lg:inline-flex p-2 rounded-xl transition-colors cursor-pointer ${showConsole ? 'bg-[#1F6FEB]/20 text-[#1F6FEB]' : 'bg-[#21262D] text-[#8B949E] hover:bg-[#30363D] hover:text-[#F0F6FC]'}`}
          >
            <Terminal size={18} />
          </button>

          <button
            onClick={() => setIsProfileModalOpen(true)}
            title="Profile Settings"
            className="p-2 bg-[#21262D] hover:bg-[#30363D] rounded-xl text-[#8B949E] hover:text-[#F0F6FC] transition-colors cursor-pointer flex items-center justify-center"
          >
            <Settings size={16} />
          </button>

          <button
            onClick={() => setIsPasswordModalOpen(true)}
            title="Reset Password"
            className="p-2 bg-[#21262D] hover:bg-[#30363D] rounded-xl text-[#8B949E] hover:text-[#F0F6FC] transition-colors cursor-pointer flex items-center justify-center"
          >
            <Key size={16} />
          </button>
          
          <button
            onClick={onLogout}
            title="Log Out Safely"
            className="p-2 bg-[#21262D] hover:bg-rose-950/40 hover:text-rose-400 rounded-xl text-[#8B949E] transition-colors cursor-pointer flex items-center justify-center"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable Channels & Chats */}
      <div className="flex-1 overflow-y-auto w-full py-4 space-y-6 flex flex-col items-stretch divide-y divide-[#30363D]/30">
        {/* GROUPS SECTION */}
        <div className="w-full flex flex-col items-stretch px-3 md:px-0 md:items-center">
          <div className="hidden md:flex flex-col items-center gap-3">
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className="p-2 bg-[#21262D] hover:bg-[#30363D] rounded-xl text-[#8B949E] hover:text-[#F0F6FC] transition-all cursor-pointer flex items-center justify-center shadow-md border border-[#30363D]/50 hover:scale-105"
              title="Create New Group"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setIsUnknownUserModalOpen(true)}
              className="p-2 mb-4 bg-[#21262D] hover:bg-[#30363D] rounded-xl text-[#8B949E] hover:text-[#F0F6FC] transition-all cursor-pointer flex items-center justify-center shadow-md border border-[#30363D]/50 hover:scale-105"
              title="Message Unknown Username"
            >
              <UserPlus size={16} />
            </button>
          </div>

          <div className="px-2 py-1 text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-2 flex items-center justify-between md:hidden">
            <span>Groups ({filteredGroups.length})</span>
            <button 
              onClick={() => setIsGroupModalOpen(true)}
              className="text-[#1F6FEB] hover:underline flex items-center gap-0.5 text-[9px] cursor-pointer"
            >
              + Create
            </button>
          </div>

          <div className="space-y-1 md:space-y-3 w-full flex flex-col items-stretch md:items-center px-1">
            {filteredGroups.map(group => {
              const isSelected = activeChat?.type === 'group' && activeChat?.id === group.id;
              const unreadCount = unreadChats[`group_${group.id}`] || 0;
              
              return (
                <button
                  key={group.id}
                  onClick={() => onSelectChat('group', group.id)}
                  className={`relative p-2 rounded-xl transition-all cursor-pointer group flex items-center md:justify-center gap-3 md:gap-0 ${
                    isSelected
                      ? 'bg-[#1F6FEB]/20 text-[#F0F6FC] ring-2 ring-[#1F6FEB]/60 md:ring-[#1F6FEB]'
                      : 'hover:bg-[#1C2128] text-[#8B949E] hover:text-[#E6EDF3]'
                  }`}
                >
                  <img
                    src={group.avatar}
                    alt={group.name}
                    className="w-10 h-10 rounded-xl bg-[#0D1117] p-0.5 object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Name next to image (visible only on mobile, hidden on desktop md:) */}
                  <div className="flex-1 text-left md:hidden min-w-0">
                    <h3 className="text-xs font-bold text-[#F0F6FC] truncate">{group.name}</h3>
                    <p className="text-[10px] text-[#8B949E] truncate">{group.description || 'Secure chat room'}</p>
                  </div>

                  {/* Desktop Tooltip */}
                  <div className="absolute left-16 top-3 hidden md:group-hover:block bg-[#161B22] text-xs font-semibold px-2.5 py-1 rounded-lg border border-[#30363D] whitespace-nowrap z-50 shadow-xl text-[#F0F6FC]">
                    {group.name} ({group.members.length} members)
                  </div>

                  {unreadCount > 0 && (
                    <span className="md:absolute md:-top-1 md:-right-1 bg-[#1F6FEB] text-white text-[9px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#161B22] animate-pulse shrink-0">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* DIRECT MESSAGES SECTION */}
        <div className="w-full flex flex-col items-stretch pt-4 px-3 md:px-0 md:items-center">
          <div className="px-2 py-1 text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-2 flex items-center justify-between md:hidden">
            <span>Direct Messages ({filteredUsers.length})</span>
            <button 
              onClick={() => setIsUnknownUserModalOpen(true)}
              className="text-[#1F6FEB] hover:underline flex items-center gap-0.5 text-[9px] cursor-pointer"
            >
              + Message
            </button>
          </div>

          <div className="space-y-1 md:space-y-3 w-full flex flex-col items-stretch md:items-center px-1">
            {filteredUsers.map(user => {
              const isSelected = activeChat?.type === 'dm' && activeChat?.id === user.id;
              const unreadCount = unreadChats[`dm_${user.id}`] || 0;

              return (
                <button
                  key={user.id}
                  onClick={() => onSelectChat('dm', user.id)}
                  className={`relative p-2 rounded-xl md:rounded-full transition-all cursor-pointer group flex items-center md:justify-center gap-3 md:gap-0 ${
                    isSelected
                      ? 'bg-[#1F6FEB]/20 text-[#F0F6FC] ring-2 ring-[#1F6FEB]/60 md:ring-[#1F6FEB]'
                      : 'hover:bg-[#1C2128] text-[#8B949E] hover:text-[#E6EDF3]'
                  }`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="w-10 h-10 rounded-full bg-[#0D1117] p-0.5 object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {user.isOnline ? (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#238636] border-2 border-[#161B22] rounded-full" />
                    ) : (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-gray-600 border-2 border-[#161B22] rounded-full" />
                    )}
                  </div>

                  {/* Username next to image (visible only on mobile, hidden on desktop md:) */}
                  <div className="flex-1 text-left md:hidden min-w-0">
                    <h3 className="text-xs font-bold text-[#F0F6FC] truncate">{user.username}</h3>
                    <p className="text-[10px] text-[#8B949E] truncate">
                      {user.isOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>

                  {/* Desktop Tooltip */}
                  <div className="absolute left-16 top-3 hidden md:group-hover:block bg-[#161B22] text-xs font-semibold px-2.5 py-1 rounded-lg border border-[#30363D] whitespace-nowrap z-50 shadow-xl text-[#F0F6FC]">
                    {user.username} {user.isOnline ? '(Online)' : '(Offline)'}
                  </div>

                  {unreadCount > 0 && (
                    <span className="md:absolute md:-top-1 md:-right-1 bg-[#238636] text-white text-[9px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#161B22] animate-pulse shrink-0">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* CREATE GROUP DIALOG MODAL */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl w-full max-w-sm p-6 shadow-2xl text-[#E6EDF3] animate-in zoom-in-95 duration-150">
            <h2 className="text-sm font-bold text-[#F0F6FC] mb-3 flex items-center gap-2">
              <Users size={18} className="text-[#1F6FEB]" /> Create Encrypted Group
            </h2>
            
            <form onSubmit={handleCreateGroupSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Design Sync Room"
                  className="w-full px-3 py-2 border border-[#30363D] focus:border-[#1F6FEB] outline-none rounded-xl text-xs font-medium text-[#E6EDF3] bg-[#0D1117] focus:bg-[#0D1117]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="Group topic or notes..."
                  rows={2}
                  className="w-full px-3 py-2 border border-[#30363D] focus:border-[#1F6FEB] outline-none rounded-xl text-xs font-medium text-[#E6EDF3] bg-[#0D1117] focus:bg-[#0D1117] resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-1">
                  Select Members
                </label>
                <div className="max-h-28 overflow-y-auto space-y-1 border border-[#30363D] p-2 rounded-xl bg-[#0D1117]/50">
                  {users.filter(u => u.id !== currentUser.id).map(user => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleMemberSelection(user.id)}
                      className={`w-full p-1.5 rounded-lg text-left flex items-center justify-between text-xs transition-all ${
                        selectedMembers.includes(user.id)
                          ? 'bg-[#1F6FEB]/15 text-[#58a6ff] font-semibold'
                          : 'hover:bg-[#1C2128] text-[#8B949E]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <img src={user.avatar} className="w-5 h-5 rounded-full" />
                        <span>{user.username}</span>
                      </div>
                      <span className={`w-3.5 h-3.5 border rounded-full flex items-center justify-center ${
                        selectedMembers.includes(user.id)
                          ? 'border-[#1F6FEB] bg-[#1F6FEB] text-white text-[9px]'
                          : 'border-[#30363D] bg-[#0D1117]'
                      }`}>
                        {selectedMembers.includes(user.id) && '✓'}
                      </span>
                    </button>
                  ))}
                  {users.filter(u => u.id !== currentUser.id).length === 0 && (
                    <p className="text-[10px] text-[#8B949E] text-center py-2">No other contacts to add</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  className="px-3 py-2 hover:bg-[#21262D] text-[#8B949E] rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-[#1F6FEB] hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-900/40 cursor-pointer"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MESSAGE UNKNOWN USER / NUMBER DIALOG MODAL */}
      {isUnknownUserModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl w-full max-w-sm p-6 shadow-2xl text-[#E6EDF3] animate-in zoom-in-95 duration-150">
            <h2 className="text-sm font-bold text-[#F0F6FC] mb-2 flex items-center gap-2">
              <UserPlus size={18} className="text-[#1F6FEB]" /> Chat with Unknown Username
            </h2>
            <p className="text-[11px] text-[#8B949E] mb-4 leading-tight">
              Start an end-to-end encrypted direct message with any contact by entering their username (like entering a phone number on WhatsApp).
            </p>
            
            <form onSubmit={handleUnknownUserSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-1">
                  Recipient Username
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  disabled={isProvisioningUnknown}
                  value={unknownUsername}
                  onChange={(e) => {
                    setUnknownUsername(e.target.value);
                    setUnknownUserError(null);
                  }}
                  placeholder="e.g. charlie, diana, or a new username..."
                  className="w-full px-3 py-2 border border-[#30363D] focus:border-[#1F6FEB] outline-none rounded-xl text-xs font-medium text-[#E6EDF3] bg-[#0D1117] focus:bg-[#0D1117]"
                />
              </div>

              {/* Dynamic Status Check */}
              {unknownUsername.trim() && (
                <div className="p-2.5 rounded-xl text-[11px] leading-tight bg-[#0D1117]/60 border border-[#30363D]/60">
                  {unknownUsername.trim().toLowerCase() === currentUser.username.toLowerCase() ? (
                    <span className="text-amber-500 font-medium">⚠️ You cannot start a chat with yourself.</span>
                  ) : users.some(u => u.username.toLowerCase() === unknownUsername.trim().toLowerCase()) ? (
                    <span className="text-emerald-500 font-medium">🟢 Contact is already in your contacts! Direct message ready.</span>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-blue-400 font-semibold block">⚡ Unknown Username / Number</span>
                      <span className="text-[#8B949E] block">
                        We will register this virtual profile on the fly and exchange cryptographic prekey bundles to establish a secure session!
                      </span>
                    </div>
                  )}
                </div>
              )}

              {unknownUserError && (
                <div className="p-2.5 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-xs font-medium">
                  {unknownUserError}
                </div>
              )}

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  type="button"
                  disabled={isProvisioningUnknown}
                  onClick={() => {
                    setIsUnknownUserModalOpen(false);
                    setUnknownUsername('');
                    setUnknownUserError(null);
                  }}
                  className="px-3 py-2 hover:bg-[#21262D] text-[#8B949E] rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProvisioningUnknown || !unknownUsername.trim() || unknownUsername.trim().toLowerCase() === currentUser.username.toLowerCase()}
                  className="px-3.5 py-2 bg-[#1F6FEB] hover:bg-blue-500 disabled:bg-[#1f6feb]/50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-900/40 cursor-pointer flex items-center gap-1.5"
                >
                  {isProvisioningUnknown ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Provisioning E2E...
                    </>
                  ) : (
                    'Start Chat'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* PROFILE SETTINGS MODAL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl w-full max-w-sm p-6 shadow-2xl text-[#E6EDF3] animate-in zoom-in-95 duration-150">
            <h2 className="text-sm font-bold text-[#F0F6FC] mb-4 flex items-center gap-2">
              <Settings size={18} className="text-[#1F6FEB]" /> Profile Settings
            </h2>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#30363D] focus:border-[#1F6FEB] outline-none rounded-xl text-xs font-medium text-[#E6EDF3] bg-[#0D1117] focus:bg-[#0D1117]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-1">
                  Status Message
                </label>
                <input
                  type="text"
                  value={editStatusMessage}
                  onChange={(e) => setEditStatusMessage(e.target.value)}
                  placeholder="e.g. Available, At work..."
                  className="w-full px-3 py-2 border border-[#30363D] focus:border-[#1F6FEB] outline-none rounded-xl text-xs font-medium text-[#E6EDF3] bg-[#0D1117] focus:bg-[#0D1117]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-1">
                  Avatar Color Hex
                </label>
                <input
                  type="text"
                  value={editAvatarColor}
                  onChange={(e) => setEditAvatarColor(e.target.value)}
                  placeholder="#1F6FEB"
                  className="w-full px-3 py-2 border border-[#30363D] focus:border-[#1F6FEB] outline-none rounded-xl text-xs font-medium text-[#E6EDF3] bg-[#0D1117] focus:bg-[#0D1117]"
                />
              </div>
              
              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="px-3 py-2 hover:bg-[#21262D] text-[#8B949E] rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProfileUpdating}
                  className="px-3.5 py-2 bg-[#1F6FEB] hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-900/40 cursor-pointer flex items-center gap-1.5"
                >
                  {isProfileUpdating ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PASSWORD RESET MODAL */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl w-full max-w-sm p-6 shadow-2xl text-[#E6EDF3] animate-in zoom-in-95 duration-150">
            <h2 className="text-sm font-bold text-[#F0F6FC] mb-4 flex items-center gap-2">
              <Key size={18} className="text-[#1F6FEB]" /> Reset Password
            </h2>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 border border-[#30363D] focus:border-[#1F6FEB] outline-none rounded-xl text-xs font-medium text-[#E6EDF3] bg-[#0D1117] focus:bg-[#0D1117]"
                />
              </div>

              {passwordMessage && (
                <div className={`p-2.5 rounded-xl text-xs font-medium ${
                  passwordMessage.type === 'success' 
                    ? 'bg-[#238636]/20 border border-[#238636]/50 text-[#3fb950]' 
                    : 'bg-red-950/20 border border-red-900/50 text-red-400'
                }`}>
                  {passwordMessage.text}
                </div>
              )}

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setPasswordMessage(null);
                    setNewPassword('');
                  }}
                  className="px-3 py-2 hover:bg-[#21262D] text-[#8B949E] rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPasswordResetting || !newPassword.trim()}
                  className="px-3.5 py-2 bg-[#1F6FEB] hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-900/40 cursor-pointer flex items-center gap-1.5"
                >
                  {isPasswordResetting ? <Loader2 size={13} className="animate-spin" /> : 'Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
