

"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, UserCircle, MessageSquareText, Loader2, Trash2 as TrashIcon } from 'lucide-react';
import type { FirestoreUser, ChatMessage, ChatSession, FirestoreNotification } from '@/types/firestore';
import { Timestamp, doc, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, setDoc, serverTimestamp, getDoc, getDocs, limit, writeBatch, deleteDoc } from "firebase/firestore";
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
// Removed useGlobalSettings as sound playback is now global in AdminLayout
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface AdminChatMessageAreaProps {
  selectedUser: FirestoreUser | null;
}

const ADMIN_FALLBACK_AVATAR_INITIAL_CHAT_AREA = "S";

const linkify = (text: string) => {
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, (url) => {
        const fullUrl = url.startsWith('www.') ? `http://${url}` : url;
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">${url}</a>`;
    });
};

export default function AdminChatMessageArea({ selectedUser }: AdminChatMessageAreaProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const scrollAreaRootRef = useRef<HTMLDivElement>(null);
  const { user: loggedInAdminUser } = useAuth();
  const { toast } = useToast();
  // Removed audioRef and related useEffect as sound is handled by AdminLayout

  const [supportAdminProfile, setSupportAdminProfile] = useState<{displayName?: string | null, photoURL?: string | null, uid: string | null}>({
    displayName: "Support", photoURL: null, uid: null
  });
  const [isLoadingSupportAdminProfile, setIsLoadingSupportAdminProfile] = useState(true);

  useEffect(() => {
    const fetchSupportAdminProfile = async () => {
      setIsLoadingSupportAdminProfile(true);
      try {
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          const adminData = adminSnapshot.docs[0].data();
          const adminUid = adminSnapshot.docs[0].id;
          setSupportAdminProfile({
            displayName: adminData.displayName || "Support",
            photoURL: adminData.photoURL || null,
            uid: adminUid
          });
        } else {
          setSupportAdminProfile({ displayName: "Support", photoURL: null, uid: 'fallback_admin_uid' });
        }
      } catch (error) {
        setSupportAdminProfile({ displayName: "Support", photoURL: null, uid: 'fallback_admin_uid' });
      } finally {
        setIsLoadingSupportAdminProfile(false);
      }
    };
    fetchSupportAdminProfile();
  }, []);

  const getChatSessionId = useCallback((userId1: string, userId2: string): string => {
    return [userId1, userId2].sort().join('_');
  }, []);

  const currentChatSessionId = selectedUser && supportAdminProfile.uid ? getChatSessionId(selectedUser.id, supportAdminProfile.uid) : null;

  useEffect(() => {
    if (currentChatSessionId && selectedUser && !isLoadingSupportAdminProfile) {
      setIsLoadingMessages(true);
      const messagesRef = collection(db, 'chats', currentChatSessionId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));

      const unsubscribe = onSnapshot(q, async (querySnapshot) => {
        const fetchedMessages = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ChatMessage));
        setMessages(fetchedMessages);
        setIsLoadingMessages(false);

        // Mark messages as read by admin for this specific chat session
        const batch = writeBatch(db);
        let messagesMarkedRead = false;
        for (const msg of fetchedMessages) {
          if (msg.senderType === 'user' && !msg.isReadByAdmin && msg.id) {
            const msgRef = doc(db, 'chats', currentChatSessionId, 'messages', msg.id);
            batch.update(msgRef, { isReadByAdmin: true });
            messagesMarkedRead = true;
          }
        }
        if (messagesMarkedRead) {
          await batch.commit();
        }

        // Update session: adminUnreadCount to 0 as admin is viewing this chat
        const sessionDocRef = doc(db, 'chats', currentChatSessionId);
        const sessionSnap = await getDoc(sessionDocRef);
        if (sessionSnap.exists()) {
            await updateDoc(sessionDocRef, { adminUnreadCount: 0, updatedAt: serverTimestamp() });
        } else if (selectedUser && supportAdminProfile.uid) { // Should rarely happen if session is created on first message
            await setDoc(sessionDocRef, {
                userId: selectedUser.id,
                adminId: supportAdminProfile.uid,
                adminUnreadCount: 0,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                participants: [selectedUser.id, supportAdminProfile.uid].filter(Boolean),
            }, { merge: true });
        }
      }, (error) => {
        console.error("AdminChatMessageArea: Error fetching messages:", error);
        setIsLoadingMessages(false);
      });

      return () => unsubscribe();
    } else {
      setMessages([]);
      if (!isLoadingSupportAdminProfile) setIsLoadingMessages(false);
    }
  }, [currentChatSessionId, selectedUser, isLoadingSupportAdminProfile, supportAdminProfile.uid]);

  useEffect(() => {
    if (scrollAreaRootRef.current) {
      const viewport = scrollAreaRootRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, isLoadingMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !loggedInAdminUser || !currentChatSessionId || !supportAdminProfile.uid) {
      return;
    }

    const messageData: Omit<ChatMessage, 'id'> = {
      chatSessionId: currentChatSessionId,
      senderId: supportAdminProfile.uid,
      senderType: 'admin',
      text: newMessage,
      timestamp: Timestamp.now(),
      isReadByUser: false, // New message from admin, not yet read by user
    };

    const tempNewMessage = newMessage;
    setNewMessage('');
    try {
      const messagesRef = collection(db, 'chats', currentChatSessionId, 'messages');
      await addDoc(messagesRef, messageData);

      // Update chat session metadata and disable AI agent
      const sessionDocRef = doc(db, 'chats', currentChatSessionId);
      const sessionSnap = await getDoc(sessionDocRef);
      const currentSessionData = sessionSnap.exists() ? sessionSnap.data() as ChatSession : undefined;
      const currentUserUnreadCount = currentSessionData?.userUnreadCount || 0;

      await setDoc(sessionDocRef, {
        userId: selectedUser.id,
        userName: selectedUser.displayName || null,
        userPhotoUrl: selectedUser.photoURL || null,
        adminId: supportAdminProfile.uid,
        adminName: supportAdminProfile.displayName || null,
        adminPhotoUrl: supportAdminProfile.photoURL || null,
        lastMessageText: tempNewMessage.substring(0, 50),
        lastMessageTimestamp: messageData.timestamp,
        lastMessageSenderId: supportAdminProfile.uid,
        participants: [selectedUser.id, supportAdminProfile.uid].filter(p => p !== null && p !== undefined),
        userUnreadCount: currentUserUnreadCount + 1, // Increment user's unread count
        adminUnreadCount: 0, // Admin has just sent/seen this chat
        aiAgentActive: false, // Admin has joined, disable AI
        updatedAt: messageData.timestamp,
        ...(currentSessionData ? {} : { createdAt: messageData.timestamp }) // Set createdAt only if new session
      }, { merge: true });
      
      // Create notification for the user
      const userNotificationData: FirestoreNotification = {
        userId: selectedUser.id,
        title: `New Message from ${supportAdminProfile.displayName || "Support"}`,
        message: `You have a new chat message: "${tempNewMessage.substring(0, 30)}${tempNewMessage.length > 30 ? "..." : ""}"`,
        type: 'info', // Or a more specific chat notification type
        href: '/chat', // Link to the main chat page for the user
        read: false,
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, "userNotifications"), userNotificationData);

    } catch (error) {
      console.error("AdminChatMessageArea: Error sending message:", error);
      // Optionally re-set newMessage if send failed, or show error toast
    }
  };

  const handleClearChat = async () => {
    if (!currentChatSessionId || !selectedUser) {
      toast({ title: "Error", description: "No chat session selected to clear.", variant: "destructive" });
      return;
    }
    setIsClearingChat(true);
    try {
      const messagesQuery = query(collection(db, 'chats', currentChatSessionId, 'messages'));
      const messagesSnapshot = await getDocs(messagesQuery);
      
      const batch = writeBatch(db);
      messagesSnapshot.forEach(docSnapshot => {
        batch.delete(docSnapshot.ref);
      });

      // Also update the session document to reflect clearance
      const sessionDocRef = doc(db, 'chats', currentChatSessionId);
      batch.update(sessionDocRef, {
        lastMessageText: "Chat cleared by admin.",
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSenderId: supportAdminProfile.uid || null, // Use the determined support admin UID
        userUnreadCount: 0, // Reset user's unread count for this session
        adminUnreadCount: 0, // Admin's unread count is 0
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      toast({ title: "Chat Cleared", description: `Message history with ${selectedUser.displayName || selectedUser.email} has been cleared.` });
    } catch (error) {
      console.error("Error clearing chat:", error);
      toast({ title: "Error Clearing Chat", description: (error as Error).message || "Could not clear chat history.", variant: "destructive" });
    } finally {
      setIsClearingChat(false);
    }
  };


  if (!selectedUser) {
    return (
      <Card className="h-full flex flex-col items-center justify-center text-center shadow-md">
        <CardContent className="p-6">
          <MessageSquareText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Select a user from the list to view their chat history or send a message.</p>
        </CardContent>
      </Card>
    );
  }

  if (!loggedInAdminUser || isLoadingSupportAdminProfile || !supportAdminProfile.uid) {
    return <Card className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin mr-2"/> <p className="text-muted-foreground">Loading admin details...</p></Card>;
  }

  return (
    <Card className="h-full flex flex-col shadow-md">
      <CardHeader className="p-4 border-b">
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
                <AvatarImage src={selectedUser.photoURL || undefined} alt={selectedUser.displayName || selectedUser.email?.charAt(0) || 'U'} />
                <AvatarFallback>
                    {selectedUser.displayName ? selectedUser.displayName.charAt(0).toUpperCase() : selectedUser.email ? selectedUser.email.charAt(0).toUpperCase() : <UserCircle size={20}/>}
                </AvatarFallback>
            </Avatar>
            <div>
                <CardTitle className="text-md">{selectedUser.displayName || selectedUser.email}</CardTitle>
            </div>
            </div>
            <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isClearingChat || isLoadingMessages || messages.length === 0}>
                {isClearingChat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                Clear Chat
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirm Clear Chat</AlertDialogTitle>
                <AlertDialogDescription>
                    Are you sure you want to permanently delete all messages in this chat with {selectedUser.displayName || selectedUser.email}? This action cannot be undone.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel disabled={isClearingChat}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearChat} disabled={isClearingChat} className="bg-destructive hover:bg-destructive/90">
                    {isClearingChat && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Yes, Clear Chat
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
            </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-grow overflow-hidden">
        <ScrollArea className="h-full p-4" ref={scrollAreaRootRef}>
          {isLoadingMessages ? (
             <div className="flex justify-center items-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
          ) : messages.length === 0 ? (
             <div className="flex justify-center items-center h-full">
                <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
             </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-end space-x-2 ${
                    msg.senderType === 'admin' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.senderType === 'user' && (
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={selectedUser.photoURL || undefined} />
                      <AvatarFallback>{selectedUser.displayName ? selectedUser.displayName.charAt(0).toUpperCase() : selectedUser.email ? selectedUser.email.charAt(0).toUpperCase() : 'U'}</AvatarFallback>
                    </Avatar>
                  )}
                   {msg.senderType === 'ai' && (
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={"/default-image.png"} />
                      <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[70%] p-2.5 rounded-lg shadow-sm ${
                      msg.senderType === 'admin'
                        ? 'bg-primary text-primary-foreground rounded-br-none'
                        : msg.senderType === 'ai'
                        ? 'bg-secondary text-secondary-foreground rounded-bl-none'
                        : 'bg-card border rounded-bl-none'
                    }`}
                  >
                    {msg.text && <p className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: linkify(msg.text) }}></p>}
                    <p className="text-xs text-muted-foreground/80 mt-1 text-right">
                      {msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {msg.senderType === 'admin' && (
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={supportAdminProfile?.photoURL || undefined} />
                      <AvatarFallback>{supportAdminProfile?.displayName ? supportAdminProfile.displayName.charAt(0).toUpperCase() : ADMIN_FALLBACK_AVATAR_INITIAL_CHAT_AREA}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t">
        <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-grow h-10"
            autoComplete="off"
            disabled={isLoadingMessages || isLoadingSupportAdminProfile}
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim() || isLoadingMessages || isLoadingSupportAdminProfile}>
            <Send className="h-5 w-5" />
            <span className="sr-only">Send message</span>
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
