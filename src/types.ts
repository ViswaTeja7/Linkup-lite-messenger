/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  username: string; // Used as display name
  avatar: string;
  createdAt: string;
  isOnline?: boolean;
  statusMessage?: string;
  avatarColor?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  avatar: string;
  creatorId: string;
  members: string[]; // List of user IDs
  createdAt: string;
}

export type MediaType = 'text' | 'image' | 'video' | 'voice' | 'document';

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  receiverId?: string; // Present for 1-to-1 chats
  groupId?: string;    // Present for group chats
  
  // E2E Encryption Fields
  encryptedData: string;         // Base64 encrypted payload
  ephemeralPublicKey?: string;   // Base64 EK_sender public key (used for E2E decryption)
  isEncrypted: boolean;          // Flag to indicate if message is end-to-end encrypted
  
  // Media Sharing Fields
  mediaUrl?: string;             // S3/MinIO simulated upload URL
  mediaType: MediaType;
  fileName?: string;
  fileSize?: number;
  duration?: number;             // Audio duration for voice notes
  reactions?: Record<string, string[]>; // Map of emoji to user IDs who reacted
  
  createdAt: string;
}

// Signal protocol prekey bundle structure
export interface PreKeyBundle {
  userId: string;
  identityKey: string;      // Base64 public key
  signedPreKey: string;     // Base64 public key
  oneTimePreKey?: string;   // Base64 public key
}

// Encrypted Local Device Keys (Saved in browser's local storage for each user)
export interface DeviceKeypair {
  privateKey: any; // CryptoKey objects or string representation
  publicKey: string; // Base64 public key
}

export interface UserKeys {
  identityKeypair: DeviceKeypair;
  signedPreKeypair: DeviceKeypair;
  oneTimePreKeypairs: Record<string, DeviceKeypair>;
}
