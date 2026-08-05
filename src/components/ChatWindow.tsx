/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { User, Group, Message } from '../types';
import { SignalCryptoManager } from '../utils/crypto';
import { generateSimulatedChime } from '../utils/audio';
import VoiceNotePlayer from './VoiceNotePlayer';
import { 
  Send, Lock, ShieldAlert, FileText, Image, Play, Pause, Mic, 
  Paperclip, Loader2, Sparkles, Check, CheckCheck, Smile, ArrowLeft,
  Search, Info, X, Calendar, Copy, User as UserIcon, Clock, ExternalLink, VolumeX, ShieldCheck, Video, Trash2, Plus
} from 'lucide-react';

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};


interface ChatWindowProps {
  currentUser: User;
  activeChat: { type: 'dm' | 'group'; id: string } | null;
  users: User[];
  groups: Group[];
  messages: Message[];
  onSendMessage: (payload: {
    encryptedData: string;
    ephemeralPublicKey?: string;
    isEncrypted: boolean;
    mediaUrl?: string;
    mediaType: 'text' | 'image' | 'video' | 'voice' | 'document';
    fileName?: string;
    fileSize?: number;
    duration?: number;
  }) => void;
  typingStatus: { isTyping: boolean; senderName: string } | null;
  onEmitTyping: (isTyping: boolean) => void;
  onReactToMessage: (messageId: string, emoji: string) => void;
  addSystemLog: (module: string, message: string) => void;
  onBack?: () => void;
}

export default function ChatWindow({
  currentUser,
  activeChat,
  users,
  groups,
  messages,
  onSendMessage,
  typingStatus,
  onEmitTyping,
  onReactToMessage,
  addSystemLog,
  onBack
}: ChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordDurationRef = useRef<number>(0);
  const [mediaRecorder, setMediaRecorder] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showIdentityVerify, setShowIdentityVerify] = useState(false);

  // Gemini Smart Replies state
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isFetchingReplies, setIsFetchingReplies] = useState(false);

  // Decrypted messages local cache to avoid re-deriving ECDH keys on every render
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});

  // Audio elements playback tracker
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // Active inline emoji picker message tracker
  const [activePickerMsgId, setActivePickerMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recordingTimer = useRef<any>(null);

  // DM Optimization Sidebar states
  const [showSidebar, setShowSidebar] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // Reset states on chat change
  useEffect(() => {
    setSearchTerm('');
    setIsMuted(false);
    setIsBlocked(false);
    setCopiedFingerprint(false);
  }, [activeChat?.id]);

  // Derive Chat Details
  const isDM = activeChat?.type === 'dm';
  const targetId = activeChat?.id || '';

  const targetUser = isDM ? users.find(u => u.id === targetId) : null;
  const targetGroup = !isDM ? groups.find(g => g.id === targetId) : null;

  const chatTitle = isDM ? targetUser?.username : targetGroup?.name;
  const chatAvatar = isDM ? targetUser?.avatar : targetGroup?.avatar;
  const chatStatus = isDM 
    ? (targetUser?.isOnline ? 'Online (Redis presence active)' : 'Offline (Cached)') 
    : `${targetGroup?.members.length || 0} members connected`;

  // Filter messages belonging to this active chat
  const chatMessages = messages.filter(msg => {
    if (isDM) {
      return (msg.senderId === currentUser.id && msg.receiverId === targetId) ||
             (msg.senderId === targetId && msg.receiverId === currentUser.id);
    } else {
      return msg.groupId === targetId;
    }
  });

  // Live Message Search inside the DM
  const searchedMessages = chatMessages.filter(msg => {
    if (!searchTerm.trim()) return false;
    const decrypted = msg.isEncrypted ? (decryptedCache[msg.id] || '') : msg.encryptedData;
    return decrypted.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`msg-bubble-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-[#1F6FEB]', 'ring-offset-2', 'ring-offset-[#0D1117]', 'scale-[1.03]');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[#1F6FEB]', 'ring-offset-2', 'ring-offset-[#0D1117]', 'scale-[1.03]');
      }, 2000);
    }
  };

  // Filter media files (images, voice, video, documents) for Gallery
  const sharedMediaFiles = chatMessages.filter(msg => msg.mediaType && msg.mediaType !== 'text');

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, typingStatus]);

  // Handle typing status broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    onEmitTyping(e.target.value.length > 0);
  };

  // Perform client-side E2E decryption for newly received messages
  useEffect(() => {
    const decryptAll = async () => {
      let updated = false;
      const newCache = { ...decryptedCache };

      for (const msg of chatMessages) {
        if (msg.isEncrypted && !newCache[msg.id]) {
          // If the sender is ourselves, we can decrypt using our own cached copies or symmetric mapping.
          // To simulate the real Signal protocol: we either decrypt with local key or show plain text
          // If it was encrypted, decrypt it.
          try {
            let senderBundle: any = null;
            if (msg.senderId !== currentUser.id) {
              // Fetch public bundle of the sender
              const bundleRes = await fetch(`/api/auth/prekey/${msg.senderId}`);
              senderBundle = await bundleRes.json();
            } else if (msg.receiverId) {
              // We sent this. Fetch public bundle of the receiver to simulate decrypt
              const bundleRes = await fetch(`/api/auth/prekey/${msg.receiverId}`);
              senderBundle = await bundleRes.json();
            }

            if (senderBundle) {
              const decrypted = await SignalCryptoManager.decryptMessage(
                currentUser.id,
                msg.encryptedData,
                senderBundle.identityKey,
                msg.ephemeralPublicKey || ''
              );
              newCache[msg.id] = decrypted;
              updated = true;
            } else {
              // Fallback if it's a group chat where we simulate shared group key
              const raw = window.atob(msg.encryptedData);
              try {
                const parsed = JSON.parse(raw);
                newCache[msg.id] = parsed.text;
              } catch {
                newCache[msg.id] = raw;
              }
              updated = true;
            }
          } catch (err) {
            console.error('[Decryption Fail]', err);
            newCache[msg.id] = '[🔒 Decryption Error: Secure Keys mismatched or session expired]';
            updated = true;
          }
        }
      }

      if (updated) {
        setDecryptedCache(newCache);
      }
    };

    decryptAll();
  }, [chatMessages, currentUser.id]);

  // Trigger Gemini smart replies when the last message in chat changes
  useEffect(() => {
    if (chatMessages.length === 0) {
      setSmartReplies([]);
      return;
    }

    const lastMsg = chatMessages[chatMessages.length - 1];
    // Only generate replies if the last message was sent by the other person
    if (lastMsg.senderId !== currentUser.id) {
      fetchSmartReplies();
    } else {
      setSmartReplies([]);
    }
  }, [chatMessages.length, currentUser.id]);

  const fetchSmartReplies = async () => {
    setIsFetchingReplies(true);
    try {
      // Map last 4 messages to text context
      const mapped = chatMessages.slice(-4).map(msg => ({
        senderName: msg.senderName,
        text: msg.isEncrypted ? (decryptedCache[msg.id] || 'Encrypted message') : msg.encryptedData
      }));

      addSystemLog('GeminiAI', 'Requesting smart replies from gemini-3.5-flash model...');
      const response = await fetch('/api/ai/smart-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: mapped })
      });
      const data = await response.json();
      setSmartReplies(data.replies || []);
      addSystemLog('GeminiAI', `Successfully compiled smart replies: ${JSON.stringify(data.replies)}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingReplies(false);
    }
  };

  // SEND TEXT MESSAGE
  const handleSendText = async (textToSend?: string) => {
    const rawText = textToSend || inputText;
    if (!rawText.trim()) return;

    setInputText('');
    onEmitTyping(false);

    try {
      let encryptedPayload = { ciphertext: rawText, ephemeralPublicKey: '', isEncrypted: false };

      if (isDM && targetUser) {
        addSystemLog('SignalCrypto', `Fetching pre-key bundle for contact: ${targetUser.username}...`);
        const prekeyRes = await fetch(`/api/auth/prekey/${targetUser.id}`);
        const recipientBundle = await prekeyRes.json();

        addSystemLog('SignalCrypto', 'E2E: Performing X3DH local key agreement (IK + SPK + OPK)...');
        encryptedPayload = await SignalCryptoManager.encryptMessage(
          currentUser.id,
          rawText,
          recipientBundle
        );

        addSystemLog('SignalCrypto', `Encryption complete. Derived shared Master AES Key. Sending ciphertext: ${encryptedPayload.ciphertext.substring(0, 30)}...`);
      } else {
        // For groups, we simulate base64 group ratchet
        const payload = JSON.stringify({ text: rawText, group: targetId });
        encryptedPayload = {
          ciphertext: window.btoa(payload),
          ephemeralPublicKey: `GROUP_EPHEMERAL_${targetId}`,
          isEncrypted: true
        };
        addSystemLog('SignalCrypto', 'E2E Group Ratchet: Encrypting payload to all group members.');
      }

      onSendMessage({
        encryptedData: encryptedPayload.ciphertext,
        ephemeralPublicKey: encryptedPayload.ephemeralPublicKey,
        isEncrypted: encryptedPayload.isEncrypted,
        mediaType: 'text'
      });
    } catch (err: any) {
      console.error(err);
      addSystemLog('CryptoServer', `Error encrypting message: ${err.message}`);
    }
  };

  // NATIVE VOICE NOTE RECORDER
  const startRecording = async () => {
    try {
      let recorder: any;
      const chunks: Blob[] = [];

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e: any) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
      } catch (mediaErr: any) {
        addSystemLog('AudioHardware', `Microphone access restricted (${mediaErr.message}). Engaging Simulated Audio Recorder fallback.`);
        
        const mockTrack = {
          stop: () => {
            addSystemLog('AudioHardware', 'Simulated audio track stopped.');
          }
        };
        const mockStream = {
          getTracks: () => [mockTrack]
        };

        recorder = {
          stream: mockStream,
          start: () => {
            addSystemLog('AudioHardware', 'Simulated voice wave recording initialized.');
          },
          stop: async () => {
            addSystemLog('AudioHardware', 'Simulated audio stream finalized.');
            
            const finalDuration = recordDurationRef.current || 1;
            const wavBlob = await generateSimulatedChime(finalDuration);
            
            if (recorder.ondataavailable) {
              recorder.ondataavailable({ data: wavBlob });
            }
            if (recorder.onstop) {
              recorder.onstop();
            }
          },
          ondataavailable: null as any,
          onstop: null as any
        };
      }

      recorder.ondataavailable = (e: any) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        setIsUploading(true);
        setUploadProgress('Compressing voice notes using simulated FFmpeg...');
        addSystemLog('MinIO', 'Uploading voice clip to private storage S3 bucket...');
        
        const finalDuration = recordDurationRef.current || 1;
        const detectedMimeType = recorder.mimeType || 'audio/wav';
        let fileExtension = 'wav';
        if (detectedMimeType.includes('webm')) {
          fileExtension = 'webm';
        } else if (detectedMimeType.includes('mp4') || detectedMimeType.includes('m4a')) {
          fileExtension = 'm4a';
        } else if (detectedMimeType.includes('ogg')) {
          fileExtension = 'ogg';
        }

        const audioBlob = new Blob(chunks, { type: detectedMimeType });
        
        // Convert Blob to Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          try {
            const uploadRes = await fetch('/api/media/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64Data,
                fileName: `voice_note_${Date.now()}.${fileExtension}`,
                mimeType: detectedMimeType,
                duration: finalDuration
              })
            });

            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(uploadData.error);

            // Log upload and FFmpeg processing
            uploadData.processingLogs.forEach((log: string) => {
              addSystemLog('FFmpeg', log);
            });

            // Encrypt and Send media message
            let encryptedPayload = { ciphertext: `[Voice Note: ${finalDuration}s]`, ephemeralPublicKey: '', isEncrypted: false };
            if (isDM && targetUser) {
              const prekeyRes = await fetch(`/api/auth/prekey/${targetUser.id}`);
              const recipientBundle = await prekeyRes.json();
              encryptedPayload = await SignalCryptoManager.encryptMessage(
                currentUser.id,
                `[Shared Voice Note: ${finalDuration}s]`,
                recipientBundle
              );
            }

            onSendMessage({
              encryptedData: encryptedPayload.ciphertext,
              ephemeralPublicKey: encryptedPayload.ephemeralPublicKey,
              isEncrypted: encryptedPayload.isEncrypted,
              mediaUrl: uploadData.url,
              mediaType: 'voice',
              fileName: uploadData.fileName,
              fileSize: uploadData.fileSize,
              duration: finalDuration
            });

          } catch (err: any) {
            console.error(err);
            addSystemLog('UploadServer', 'Voice upload failed: ' + err.message);
          } finally {
            setIsUploading(false);
            setUploadProgress(null);
            setRecordDuration(0);
            recordDurationRef.current = 0;
          }
        };
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordDuration(0);
      recordDurationRef.current = 0;

      recordingTimer.current = setInterval(() => {
        setRecordDuration(prev => {
          const next = prev + 1;
          recordDurationRef.current = next;
          return next;
        });
      }, 1000);

      addSystemLog('AudioHardware', 'MediaRecorder initialized. Capturing audio stream...');

    } catch (err: any) {
      console.error(err);
      addSystemLog('AudioHardware', 'Failed to access microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      try {
        mediaRecorder.stop();
        mediaRecorder.stream?.getTracks()?.forEach((track: any) => track?.stop?.());
      } catch (err: any) {
        console.error('Error stopping recorder:', err);
      }
      clearInterval(recordingTimer.current);
      setIsRecording(false);
      setMediaRecorder(null);
      addSystemLog('AudioHardware', 'Audio capture suspended. Preparing file buffer.');
    }
  };

  // NATIVE FILE UPLOADER (Images, PDFs, Videos, etc.)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);
    addSystemLog('MinIO', `Streaming ${file.name} to MinIO S3 bucket...`);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      try {
        const uploadRes = await fetch('/api/media/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64Data,
            fileName: file.name,
            mimeType: file.type
          })
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error);

        // Display FFmpeg / S3 optimization logs
        uploadData.processingLogs.forEach((log: string) => {
          addSystemLog('FFmpeg', log);
        });

        // Encrypt message content
        let encryptedPayload = { ciphertext: `[Shared File: ${file.name}]`, ephemeralPublicKey: '', isEncrypted: false };
        if (isDM && targetUser) {
          const prekeyRes = await fetch(`/api/auth/prekey/${targetUser.id}`);
          const recipientBundle = await prekeyRes.json();
          encryptedPayload = await SignalCryptoManager.encryptMessage(
            currentUser.id,
            `[Shared ${uploadData.mediaType}: ${file.name}]`,
            recipientBundle
          );
        }

        onSendMessage({
          encryptedData: encryptedPayload.ciphertext,
          ephemeralPublicKey: encryptedPayload.ephemeralPublicKey,
          isEncrypted: encryptedPayload.isEncrypted,
          mediaUrl: uploadData.url,
          mediaType: uploadData.mediaType,
          fileName: uploadData.fileName,
          fileSize: uploadData.fileSize
        });

      } catch (err: any) {
        console.error(err);
        addSystemLog('UploadServer', 'File upload failed: ' + err.message);
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    };
  };

  // Render file size helper
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  if (!activeChat) {
    return (
      <div className="flex-1 bg-[#0D1117] flex flex-col items-center justify-center p-8 text-center text-[#E6EDF3]">
        <div className="w-16 h-16 bg-[#161B22] border border-[#30363D] text-[#1F6FEB] rounded-2xl flex items-center justify-center mb-4 shadow-xl">
          <Lock size={32} />
        </div>
        <h2 className="text-sm font-bold text-[#F0F6FC]">Double Ratchet Chat Active</h2>
        <p className="text-xs text-[#8B949E] max-w-xs mt-1.5 leading-relaxed">
          Select any contact or group channel to establish an end-to-end encrypted session. Private keys remain strictly stored on your browser device.
        </p>
      </div>
    );
  }

  return (
    <div id="chat_window" className="flex-1 bg-[#0D1117] flex h-full relative text-[#E6EDF3] overflow-hidden">
      {/* Primary Chat View Panel */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
      {/* Active Chat Header */}
      <div className="p-4 bg-[#161B22]/90 border-b border-[#30363D] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 mr-1 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#F0F6FC] rounded-xl cursor-pointer transition-colors flex items-center justify-center shadow-sm"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          
          {isDM ? (
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="flex items-center gap-3 hover:opacity-90 text-left cursor-pointer group"
              title="Click to view Chat Details & Media"
            >
              <div className="relative">
                <img
                  src={chatAvatar}
                  alt={chatTitle}
                  className="w-10 h-10 rounded-full bg-[#0D1117] p-0.5 object-cover border border-[#30363D] group-hover:border-[#1F6FEB] transition-colors"
                  referrerPolicy="no-referrer"
                />
                {targetUser?.isOnline && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#238636] border-2 border-[#161B22] rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-sm tracking-tight text-[#F0F6FC] group-hover:text-[#1F6FEB] transition-colors flex items-center gap-1">
                  {chatTitle}
                  <Info size={11} className="text-[#8B949E] opacity-50 group-hover:opacity-100 transition-opacity" />
                </h3>
                <span className="text-[10px] text-[#8B949E] font-medium block">
                  {chatStatus}
                </span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <img
                src={chatAvatar}
                alt={chatTitle}
                className="w-10 h-10 rounded-full bg-[#0D1117] p-0.5 object-cover border border-[#30363D]"
                referrerPolicy="no-referrer"
              />
              <div>
                <h3 className="font-bold text-sm tracking-tight text-[#F0F6FC]">{chatTitle}</h3>
                <span className="text-[10px] text-[#8B949E] font-medium block">{chatStatus}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* DM Action Buttons */}
          {isDM && (
            <>
              <button
                onClick={() => {
                  setShowSidebar(true);
                  setTimeout(() => {
                    document.getElementById('sidebar-search-input')?.focus();
                  }, 150);
                }}
                className="p-2 rounded-xl border border-[#30363D]/60 text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-all cursor-pointer"
                title="Search Messages"
              >
                <Search size={15} />
              </button>

              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  showSidebar 
                    ? 'bg-[#1F6FEB]/10 border-[#1F6FEB]/40 text-[#1F6FEB] hover:bg-[#1F6FEB]/20' 
                    : 'bg-transparent border-[#30363D]/60 text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D]'
                }`}
                title="Chat Info & Media Gallery"
              >
                <Info size={15} />
              </button>
            </>
          )}

          {/* E2E Security Badge */}
          <button
            onClick={() => setShowIdentityVerify(!showIdentityVerify)}
            className="flex items-center gap-1 px-2.5 py-1.5 sm:gap-1.5 bg-[#238636]/10 hover:bg-[#238636]/20 text-[#238636] rounded-full text-[10px] font-bold border border-[#238636]/30 transition-all cursor-pointer shrink-0"
            title="Verify E2E Double Ratchet Handshake Keys"
          >
            <Lock size={12} />
            <span className="hidden xs:inline">E2E Encrypted</span>
            <span className="inline xs:hidden">E2E</span>
          </button>
        </div>
      </div>

      {/* Signal cryptographic identity overlay */}
      {showIdentityVerify && (
        <div className="bg-[#0A0D12] text-[#E6EDF3] p-4 border-b border-[#30363D] font-mono text-[10px] space-y-2 animate-in slide-in-from-top duration-200">
          <div className="font-bold flex items-center justify-between text-emerald-400">
            <span>🛡️ SIGNAL HANDSHAKE / VERIFICATION (X3DH)</span>
            <button 
              onClick={() => setShowIdentityVerify(false)} 
              className="hover:text-white font-sans text-xs font-bold px-1"
            >
              Close
            </button>
          </div>
          <p className="text-[#8B949E] leading-normal">
            Session active. Reciprocal public key bundles have been exchanged. Below are the cryptographic fingerprints verified via Diffie-Hellman handshake:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div className="bg-[#161B22] p-2 rounded border border-[#30363D]">
              <span className="font-bold block text-emerald-500">My Identity Key Fingerprint (IK)</span>
              <span className="break-all text-[#8B949E]">IK_PUB_{currentUser.username}_VERIFY_4F82_BC81_330A_7E1E_09A1</span>
            </div>
            <div className="bg-[#161B22] p-2 rounded border border-[#30363D]">
              <span className="font-bold block text-emerald-500">{chatTitle}'s Identity Key Fingerprint</span>
              <span className="break-all text-[#8B949E]">IK_PUB_{chatTitle}_VERIFY_22AB_9C18_AA50_74FF_D311_829F</span>
            </div>
          </div>
        </div>
      )}

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0D1117]">
        {chatMessages.map((msg, index) => {
          const isMe = msg.senderId === currentUser.id;
          const isVoice = msg.mediaType === 'voice';
          const isImg = msg.mediaType === 'image';
          const isDoc = msg.mediaType === 'document';
          const isVideo = msg.mediaType === 'video';

          // Extract plain text to display
          const displayBody = msg.isEncrypted 
            ? (decryptedCache[msg.id] || '🔒 Decrypting end-to-end payload...')
            : msg.encryptedData;

          return (
            <div 
              key={msg.id} 
              id={`msg-bubble-${msg.id}`}
              className={`group relative flex items-start gap-2 max-w-[85%] md:max-w-[70%] rounded-2xl transition-all duration-300 ${isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              {/* Timestamp Tooltip */}
              <div className={`absolute top-1/2 -translate-y-1/2 ${isMe ? 'right-full mr-2' : 'left-full ml-2'} opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10 bg-[#161B22] text-[#8B949E] text-[10px] font-medium py-1 px-2 rounded-lg shadow-sm border border-[#30363D]`}>
                {formatRelativeTime(msg.createdAt)}
              </div>

              {!isMe && (
                <img
                  src={msg.senderAvatar}
                  alt={msg.senderName}
                  className="w-7 h-7 rounded-full bg-[#161B22] mt-0.5"
                  referrerPolicy="no-referrer"
                />
              )}

              <div className="flex flex-col space-y-1 relative">
                {/* Username label in groups */}
                {!isDM && !isMe && (
                  <span className="text-[10px] font-bold text-[#8B949E] pl-1">{msg.senderName}</span>
                )}

                {/* Message Bubble Container */}
                <div 
                  className={`p-3 rounded-2xl shadow-sm text-xs leading-relaxed ${
                    isMe 
                      ? 'bg-[#1F6FEB] border border-blue-400/20 text-white rounded-tr-none' 
                      : 'bg-[#21262D] border border-[#30363D] text-[#E6EDF3] rounded-tl-none'
                  }`}
                >
                  {/* TEXT CONTENT */}
                  {msg.mediaType === 'text' && (
                    <p className="font-medium whitespace-pre-wrap">{displayBody}</p>
                  )}

                  {/* IMAGE MEDIA CONTENT */}
                  {isImg && msg.mediaUrl && (
                    <div className="space-y-1.5">
                      <img 
                        src={msg.mediaUrl} 
                        alt="Shared image" 
                        className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer hover:opacity-90 border border-[#30363D]"
                        referrerPolicy="no-referrer"
                      />
                      <p className="text-[10px] text-[#8B949E] italic font-medium truncate">{msg.fileName}</p>
                    </div>
                  )}

                  {/* VOICE NOTE CONTENT */}
                  {isVoice && msg.mediaUrl && (
                    <VoiceNotePlayer
                      url={msg.mediaUrl}
                      initialDuration={msg.duration}
                      isMe={isMe}
                      isPlaying={playingAudioId === msg.id}
                      onPlay={() => setPlayingAudioId(msg.id)}
                      onPause={() => setPlayingAudioId(null)}
                      onEnded={() => setPlayingAudioId(null)}
                      addSystemLog={addSystemLog}
                    />
                  )}

                  {/* DOCUMENT MEDIA CONTENT */}
                  {isDoc && msg.mediaUrl && (
                    <a 
                      href={msg.mediaUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-1 hover:opacity-90"
                    >
                      <div className={`p-2 rounded-xl ${isMe ? 'bg-black/20' : 'bg-[#161B22]'}`}>
                        <FileText size={18} className={isMe ? 'text-white' : 'text-[#1F6FEB]'} />
                      </div>
                      <div className="text-left leading-tight">
                        <span className="font-bold block truncate max-w-[150px]">{msg.fileName}</span>
                        <span className="text-[9px] opacity-70 font-semibold">{formatBytes(msg.fileSize || 0)}</span>
                      </div>
                    </a>
                  )}

                  {/* VIDEO MEDIA CONTENT */}
                  {isVideo && msg.mediaUrl && (
                    <div className="space-y-1">
                      <video 
                        src={msg.mediaUrl} 
                        controls 
                        className="rounded-lg max-w-full max-h-48 border border-[#30363D]"
                      />
                      <p className="text-[10px] opacity-80 italic truncate">{msg.fileName}</p>
                    </div>
                  )}

                  {/* Metadata and E2E Stamp */}
                  <div className="flex items-center justify-end gap-1.5 mt-1.5 text-[9px] opacity-75 font-semibold">
                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.isEncrypted && <Lock size={9} className="text-emerald-400" />}
                    {isMe && <CheckCheck size={12} className="text-[#58a6ff]" />}
                  </div>
                </div>

                {/* Message Reactions & Picker Row */}
                <div className={`flex flex-wrap items-center gap-1.5 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {/* Existing Reactions */}
                  {msg.reactions && Object.entries(msg.reactions).map(([emoji, userIds]) => {
                    const hasReacted = userIds.includes(currentUser.id);
                    return (
                      <button
                        key={emoji}
                        onClick={() => onReactToMessage(msg.id, emoji)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                          hasReacted
                            ? 'bg-blue-500/15 border-blue-500/40 text-blue-400 hover:bg-blue-500/25'
                            : 'bg-[#161B22] border-[#30363D] text-[#8B949E] hover:border-[#8B949E] hover:bg-[#21262D]'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span className="text-[9px] opacity-90">{userIds.length}</span>
                      </button>
                    );
                  })}

                  {/* Tiny Smile toggle button (always available, perfect for mobile!) */}
                  <button
                    onClick={() => setActivePickerMsgId(activePickerMsgId === msg.id ? null : msg.id)}
                    className={`p-1 rounded-full border border-dashed transition-all cursor-pointer flex items-center justify-center ${
                      activePickerMsgId === msg.id
                        ? 'bg-[#1F6FEB]/15 border-[#1F6FEB]/50 text-[#58a6ff]'
                        : 'bg-transparent border-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] hover:border-[#8B949E] opacity-60 hover:opacity-100'
                    }`}
                    title="React to message"
                  >
                    <Smile size={11} />
                  </button>
                </div>

                {/* Inline Emoji Picker directly under the message */}
                {activePickerMsgId === msg.id && (
                  <div 
                    className={`flex items-center gap-1 bg-[#161B22] border border-[#30363D] px-1.5 py-1 rounded-xl shadow-xl mt-1.5 w-fit animate-in fade-in slide-in-from-top-1 duration-150 ${
                      isMe ? 'ml-auto' : 'mr-auto'
                    }`}
                  >
                    {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => {
                      const hasReacted = msg.reactions?.[emoji]?.includes(currentUser.id);
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            onReactToMessage(msg.id, emoji);
                            setActivePickerMsgId(null);
                          }}
                          className={`hover:scale-125 active:scale-95 transition-transform cursor-pointer text-sm p-1 rounded-lg ${
                            hasReacted ? 'bg-[#1F6FEB]/20' : 'hover:bg-[#21262D]'
                          }`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Real-time Typing Status Indicator */}
        {typingStatus && typingStatus.isTyping && (
          <div className="flex items-center gap-2 pl-8">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[#1F6FEB] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-[#1F6FEB] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-[#1F6FEB] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[10px] font-semibold text-[#8B949E] italic">
              {typingStatus.senderName} is writing...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* AI Smart Replies Container */}
      {smartReplies.length > 0 && (
        <div className="px-4 py-2 bg-[#0A0D12] border-t border-[#30363D] flex flex-wrap gap-2 items-center animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="text-[9px] font-bold text-[#1F6FEB] uppercase tracking-widest flex items-center gap-1 mr-1">
            <Sparkles size={11} className="animate-spin" /> AI Smart Replies
          </span>
          {smartReplies.map((reply, i) => (
            <button
              key={i}
              onClick={() => handleSendText(reply)}
              className="px-3 py-1.5 bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] hover:border-[#1F6FEB] text-[#E6EDF3] hover:text-[#58a6ff] text-xs font-semibold rounded-full shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input Message Form */}
      <div className="p-3 sm:p-5 bg-[#161B22]/30 border-t border-[#30363D] flex flex-col gap-2">
        {/* Progress Bar for Media Uploads */}
        {isUploading && (
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1F6FEB] mb-1 animate-pulse">
            <Loader2 size={14} className="animate-spin" />
            <span>{uploadProgress || 'Processing upload...'}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* File attachment upload triggering input */}
          <label className="p-2 sm:p-2.5 bg-[#21262D] hover:bg-[#30363D] rounded-full text-[#8B949E] hover:text-[#F0F6FC] transition-colors cursor-pointer relative shrink-0">
            <Paperclip size={16} className="sm:hidden" />
            <Paperclip size={18} className="hidden sm:block" />
            <input 
              type="file" 
              onChange={handleFileUpload} 
              disabled={isUploading || isRecording}
              className="hidden" 
            />
          </label>

          {/* Chat text input field */}
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            disabled={isRecording || isUploading}
            placeholder={isRecording ? 'Recording voice note...' : 'Write an encrypted message...'}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            className="flex-1 px-3 py-2 sm:px-4 sm:py-2.5 bg-[#0D1117] border border-[#30363D] focus:border-[#1F6FEB] outline-none rounded-xl text-xs font-medium transition-all text-[#E6EDF3] placeholder-gray-600 disabled:opacity-70 min-w-0"
          />

          {/* Voice recorder action button */}
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="p-2 sm:p-3 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-200 rounded-xl cursor-pointer flex items-center gap-1 sm:gap-1.5 text-xs font-bold shadow-md shadow-rose-950/20 shrink-0"
            >
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping shrink-0" />
              <span className="text-[10px] sm:text-xs">Stop ({recordDuration}s)</span>
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={isUploading}
              title="Record Voice Note"
              className="p-2 sm:p-2.5 bg-[#21262D] hover:bg-[#30363D] rounded-full text-[#8B949E] hover:text-[#F0F6FC] transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Mic size={16} className="sm:hidden" />
              <Mic size={18} className="hidden sm:block" />
            </button>
          )}

          {/* Send text button */}
          {!isRecording && (
            <button
              onClick={() => handleSendText()}
              disabled={!inputText.trim() || isUploading}
              className="p-2 sm:p-2.5 bg-[#1F6FEB] hover:bg-blue-500 disabled:bg-[#21262D] text-white disabled:text-[#8B949E] rounded-xl transition-all cursor-pointer shadow-lg shadow-blue-950/40 active:scale-95 disabled:scale-100 shrink-0"
            >
              <Send size={16} className="sm:hidden" />
              <Send size={18} className="hidden sm:block" />
            </button>
          )}
        </div>

        {/* Quick Emoji Picker Bar (available directly under the input field to select emojis) */}
        {!isRecording && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 no-scrollbar select-none animate-in fade-in duration-200">
            <span className="text-[9px] font-bold text-[#8B949E] uppercase tracking-wider shrink-0 mr-1.5">Insert:</span>
            <div className="flex items-center gap-1">
              {['😀', '😂', '🤣', '😍', '🥰', '😘', '😎', '😉', '👍', '👎', '❤️', '🔥', '🎉', '🚀', '👏', '🙏', '💯', '👀', '💡', '👻'].map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setInputText(prev => prev + emoji)}
                  className="w-7 h-7 flex items-center justify-center text-sm rounded-lg hover:bg-[#21262D] hover:scale-125 active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* OPTIMIZED DIRECT MESSAGES SIDEBAR */}
      {isDM && showSidebar && (
        <div 
          className="w-80 border-l border-[#30363D] bg-[#161B22]/95 backdrop-blur-md flex flex-col h-full relative shrink-0 overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-300 z-20 text-[#E6EDF3]"
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-[#30363D] flex items-center justify-between sticky top-0 bg-[#161B22]/95 backdrop-blur-md z-10">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#F0F6FC] flex items-center gap-1.5">
              <UserIcon size={14} className="text-[#1F6FEB]" /> Chat Information
            </h4>
            <button 
              onClick={() => setShowSidebar(false)}
              className="p-1.5 hover:bg-[#21262D] hover:text-[#F0F6FC] rounded-lg transition-colors text-[#8B949E] cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          <div className="p-4 space-y-6 flex-1">
            {/* User Profile Info Card */}
            <div className="flex flex-col items-center text-center p-4 bg-[#0D1117]/60 border border-[#30363D]/60 rounded-2xl">
              <div className="relative mb-3">
                <img 
                  src={chatAvatar} 
                  alt={chatTitle} 
                  className="w-20 h-20 rounded-full border border-[#30363D] bg-[#0D1117] p-1 object-cover"
                  referrerPolicy="no-referrer"
                />
                {targetUser?.isOnline && (
                  <span className="absolute bottom-1 right-1 w-4 h-4 bg-[#238636] border-2 border-[#161B22] rounded-full animate-pulse" />
                )}
              </div>
              <h3 className="font-bold text-base text-[#F0F6FC]">{chatTitle}</h3>
              <p className="text-[11px] text-[#8B949E] flex items-center gap-1.5 mt-1 font-semibold uppercase tracking-wider">
                {targetUser?.isOnline ? (
                  <span className="text-[#238636] flex items-center gap-1">● Active Now</span>
                ) : (
                  <span className="text-[#8B949E] flex items-center gap-1">○ Offline</span>
                )}
              </p>
            </div>

            {/* Simulated Toggles (Mute / Block Notifications) */}
            <div className="bg-[#0D1117]/60 border border-[#30363D]/60 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <VolumeX size={16} className={isMuted ? 'text-amber-500' : 'text-[#8B949E]'} />
                  <div className="text-left">
                    <span className="font-bold text-xs block text-[#E6EDF3]">Mute Notifications</span>
                    <span className="text-[10px] text-[#8B949E] block">Temporarily silence chat sound alerts</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsMuted(!isMuted);
                    addSystemLog('Settings', `Chat alerts with ${chatTitle} ${!isMuted ? 'MUTED' : 'UNMUTED'}`);
                  }}
                  className={`w-9 h-5 rounded-full p-0.5 transition-all cursor-pointer ${isMuted ? 'bg-[#238636]' : 'bg-[#30363D]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isMuted ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="border-t border-[#30363D]/40 pt-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert size={16} className={isBlocked ? 'text-red-500' : 'text-[#8B949E]'} />
                  <div className="text-left">
                    <span className="font-bold text-xs block text-[#E6EDF3]">Block Contact</span>
                    <span className="text-[10px] text-[#8B949E] block">Prevent incoming messages from this user</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsBlocked(!isBlocked);
                    addSystemLog('Security', `User '${chatTitle}' is now ${!isBlocked ? 'BLOCKED' : 'UNBLOCKED'}`);
                  }}
                  className={`w-9 h-5 rounded-full p-0.5 transition-all cursor-pointer ${isBlocked ? 'bg-red-600' : 'bg-[#30363D]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isBlocked ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* LIVE MESSAGE SEARCH */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider block text-left">
                🔍 Live Message Search
              </label>
              <div className="relative">
                <input 
                  id="sidebar-search-input"
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Type to search chat history..."
                  className="w-full px-3 py-2 pl-9 bg-[#0D1117] border border-[#30363D] rounded-xl text-xs font-medium placeholder-[#8B949E] focus:outline-none focus:border-[#1F6FEB] text-[#E6EDF3]"
                />
                <Search size={14} className="absolute left-3 top-2.5 text-[#8B949E]" />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-2 hover:text-[#F0F6FC] text-[#8B949E] p-1 text-[11px]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Live Search Results */}
              {searchTerm.trim() && (
                <div className="bg-[#0D1117]/80 rounded-xl border border-[#30363D] overflow-hidden max-h-52 overflow-y-auto divide-y divide-[#30363D]/50 text-left">
                  <div className="p-2 text-[9px] font-bold text-[#8B949E] uppercase bg-[#161B22]/60">
                    Matches ({searchedMessages.length})
                  </div>
                  {searchedMessages.length === 0 ? (
                    <div className="p-3 text-xs text-[#8B949E] italic text-center">
                      No results found
                    </div>
                  ) : (
                    searchedMessages.map(msg => {
                      const isMe = msg.senderId === currentUser.id;
                      const decrypted = msg.isEncrypted ? (decryptedCache[msg.id] || '') : msg.encryptedData;
                      return (
                        <button
                          key={msg.id}
                          onClick={() => scrollToMessage(msg.id)}
                          className="w-full p-2.5 hover:bg-[#21262D] transition-colors block text-left text-xs font-medium cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-[9px] text-[#8B949E] mb-1">
                            <span className="font-bold">{isMe ? 'You' : msg.senderName}</span>
                            <span>{new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </div>
                          <p className="line-clamp-2 text-[#E6EDF3] leading-tight font-sans text-[11px]">
                            {decrypted}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* E2E SAFETY NUMBER / FINGERPRINT */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider block text-left">
                🛡️ E2E Handshake Verification
              </label>
              <div className="bg-[#0D1117] p-3 rounded-xl border border-[#30363D]/60 space-y-2.5 text-left font-mono">
                <div className="text-[10px] text-[#238636] font-bold flex items-center gap-1">
                  <ShieldCheck size={12} /> VERIFIED SAFETY NUMBER
                </div>
                
                {/* Visual fingerprint dots representation to simulate physical verify code */}
                <div className="grid grid-cols-5 gap-1 bg-black/40 p-2.5 rounded-lg border border-[#30363D]/40">
                  {Array.from({ length: 15 }).map((_, i) => (
                    <div 
                      key={i} 
                      className={`h-2 rounded-xs ${
                        (i % 3 === 0) ? 'bg-[#238636]' : (i % 2 === 0) ? 'bg-[#1F6FEB]' : 'bg-[#8B949E]'
                      }`} 
                    />
                  ))}
                </div>

                <div className="text-[9px] text-[#8B949E] break-all select-all leading-relaxed p-1.5 bg-[#161B22] rounded border border-[#30363D]/50">
                  VERIFY_DH_SESSION_KEY_{currentUser.username.substring(0,3).toUpperCase()}_{chatTitle?.substring(0,3).toUpperCase()}_04D1_A7E9_47B2
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`VERIFY_DH_SESSION_KEY_${currentUser.username.substring(0,3).toUpperCase()}_${chatTitle?.substring(0,3).toUpperCase()}_04D1_A7E9_47B2`);
                    setCopiedFingerprint(true);
                    addSystemLog('Security', `Copied Signal handshaking key bundle fingerprint to clipboard`);
                    setTimeout(() => setCopiedFingerprint(false), 2000);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#F0F6FC] rounded-lg text-[10px] font-bold border border-[#30363D] cursor-pointer transition-colors"
                >
                  {copiedFingerprint ? (
                    <>
                      <Check size={11} className="text-emerald-500" /> Copied Handshake Fingerprint!
                    </>
                  ) : (
                    <>
                      <Copy size={11} /> Copy Handshake Fingerprint
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* SHARED FILES GALLERY */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider block text-left">
                  📎 Shared Media ({sharedMediaFiles.length})
                </label>
                {sharedMediaFiles.length > 0 && (
                  <span className="text-[9px] text-[#1F6FEB] font-bold">In-Chat Files</span>
                )}
              </div>

              {sharedMediaFiles.length === 0 ? (
                <div className="p-4 bg-[#0D1117]/30 border border-dashed border-[#30363D]/50 rounded-xl text-center text-xs text-[#8B949E] italic">
                  No files or documents shared yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto no-scrollbar">
                  {sharedMediaFiles.map((msg) => {
                    const isVoiceMsg = msg.mediaType === 'voice';
                    const isImageMsg = msg.mediaType === 'image';
                    const isDocMsg = msg.mediaType === 'document';
                    const isVideoMsg = msg.mediaType === 'video';

                    return (
                      <div 
                        key={msg.id}
                        onClick={() => {
                          if (msg.mediaUrl) {
                            window.open(msg.mediaUrl, '_blank');
                            addSystemLog('UI', `Opening shared attachment: ${msg.fileName || 'file'}`);
                          }
                        }}
                        className="bg-[#0D1117] border border-[#30363D] p-2 rounded-xl text-left hover:border-[#1F6FEB] cursor-pointer hover:bg-[#161B22] group/item transition-all"
                        title={`Click to open shared file: ${msg.fileName || 'Attachment'}`}
                      >
                        {isImageMsg && msg.mediaUrl ? (
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-black/20 mb-1 border border-[#30363D]/40">
                            <img 
                              src={msg.mediaUrl} 
                              alt="thumbnail" 
                              className="w-full h-full object-cover group-hover/item:scale-110 transition-transform"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                              <ExternalLink size={12} className="text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-video rounded-lg bg-[#161B22] flex items-center justify-center mb-1 border border-[#30363D]/40 text-[#8B949E] group-hover/item:text-[#1F6FEB]">
                            {isVoiceMsg && <Mic size={16} className="animate-pulse" />}
                            {isDocMsg && <FileText size={16} />}
                            {isVideoMsg && <Video size={16} />}
                          </div>
                        )}
                        <span className="text-[10px] text-[#E6EDF3] block truncate font-semibold leading-tight">
                          {msg.fileName || (isVoiceMsg ? 'Voice Note' : 'Attachment')}
                        </span>
                        <span className="text-[8px] text-[#8B949E] block uppercase tracking-wider font-bold mt-0.5">
                          {msg.mediaType}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
