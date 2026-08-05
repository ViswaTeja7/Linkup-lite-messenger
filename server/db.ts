/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const STORE_PATH = path.join(process.cwd(), 'data-store.json');

// Interface representing the full database structure
interface DatabaseSchema {
  users: Record<string, any>;        // Simulated MongoDB Users collection
  messages: any[];                   // Simulated MongoDB Messages collection
  groups: any[];                     // Simulated MongoDB Groups collection
  preKeys: Record<string, any>;      // Public pre-key bundles for Signal Protocol E2E
  presence: Record<string, boolean>; // Simulated Redis cache for real-time presence
}

// Initial default state
const defaultDb: DatabaseSchema = {
  users: {},
  messages: [],
  groups: [
    {
      id: 'group_general',
      name: '🌎 LinkUp Global Lounge',
      description: 'The official global lounge for all users to meet, chat, and test end-to-end encrypted media sharing!',
      avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&h=150&fit=crop',
      creatorId: 'system',
      members: [],
      createdAt: new Date().toISOString()
    }
  ],
  preKeys: {},
  presence: {}
};

class LocalDatabase {
  private db: DatabaseSchema = { ...defaultDb };

  constructor() {
    this.load();
  }

  // Load database from file
  private load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        this.db = JSON.parse(raw);
        console.log('[DB] Database loaded successfully with', Object.keys(this.db.users).length, 'users.');
      } else {
        this.db = { ...defaultDb };
        this.save();
      }
    } catch (err) {
      console.error('[DB] Failed to load data-store.json. Resetting.', err);
      this.db = { ...defaultDb };
    }
  }

  // Save database to file
  private save() {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.db, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to save database to disk.', err);
    }
  }

  // USERS OPERATIONS
  public getUsers() {
    return Object.values(this.db.users).map(user => ({
      ...user,
      isOnline: !!this.db.presence[user.id]
    }));
  }

  public getUser(id: string) {
    if (!this.db.users[id]) return null;
    return {
      ...this.db.users[id],
      isOnline: !!this.db.presence[id]
    };
  }

  public getUserByUsername(username: string) {
    const cleaned = username.trim().toLowerCase();
    const user = Object.values(this.db.users).find(
      u => u.username.trim().toLowerCase() === cleaned
    );
    if (!user) return null;
    return {
      ...user,
      isOnline: !!this.db.presence[user.id]
    };
  }

  public createUser(user: any) {
    this.db.users[user.id] = {
      id: user.id,
      username: user.username,
      passwordHash: user.passwordHash, // simple secure hashed pwd
      avatar: user.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(user.username)}`,
      createdAt: user.createdAt || new Date().toISOString(),
      statusMessage: user.statusMessage || "Available",
      avatarColor: user.avatarColor || "#1F6FEB"
    };
    
    // Add new user to General group automatically
    const general = this.db.groups.find(g => g.id === 'group_general');
    if (general && !general.members.includes(user.id)) {
      general.members.push(user.id);
    }

    this.save();
    return this.getUser(user.id);
  }

  public updateUser(userId: string, updates: Partial<any>) {
    if (!this.db.users[userId]) return null;
    
    // Do not allow updating id or createdAt
    delete updates.id;
    delete updates.createdAt;

    this.db.users[userId] = {
      ...this.db.users[userId],
      ...updates
    };
    
    this.save();
    return this.getUser(userId);
  }

  // MESSAGES OPERATIONS
  public getMessages(query: { userId?: string; otherId?: string; groupId?: string }) {
    const { userId, otherId, groupId } = query;
    
    if (groupId) {
      // Group chat messages
      return this.db.messages.filter(msg => msg.groupId === groupId);
    } else if (userId && otherId) {
      // Direct message messages
      return this.db.messages.filter(
        msg => (msg.senderId === userId && msg.receiverId === otherId) ||
               (msg.senderId === otherId && msg.receiverId === userId)
      );
    }
    return [];
  }

  public createMessage(message: any) {
    const sender = this.getUser(message.senderId);
    const newMsg = {
      id: message.id || `msg_${Math.random().toString(36).substring(2, 11)}`,
      senderId: message.senderId,
      senderName: sender?.username || 'Unknown User',
      senderAvatar: sender?.avatar || '',
      receiverId: message.receiverId,
      groupId: message.groupId,
      
      // Encryption details
      encryptedData: message.encryptedData,
      ephemeralPublicKey: message.ephemeralPublicKey,
      isEncrypted: !!message.isEncrypted,
      
      // Media details
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType || 'text',
      fileName: message.fileName,
      fileSize: message.fileSize,
      duration: message.duration,
      reactions: message.reactions || {},
      
      createdAt: message.createdAt || new Date().toISOString()
    };

    this.db.messages.push(newMsg);
    this.save();
    return newMsg;
  }

  public toggleReaction(messageId: string, userId: string, emoji: string) {
    const msg = this.db.messages.find(m => m.id === messageId);
    if (!msg) return null;
    
    if (!msg.reactions) {
      msg.reactions = {};
    }
    
    const users = msg.reactions[emoji] || [];
    const index = users.indexOf(userId);
    if (index > -1) {
      // Remove reaction
      users.splice(index, 1);
    } else {
      // Add reaction
      users.push(userId);
    }
    
    if (users.length === 0) {
      delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji] = users;
    }
    
    this.save();
    return msg;
  }

  // GROUPS OPERATIONS
  public getGroupsForUser(userId: string) {
    return this.db.groups.filter(g => g.id === 'group_general' || g.members.includes(userId));
  }

  public createGroup(group: any) {
    const newGroup = {
      id: group.id || `group_${Math.random().toString(36).substring(2, 11)}`,
      name: group.name,
      description: group.description || '',
      avatar: group.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(group.name)}`,
      creatorId: group.creatorId,
      members: group.members || [group.creatorId],
      createdAt: new Date().toISOString()
    };

    this.db.groups.push(newGroup);
    this.save();
    return newGroup;
  }

  public joinGroup(groupId: string, userId: string) {
    const group = this.db.groups.find(g => g.id === groupId);
    if (group && !group.members.includes(userId)) {
      group.members.push(userId);
      this.save();
    }
    return group;
  }

  // PREKEYS OPERATIONS (Signal encryption)
  public savePreKeyBundle(userId: string, bundle: any) {
    this.db.preKeys[userId] = {
      userId,
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      oneTimePreKey: bundle.oneTimePreKey
    };
    this.save();
    console.log('[DB] Prekey bundle saved for user:', userId);
  }

  public getPreKeyBundle(userId: string) {
    return this.db.preKeys[userId] || null;
  }

  // PRESENCE TRACKING (Redis cache mock)
  public setUserPresence(userId: string, isOnline: boolean) {
    if (isOnline) {
      this.db.presence[userId] = true;
    } else {
      delete this.db.presence[userId];
    }
    this.save();
  }

  public getPresence(userId: string) {
    return !!this.db.presence[userId];
  }
}

export const db = new LocalDatabase();
export default db;
