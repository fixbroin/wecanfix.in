
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Paperclip, UserCircle, MessageSquareText, XIcon, Loader2 } from 'lucide-react';
import type { ChatMessage, ChatSession, FirestoreNotification, GlobalWebSettings } from '@/types/firestore';
import { Timestamp, doc, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, setDoc, serverTimestamp, getDoc, getDocs, limit } from "firebase/firestore";
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { chatWithAgent, type ChatHistoryItem } from '@/ai/flows/chatWithAgentFlow';

interface ChatWindowProps {
  onClose: () => void;
}

const ADMIN_FALLBACK_NAME = "Support";
const ADMIN_FALLBACK_AVATAR_INITIAL = "S";

// Function to find URLs in text and wrap them in anchor tags
const linkify = (text: string) => {
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, (url) => {
        const fullUrl = url.startsWith('www.') ? `http://${url}` : url;
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">${url}</a>`;
    });
};


export default function ChatWindow({ onClose }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const scrollAreaRootRef = useRef<HTMLDivElement>(null);
  const { user: currentUser } = useAuth();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [adminProfile, setAdminProfile] = useState<{displayName?: string | null, photoURL?: string | null, uid?: string | null}>({
    displayName: ADMIN_FALLBACK_NAME,
    photoURL: null,
    uid: null,
  });
  const [isLoadingAdminProfile, setIsLoadingAdminProfile] = useState(true);

  useEffect(() => {
    if (globalSettings?.chatNotificationSoundUrl) {
      audioRef.current = new Audio(globalSettings.chatNotificationSoundUrl);
      audioRef.current.load();
    } else {
      audioRef.current = null;
    }
  }, [globalSettings?.chatNotificationSoundUrl]);


  const getChatSessionId = useCallback((userId1: string, userId2: string): string => {
    return [userId1, userId2].sort().join('_');
  }, []);

  const chatSessionId = currentUser && adminProfile.uid ? getChatSessionId(currentUser.uid, adminProfile.uid) : null;

  useEffect(() => {
    const fetchAdminProfile = async () => {
        setIsLoadingAdminProfile(true);
      if (globalSettings?.adminUserUidForChat) {
         const adminDocSnap = await getDoc(doc(db, "users", globalSettings.adminUserUidForChat));
         if (adminDocSnap.exists()) {
            const adminData = adminDocSnap.data();
            setAdminProfile({ displayName: adminData.displayName, photoURL: adminData.photoURL, uid: adminDocSnap.id });
            setIsLoadingAdminProfile(false);
            return;
         }
      }
      const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
      const adminSnapshot = await getDocs(adminQuery);
      if (!adminSnapshot.empty) {
        const adminData = adminSnapshot.docs[0].data();
        const adminUid = adminSnapshot.docs[0].id;
        setAdminProfile({ displayName: adminData.displayName || null, photoURL: adminData.photoURL || null, uid: adminUid });
      } else {
        setAdminProfile({ displayName: ADMIN_FALLBACK_NAME, photoURL: null, uid: 'admin_master_id' });
      }
      setIsLoadingAdminProfile(false);
    };

    if (!isLoadingGlobalSettings) {
        fetchAdminProfile();
    }
  }, [globalSettings, isLoadingGlobalSettings]);


  useEffect(() => {
    if (!currentUser || !chatSessionId || !adminProfile.uid || isLoadingAdminProfile) {
      if(!isLoadingAdminProfile && !adminProfile.uid) setIsLoadingMessages(false);
      return;
    }
    setIsLoadingMessages(true);
    const messagesRef = collection(db, 'chats', chatSessionId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    let soundPlayedThisSnapshot = false;

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      soundPlayedThisSnapshot = false;
      const fetchedMessages = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ChatMessage));
      
      let newAdminMessageReceived = false;
      for (const msg of fetchedMessages) {
        if (msg.senderType === 'admin' && !msg.isReadByUser && msg.id) {
          newAdminMessageReceived = true;
          break; 
        }
      }

      setMessages(fetchedMessages);
      setIsLoadingMessages(false);

      for (const msg of fetchedMessages) {
        if (msg.senderType === 'admin' && !msg.isReadByUser && msg.id) {
          const msgRef = doc(db, 'chats', chatSessionId, 'messages', msg.id);
          await updateDoc(msgRef, { isReadByUser: true });
        }
      }

      if (newAdminMessageReceived && audioRef.current) {
        audioRef.current.play().catch(e => console.warn("ChatWindow: Audio play failed:", e));
      }
      
      const sessionDocRef = doc(db, 'chats', chatSessionId);
      const sessionSnap = await getDoc(sessionDocRef);
      if (sessionSnap.exists()) {
        await updateDoc(sessionDocRef, { userUnreadCount: 0, updatedAt: serverTimestamp() });
      } else if (currentUser && adminProfile.uid) {
        await setDoc(sessionDocRef, {
            userId: currentUser.uid,
            adminId: adminProfile.uid,
            userUnreadCount: 0,
            aiAgentActive: true, 
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            participants: [currentUser.uid, adminProfile.uid].filter(Boolean),
        }, { merge: true });
      }

    }, (error) => {
      console.error(`ChatWindow: Error fetching messages for session ${chatSessionId}:`, error);
      setIsLoadingMessages(false);
    });

    return () => {
        unsubscribe();
    };
  }, [currentUser, chatSessionId, adminProfile.uid, isLoadingAdminProfile]);

  useEffect(() => {
    if (scrollAreaRootRef.current) {
      const viewport = scrollAreaRootRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, isLoadingMessages, isAiTyping]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !chatSessionId || !adminProfile.uid) {
        return;
    }

    const messageData: Omit<ChatMessage, 'id'> = {
      chatSessionId: chatSessionId,
      senderId: currentUser.uid,
      senderType: 'user',
      text: newMessage,
      timestamp: Timestamp.now(),
      isReadByAdmin: false,
    };

    const tempNewMessage = newMessage;
    setNewMessage('');
    
    try {
      const messagesRef = collection(db, 'chats', chatSessionId, 'messages');
      await addDoc(messagesRef, messageData);

      const sessionDocRef = doc(db, 'chats', chatSessionId);
      const sessionSnap = await getDoc(sessionDocRef);
      const currentSessionData = sessionSnap.exists() ? sessionSnap.data() as ChatSession : undefined;
      const currentAdminUnreadCount = currentSessionData?.adminUnreadCount || 0;
      
      const isGlobalAiEnabled = globalSettings?.isAiChatBotEnabled ?? false;

      await setDoc(sessionDocRef, {
        userId: currentUser.uid,
        userName: currentUser.displayName || null,
        userPhotoUrl: currentUser.photoURL || null,
        adminId: adminProfile.uid,
        adminName: adminProfile.displayName || null,
        adminPhotoUrl: adminProfile.photoURL || null,
        lastMessageText: tempNewMessage.substring(0, 50),
        lastMessageTimestamp: messageData.timestamp,
        lastMessageSenderId: currentUser.uid,
        participants: [currentUser.uid, adminProfile.uid].filter(p => p !== null && p !== undefined),
        userUnreadCount: 0,
        adminUnreadCount: currentAdminUnreadCount + 1,
        updatedAt: messageData.timestamp,
        ...(currentSessionData ? {} : { createdAt: messageData.timestamp })
      }, { merge: true });
      
      if (adminProfile.uid && adminProfile.uid !== 'fallback_admin_uid' && adminProfile.uid !== 'admin_master_id') {
        const adminNotificationData: FirestoreNotification = {
          userId: adminProfile.uid,
          title: `New Chat Message from ${currentUser.displayName || currentUser.email}`,
          message: `User ${currentUser.displayName || currentUser.email} sent: "${tempNewMessage.substring(0, 30)}${tempNewMessage.length > 30 ? "..." : ""}"`,
          type: 'admin_alert',
          href: '/admin/chat',
          read: false,
          createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, "userNotifications"), adminNotificationData);
      }
      
      if (isGlobalAiEnabled) {
        setIsAiTyping(true);
        // Correctly format history for the AI
        const MAX_HISTORY = 16;
const trimmed = messages.slice(-MAX_HISTORY);

const historyForAi: ChatHistoryItem[] = trimmed.map(msg => ({
  role: msg.senderType === 'user' ? 'user' : 'model',
  content: [{ text: msg.text || '' }]
}));

        const aiResponse = await chatWithAgent({
  history: historyForAi,
  message: tempNewMessage,
  userId: currentUser.uid, // VERY IMPORTANT
});
        setIsAiTyping(false);

        const aiMessageData: Omit<ChatMessage, 'id'> = {
          chatSessionId: chatSessionId,
          senderId: 'ai_agent',
          senderType: 'ai',
          text: aiResponse.response,
          timestamp: Timestamp.now(),
          isReadByUser: false,
        };
        // The onSnapshot listener will pick this up automatically.
        await addDoc(messagesRef, aiMessageData);
        
        await updateDoc(sessionDocRef, {
            lastMessageText: aiResponse.response.substring(0, 50),
            lastMessageTimestamp: aiMessageData.timestamp,
            lastMessageSenderId: 'ai_agent',
            userUnreadCount: (currentSessionData?.userUnreadCount || 0) + 1,
            updatedAt: aiMessageData.timestamp,
        });
      }

    } catch (error) {
      console.error("ChatWindow: Error sending message:", error);
      setIsAiTyping(false);
    }
  };

  if (!currentUser) {
    return (
      <Card className="h-full flex flex-col shadow-md rounded-lg">
        <CardHeader className="p-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserCircle className="h-8 w-8 text-muted-foreground" />
            <CardTitle className="text-base">Chat Support</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7"><XIcon className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Please login to chat.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoadingGlobalSettings || isLoadingAdminProfile || !adminProfile.uid) {
     return (
      <Card className="h-full flex flex-col shadow-md rounded-lg">
        <CardHeader className="p-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-8 w-8 animate-spin" />
            <CardTitle className="text-base">Loading Chat...</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7"><XIcon className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
     );
  }
   if (!adminProfile.uid || adminProfile.uid === 'fallback_admin_uid' || adminProfile.uid === 'admin_master_id') {
    return (
      <Card className="h-full flex flex-col shadow-md rounded-lg">
        <CardHeader className="p-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center space-x-2">
             <MessageSquareText className="h-8 w-8 text-destructive" />
            <CardTitle className="text-base">Chat Support Not Configured</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7"><XIcon className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center p-4">
          <p className="text-destructive text-sm text-center">The support chat is currently unavailable as the admin account (ADMIN_EMAIL) could not be found or is not set up. Please contact support through other means.</p>
        </CardContent>
      </Card>
    );
  }


  return (
    <Card className="h-full flex flex-col shadow-md rounded-lg border">
      <CardHeader className="p-3 border-b flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={adminProfile.photoURL || undefined} />
            <AvatarFallback>{adminProfile.displayName?.charAt(0) || ADMIN_FALLBACK_AVATAR_INITIAL}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-base">{adminProfile.displayName || ADMIN_FALLBACK_NAME}</CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7"><XIcon className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="p-0 flex-grow overflow-hidden">
        <ScrollArea className="h-full p-3" ref={scrollAreaRootRef}>
          {isLoadingMessages ? (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 && !isAiTyping ? (
             <div className="flex justify-center items-center h-full">
                <p className="text-muted-foreground text-sm">No messages yet. Say hello!</p>
             </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, index) => (
                <div
                  key={msg.id || `msg-${index}`}
                  className={`flex items-end space-x-2 ${
                    msg.senderType === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.senderType === 'admin' && (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={adminProfile.photoURL || undefined} />
                      <AvatarFallback>{adminProfile.displayName?.charAt(0) || ADMIN_FALLBACK_AVATAR_INITIAL}</AvatarFallback>
                    </Avatar>
                  )}
                  {msg.senderType === 'ai' && (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={"/default-image.png"} />
                      <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[75%] p-2 rounded-lg shadow-sm text-sm ${
                      msg.senderType === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-none'
                        : msg.senderType === 'ai'
                        ? 'bg-secondary text-secondary-foreground rounded-bl-none'
                        : 'bg-muted text-foreground rounded-bl-none'
                    }`}
                  >
                    {msg.text && <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: linkify(msg.text) }}></p>}
                    <p className={`text-xs mt-1 text-right ${msg.senderType === 'user' ? 'text-primary-foreground/70' : msg.senderType === 'ai' ? 'text-secondary-foreground/70' : 'text-muted-foreground/70'}`}>
                      {msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {msg.senderType === 'user' && (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={currentUser?.photoURL || undefined} />
                      <AvatarFallback>{currentUser?.displayName?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isAiTyping && (
                <div className="flex items-end space-x-2 justify-start">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={"/default-image.png"} />
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                  <div className="max-w-[75%] p-2 rounded-lg shadow-sm text-sm bg-secondary text-secondary-foreground rounded-bl-none">
                    <div className="flex items-center space-x-1">
                      <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce"></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-3 border-t">
        <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-grow h-9 text-sm"
            autoComplete="off"
            disabled={isLoadingMessages || isLoadingGlobalSettings || isLoadingAdminProfile || !adminProfile.uid || isAiTyping}
          />
          <Button type="submit" size="icon" className="h-9 w-9" disabled={!newMessage.trim() || isLoadingMessages || isLoadingGlobalSettings || isLoadingAdminProfile || !adminProfile.uid || isAiTyping}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
