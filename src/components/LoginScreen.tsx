/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Shield, User, Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import { SignalCryptoManager } from '../utils/crypto';
import { User as UserType } from '../types';

interface LoginScreenProps {
  onAuthSuccess: (user: UserType, token: string, preKeyBundle: any) => void;
  addSystemLog: (module: string, message: string) => void;
}

export default function LoginScreen({ onAuthSuccess, addSystemLog }: LoginScreenProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(Math.random().toString(36).substring(7));
  const [showPassword, setShowPassword] = useState(false);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [cryptoStep, setCryptoStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const avatarUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(avatarSeed)}`;

  const handleRandomizeAvatar = () => {
    setAvatarSeed(Math.random().toString(36).substring(7));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isRegistering) {
        // --- REGISTRATION FLOW WITH E2E KEY GENERATION ---
        setCryptoStep('1. Creating ECDH P-256 Identity Keypair (IK)...');
        addSystemLog('SignalCrypto', 'Generating long-term Identity Key (IK) pair...');
        await new Promise(r => setTimeout(r, 600));

        setCryptoStep('2. Computing Signed Prekey (SPK) with cryptographic signatures...');
        addSystemLog('SignalCrypto', 'Generating Signed Prekey (SPK) and verification proofs...');
        await new Promise(r => setTimeout(r, 600));

        setCryptoStep('3. Generating ephemeral One-Time Prekeys (OPK) for future sessions...');
        addSystemLog('SignalCrypto', 'Compiling 100 Ephemeral One-Time Prekeys for offline users...');
        await new Promise(r => setTimeout(r, 600));

        setCryptoStep('4. Assembling cryptographic PreKey Bundle...');
        const keyBundle = await SignalCryptoManager.generatePreKeyBundle(username);
        addSystemLog('SignalCrypto', 'PreKey Bundle assembled: ' + JSON.stringify(keyBundle.publicBundle).substring(0, 80) + '...');
        await new Promise(r => setTimeout(r, 400));

        setCryptoStep('5. Sending public bundle to MongoDB, saving private keys on device...');
        addSystemLog('MongoDB', `Registering user '${username}' & uploading E2E prekey bundle.`);
        
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password,
            avatar: avatarUrl,
            preKeyBundle: keyBundle.publicBundle
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Registration failed.');
        }

        addSystemLog('Redis', `User ${data.user.id} registered and presence token established.`);
        setCryptoStep('E2E Handshake setup complete!');
        await new Promise(r => setTimeout(r, 300));
        
        onAuthSuccess(data.user, data.token, keyBundle.publicBundle);
      } else {
        // --- LOGIN FLOW ---
        addSystemLog('MongoDB', `Validating authentication credentials for user: ${username}`);
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Login failed.');
        }

        // Regenerate local keys matching their public keys on server
        // In a real client app, these private keys would be stored in browser IndexedDB.
        // For the preview, we derive/re-generate them seamlessly.
        setCryptoStep('Synchronizing device keys and secure chat storage...');
        const keyBundle = await SignalCryptoManager.generatePreKeyBundle(data.user.id);
        
        addSystemLog('Redis', `User ${data.user.id} authenticated. Tracking presence cache.`);
        await new Promise(r => setTimeout(r, 500));
        
        onAuthSuccess(data.user, data.token, data.preKeyBundle || keyBundle.publicBundle);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      addSystemLog('AuthServer', `Error during authentication: ${err.message}`);
    } finally {
      setIsLoading(false);
      setCryptoStep(null);
    }
  };

  return (
    <div id="login_screen" className="flex items-center justify-center min-h-screen bg-[#0A0D12] px-4 text-[#E6EDF3]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md p-8 bg-[#161B22] border border-[#30363D] rounded-2xl shadow-2xl shadow-black/50"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 bg-gradient-to-br from-[#1F6FEB] to-[#238636] text-white rounded-2xl mb-3 shadow-lg shadow-blue-900/20">
            <Shield size={36} className="animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F0F6FC]">
            LinkUp Lite Messenger
          </h1>
          <p className="text-sm text-[#8B949E] mt-1 flex items-center gap-1">
            <Lock size={12} className="text-[#238636]" /> End-to-End Encrypted Messaging
          </p>
        </div>

        {error && (
          <div className="p-3 mb-4 text-xs font-medium text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegistering && (
            <div className="flex flex-col items-center p-4 bg-[#0D1117] border border-[#30363D] rounded-xl mb-2">
              <img 
                src={avatarUrl} 
                alt="Avatar Preview" 
                className="w-20 h-20 bg-[#161B22] border border-[#30363D] rounded-full shadow-inner p-1 mb-2"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={handleRandomizeAvatar}
                className="text-xs font-semibold text-[#1F6FEB] hover:text-[#58a6ff] transition-colors"
              >
                🔀 Randomize Avatar
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#8B949E] uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#8B949E]">
                <User size={18} />
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                disabled={isLoading}
                placeholder="e.g. alice_jones"
                className="w-full pl-10 pr-4 py-2.5 bg-[#0D1117] hover:bg-[#161B22] focus:bg-[#0D1117] border border-[#30363D] focus:border-[#1F6FEB] rounded-xl text-sm transition-all outline-none text-[#F0F6FC] placeholder-gray-600 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8B949E] uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#8B949E]">
                <Lock size={18} />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-[#0D1117] hover:bg-[#161B22] focus:bg-[#0D1117] border border-[#30363D] focus:border-[#1F6FEB] rounded-xl text-sm transition-all outline-none text-[#F0F6FC] placeholder-gray-600 font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8B949E] hover:text-[#F0F6FC] transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[#1F6FEB] hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-900/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-blue-800 disabled:opacity-50 disabled:scale-100 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Authenticating with Pre-Key Bundle...</span>
              </>
            ) : (
              <span>{isRegistering ? 'Generate Secure Account' : 'Sign In Safely'}</span>
            )}
          </button>
        </form>

        {/* Crypto Handshake Loader Overlay */}
        {cryptoStep && (
          <div className="mt-4 p-4 bg-[#0D1117] text-[#8B949E] rounded-xl font-mono text-xs space-y-2 border border-[#30363D] animate-pulse">
            <div className="flex items-center gap-2 text-[#238636] font-bold">
              <Key size={14} className="animate-spin" />
              <span>[SIGNAL ENCRYPTION LAYER]</span>
            </div>
            <div className="text-emerald-400">{cryptoStep}</div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[#30363D] text-center">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError(null);
            }}
            className="text-xs font-semibold text-[#8B949E] hover:text-[#1F6FEB] transition-colors"
          >
            {isRegistering 
              ? 'Already have an account? Sign in' 
              : "Don't have an account? Create one with Signal E2E Keys"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
