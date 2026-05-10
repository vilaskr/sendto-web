/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Clipboard, 
  Plus, 
  ArrowRight, 
  Send, 
  File, 
  Link as LinkIcon, 
  LogOut, 
  Copy, 
  CheckCircle2, 
  Info,
  AlertCircle,
  Hash,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// Types
interface Message {
  id: string;
  type: 'text' | 'link' | 'file';
  content: string;
  name?: string;
  size?: number;
  timestamp: number;
  isMe?: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const SOCKET_URL = window.location.origin;

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [usersCount, setUsersCount] = useState(0);
  const [inputMessage, setInputMessage] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast Helper
  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setIsConnected(false);
      addToast('Connection error. Retrying...', 'error');
    });

    newSocket.on('room_created', (code: string) => {
      setRoomCode(code);
      setUsersCount(1);
      addToast(`Room ${code} created!`, 'success');
      setIsConnecting(false);
    });

    newSocket.on('room_joined', (code: string) => {
      setRoomCode(code);
      setUsersCount(2); 
      addToast(`Joined room ${code}`, 'success');
      setIsConnecting(false);
    });

    newSocket.on('receive_message', (data: Message) => {
      setMessages((prev) => [...prev, { ...data, isMe: false }]);
      addToast(`New ${data.type} received!`, 'info');
    });

    newSocket.on('user_joined', () => {
      setUsersCount((prev) => prev + 1);
      addToast('Another device joined!', 'info');
    });

    newSocket.on('user_left', () => {
      setUsersCount((prev) => Math.max(1, prev - 1));
      addToast('A device disconnected', 'info');
    });

    newSocket.on('room_expired', () => {
      setRoomCode(null);
      setMessages([]);
      addToast('Room expired due to inactivity', 'error');
    });

    newSocket.on('error_message', (msg: string) => {
      addToast(msg, 'error');
      setIsConnecting(false);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleCreateRoom = () => {
    if (!socket) return;
    setIsConnecting(true);
    socket.emit('create_room');
  };

  const handleJoinRoom = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!socket || !joinCode) return;
    setIsConnecting(true);
    socket.emit('join_room', joinCode);
  };

  const sendMessage = (type: Message['type'], content: string, name?: string, size?: number) => {
    if (!socket || !roomCode) return;
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content,
      name,
      size,
      timestamp: Date.now(),
      isMe: true
    };
    setMessages((prev) => [...prev, newMessage]);
    socket.emit('send_message', newMessage);
    setInputMessage('');
  };

  const handleTextSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim()) return;
    
    // Check if it's a URL
    const isUrl = /^https?:\/\/\w+/.test(inputMessage.trim());
    sendMessage(isUrl ? 'link' : 'text', inputMessage.trim());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      addToast('File too large (max 10MB)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadstart = () => setUploadProgress(0);
    reader.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    reader.onload = () => {
      const base64 = reader.result as string;
      sendMessage('file', base64, file.name, file.size);
      setUploadProgress(null);
      addToast('File sent!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (!navigator.clipboard) throw new Error('No clipboard API');
      await navigator.clipboard.writeText(text);
      addToast('Copied to clipboard!', 'success');
    } catch (err) {
      console.error('Clipboard copy error:', err);
      // Fallback: suggest manual copy if in iframe
      addToast('Copy blocked by browser. Try selecting text manually.', 'error');
    }
  };

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard) throw new Error('No clipboard API');
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputMessage(text);
        addToast('Pasted from clipboard', 'info');
      } else {
        addToast('Clipboard is empty', 'info');
      }
    } catch (err) {
      console.error('Clipboard paste error:', err);
      addToast('Paste blocked. Please type or paste manually.', 'error');
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const leaveRoom = () => {
    setRoomCode(null);
    setMessages([]);
    setJoinCode('');
    addToast('Left the room', 'info');
    // Socket automatically handles leaving in discord message
  };

  return (
    <div className="min-h-screen selection:bg-brand-red selection:text-white p-4 md:p-8 flex flex-col">
      {/* Toast System */}
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ y: -50, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.8 }}
              className={cn(
                "p-4 rounded-xl border-4 border-black font-bold flex items-center gap-3 shadow-[4px_4px_0_#000] bg-white",
                toast.type === 'success' && "bg-green-100",
                toast.type === 'error' && "bg-red-100",
                toast.type === 'info' && "bg-blue-100"
              )}
            >
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-blue-600" />}
              <span className="flex-1">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <header className="max-w-4xl mx-auto w-full mb-12 flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-6xl md:text-8xl tracking-tighter leading-none border-b-8 border-black pb-2 inline-block">
            SENDTO
          </h1>
          <p className="font-display font-medium text-xl md:text-2xl mt-4 opacity-70">
            Send anything to your other device instantly.
          </p>
        </div>
        {roomCode && (
          <button 
            onClick={leaveRoom}
            className="brutal-button bg-brand-red text-white h-fit hidden md:flex"
          >
            <LogOut className="w-5 h-5" />
            DISCONNECT
          </button>
        )}
      </header>

      <main className="max-w-4xl mx-auto w-full flex-1 flex flex-col gap-8">
        {!roomCode ? (
          /* Landing Screen */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {/* Create Room Card */}
            <motion.div 
              whileHover={{ y: -8 }}
              className="brutal-card bg-brand-yellow flex flex-col justify-between h-full"
            >
              <div>
                <div className="bg-black text-white p-3 rounded-lg w-fit mb-6">
                  <Plus className="w-8 h-8" />
                </div>
                <h2 className="text-4xl mb-4">CREATE ROOM</h2>
                <p className="text-lg opacity-80 mb-8 leading-relaxed">
                  Start a new session and get a unique 4-digit code to connect another device.
                </p>
              </div>
              <button 
                onClick={handleCreateRoom}
                disabled={isConnecting || !isConnected}
                className="brutal-button w-full text-2xl py-6 bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!isConnected ? "CONNECTING TO SERVER..." : isConnecting ? "GENERATING..." : "GET START CODE"}
                {isConnected && <ArrowRight className="ml-2 w-6 h-6" />}
              </button>
            </motion.div>

            {/* Join Room Card */}
            <motion.div 
              whileHover={{ y: -8 }}
              className="brutal-card bg-brand-cream flex flex-col justify-between h-full"
            >
              <div>
                <div className="bg-black text-white p-3 rounded-lg w-fit mb-6">
                  <ArrowRight className="w-8 h-8" />
                </div>
                <h2 className="text-4xl mb-4">JOIN ROOM</h2>
                <p className="text-lg opacity-80 mb-8 leading-relaxed">
                  Enter the 4-digit code shown on your other device to start transferring.
                </p>
              </div>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <input 
                  type="text"
                  maxLength={4}
                  placeholder="CODE (e.g. 1234)"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={!isConnected}
                  className="brutal-input text-center tracking-[0.5em] text-3xl placeholder:text-black/20 disabled:opacity-50"
                />
                <button 
                  type="submit"
                  disabled={isConnecting || joinCode.length < 4 || !isConnected}
                  className="brutal-button w-full text-2xl py-6 bg-black text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!isConnected ? "OFFLINE" : isConnecting ? "CONNECTING..." : "JOIN SESSION"}
                </button>
              </form>
            </motion.div>
          </div>
        ) : (
          /* Transfer Interface */
          <div className="flex flex-col gap-6 flex-1">
            {/* Room Header Info */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="brutal-card py-2 px-6 flex items-center gap-3 bg-brand-yellow">
                  <Hash className="w-5 h-5" />
                  <span className="text-3xl font-display font-bold">{roomCode}</span>
                </div>
                <div className="brutal-card py-2 px-4 bg-white flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full animate-pulse", usersCount < 2 ? "bg-orange-500" : "bg-green-500")} />
                  <span className="font-bold">{usersCount < 2 ? "WAITING FOR DEVICE..." : "LINKED"}</span>
                </div>
              </div>
              <button 
                onClick={leaveRoom}
                className="brutal-button bg-brand-red text-white md:hidden w-full"
              >
                <LogOut className="w-5 h-5" />
                LEAVE
              </button>
            </div>

            {/* Main Area */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
              {/* Timeline (Left/Center) */}
              <div className="md:col-span-2 flex flex-col min-h-0 h-[600px] md:h-auto">
                <div className="brutal-card flex-1 overflow-y-auto mb-4 bg-white/50 space-y-4 p-4 scroll-smooth">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center p-8">
                      <div className="bg-black p-4 rounded-full mb-4">
                        <ArrowRight className="w-12 h-12 text-white -rotate-45" />
                      </div>
                      <p className="text-2xl font-display font-bold">READY TO RECEIVE</p>
                      <p>Send text or files from your other device.</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <motion.div
                        initial={{ opacity: 0, x: msg.isMe ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={msg.id}
                        className={cn(
                          "flex flex-col max-w-[85%]",
                          msg.isMe ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                      >
                        <div className={cn(
                          "brutal-card p-4 rounded-2xl",
                          msg.isMe ? "bg-black text-white shadow-[-4px_4px_0_#999]" : "bg-white shadow-[4px_4px_0_#000]"
                        )}>
                          {msg.type === 'text' && (
                            <p className="text-lg whitespace-pre-wrap break-words">{msg.content}</p>
                          )}
                          {msg.type === 'link' && (
                            <a href={msg.content} target="_blank" rel="noreferrer" className="flex items-center gap-3 underline break-all group">
                              <LinkIcon className="w-5 h-5 shrink-0" />
                              <span className="text-lg font-bold">{msg.content}</span>
                            </a>
                          )}
                          {msg.type === 'file' && (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-3">
                                <div className={cn("p-2 rounded-lg", msg.isMe ? "bg-white/20" : "bg-black/5")}>
                                  <File className="w-6 h-6" />
                                </div>
                                <div>
                                  <p className="font-bold leading-none mb-1 max-w-[150px] md:max-w-[250px] truncate">{msg.name}</p>
                                  <p className="text-xs opacity-60 font-mono">{formatSize(msg.size)}</p>
                                </div>
                              </div>
                              {!msg.isMe && (
                                <a 
                                  href={msg.content} 
                                  download={msg.name}
                                  className={cn(
                                    "brutal-button py-2 text-sm",
                                    msg.isMe ? "bg-white text-black" : "bg-black text-white"
                                  )}
                                >
                                  <Download className="w-4 h-4" />
                                  DOWNLOAD
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 px-2 opacity-50 text-[10px] uppercase font-bold tracking-widest">
                          <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <button 
                            onClick={() => msg.type !== 'file' ? copyToClipboard(msg.content) : null}
                            className="hover:text-brand-red transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <form onSubmit={handleTextSend}>
                      <input 
                        type="text"
                        placeholder="ENTER TEXT OR URL..."
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        className="brutal-input pr-16"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                         <button 
                          type="button"
                          onClick={pasteFromClipboard}
                          className="p-2 hover:bg-black/5 rounded-lg transition-colors"
                          title="Paste from clipboard"
                        >
                          <Clipboard className="w-6 h-6" />
                        </button>
                        <button 
                          type="submit"
                          className="bg-black text-white p-2 rounded-lg hover:bg-brand-red transition-colors"
                        >
                          <Send className="w-6 h-6" />
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              {/* Upload Panel (Right) */}
              <div className="flex flex-col gap-6 h-full">
                <div 
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-black/5'); }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('bg-black/5'); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('bg-black/5');
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const event = { target: { files: [file] } } as any;
                      handleFileUpload(event);
                    }
                  }}
                  className="brutal-card border-dashed flex-1 flex flex-col items-center justify-center text-center p-8 cursor-pointer hover:border-brand-red transition-colors group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="bg-black text-white p-4 rounded-xl mb-6 group-hover:scale-110 transition-transform shadow-[4px_4px_0_#999]">
                    <Plus className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl mb-2">DRAG & DROP</h3>
                  <p className="opacity-60 text-sm">Or click to browse files up to 10MB</p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                  
                  {uploadProgress !== null && (
                    <div className="w-full mt-8 animate-in fade-in slide-in-from-bottom-4">
                      <div className="flex justify-between font-bold text-xs uppercase mb-2">
                        <span>SENDING...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-4 border-2 border-black rounded-full overflow-hidden bg-gray-100">
                        <motion.div 
                          className="h-full bg-brand-red"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="brutal-card bg-brand-cream border-brand-red/20">
                  <h4 className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-brand-red" />
                    TIPS
                  </h4>
                  <ul className="text-sm space-y-2 font-medium opacity-80">
                    <li>• Codes expire in 30 mins</li>
                    <li>• No cloud storage at all</li>
                    <li>• Text is encrypted in transit</li>
                    <li>• Direct device-to-device feel</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto w-full mt-12 py-8 border-t-4 border-black flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="font-display font-bold text-xl uppercase tracking-widest">
          No login. No cloud. Just send.
        </p>
        <div className="flex items-center gap-6">
          <a href="#" className="font-bold hover:text-brand-red">GUIDE</a>
          <a href="#" className="font-bold hover:text-brand-red">API</a>
          <a href="#" className="font-bold hover:text-brand-red">OSS</a>
        </div>
      </footer>
    </div>
  );
}
