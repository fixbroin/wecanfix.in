
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCircle, Mail, MessageSquareWarning, Users, MessageCircle as MessageIcon } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, where, Timestamp, documentId } from "firebase/firestore"; // Imported documentId
import type { FirestoreUser, ChatSession } from '@/types/firestore';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

interface AdminUserListForChatProps {
  onSelectUser: (user: FirestoreUser) => void;
  selectedUserId?: string | null;
  scrollAreaHeightClass?: string;
}

export default function AdminUserListForChat({
  onSelectUser,
  selectedUserId,
  scrollAreaHeightClass = "h-full"
}: AdminUserListForChatProps) {
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chatSessions, setChatSessions] = useState<Record<string, ChatSession>>({});
  const { user: adminUser } = useAuth();

  useEffect(() => {
    setIsLoading(true);
    const usersCollectionRef = collection(db, "users");
    const q = query(usersCollectionRef, orderBy("createdAt", "desc"));

    const unsubscribeUsers = onSnapshot(q, (querySnapshot) => {
      const fetchedUsers = querySnapshot.docs
        .map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as FirestoreUser))
        .filter(u => u.email !== adminUser?.email);
      setUsers(fetchedUsers);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching users for chat list: ", error);
      setIsLoading(false);
    });

    return () => unsubscribeUsers();
  }, [adminUser?.email]);

  useEffect(() => {
    if (!adminUser?.uid || users.length === 0) { // Ensure adminUser.uid is available
        setChatSessions({}); // Clear sessions if no admin or users
        return;
    }

    const getChatSessionId = (userId1: string, userId2: string): string => {
        return [userId1, userId2].sort().join('_');
    };

    const sessionIdsForQuery = users.map(u => getChatSessionId(u.id, adminUser.uid!)); // adminUser.uid is now checked

    const CHUNK_SIZE = 30;
    const unsubscribes: (() => void)[] = [];

    for (let i = 0; i < sessionIdsForQuery.length; i += CHUNK_SIZE) {
        const chunk = sessionIdsForQuery.slice(i, i + CHUNK_SIZE);
        if (chunk.length > 0) {
            // Corrected Query: Use documentId() to query by document IDs
            const sessionsQuery = query(collection(db, "chats"), where(documentId(), "in", chunk));
            const unsubscribeChunk = onSnapshot(sessionsQuery, (snapshot) => {
                setChatSessions(prevSessions => {
                    const updatedSessions = { ...prevSessions };
                    snapshot.forEach(docSnap => {
                        const session = { id: docSnap.id, ...docSnap.data() } as ChatSession;
                        const participantUserId = session.participants?.find(pId => pId !== adminUser?.uid);
                        if (participantUserId) {
                             updatedSessions[participantUserId] = session;
                        } else {
                            console.warn("AdminUserListForChat: Could not determine non-admin participant for session", session.id, "Participants:", session.participants, "Admin UID:", adminUser?.uid);
                        }
                    });
                    return updatedSessions;
                });
            }, (error) => {
                console.error("Error fetching chat sessions chunk for unread counts:", error);
            });
            unsubscribes.push(unsubscribeChunk);
        }
    }

    return () => unsubscribes.forEach(unsub => unsub());

  }, [users, adminUser]);


  const formatLastActive = (timestamp?: any): string => {
    if (!timestamp) return 'Never';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch (e) {
      return 'Unknown';
    }
  };

  const sortedUsersForDisplay = useMemo(() => {
    return [...users].sort((a, b) => {
      const sessionA = chatSessions[a.id];
      const sessionB = chatSessions[b.id];

      const unreadA = sessionA?.adminUnreadCount || 0;
      const unreadB = sessionB?.adminUnreadCount || 0;
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      if (unreadA !== unreadB && unreadA > 0 && unreadB > 0) return unreadB - unreadA;

      const timeA = sessionA?.lastMessageTimestamp?.toMillis() || 0;
      const timeB = sessionB?.lastMessageTimestamp?.toMillis() || 0;

      if (timeA !== timeB) {
        return timeB - timeA;
      }
      const lastLoginA = a.lastLoginAt?.toMillis() || a.createdAt?.toMillis() || 0;
      const lastLoginB = b.lastLoginAt?.toMillis() || b.createdAt?.toMillis() || 0;
      return lastLoginB - lastLoginA;
    });
  }, [users, chatSessions]);


  if (isLoading) {
    return (
      <div className="border-r h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  if (users.length === 0) {
    return (
        <div className="border-r h-full flex flex-col items-center justify-center text-center p-4">
            <Users className="h-12 w-12 text-muted-foreground mb-3"/>
            <p className="text-muted-foreground text-sm">No registered users found to chat with.</p>
        </div>
    );
  }

  return (
    <Card className="h-full flex flex-col shadow-none border-0 rounded-none">
        <CardHeader className="p-3 md:p-4 border-b hidden md:block">
            <CardTitle className="text-md md:text-lg flex items-center"><Users className="mr-2 h-4 w-4 md:h-5 md:w-5 text-primary"/> Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-grow overflow-hidden">
            <ScrollArea className={cn("h-full", scrollAreaHeightClass)}>
            <div className="divide-y divide-border">
                {sortedUsersForDisplay.map(user => {
                  const session = chatSessions[user.id];
                  const adminUnreadCountForThisUser = session?.adminUnreadCount || 0;
                  return (
                    <button
                        key={user.id}
                        onClick={() => onSelectUser(user)}
                        className={cn(
                        "w-full text-left p-2.5 md:p-3 hover:bg-accent/50 focus:bg-accent focus:outline-none transition-colors flex items-center space-x-2 md:space-x-3",
                        selectedUserId === user.id && "bg-accent border-l-2 md:border-l-4 border-primary"
                        )}
                    >
                        <Avatar className="h-8 w-8 md:h-9 md:w-9">
                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email?.charAt(0) || 'U'} />
                        <AvatarFallback className="text-xs">
                            {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email ? user.email.charAt(0).toUpperCase() : <UserCircle size={16}/>}
                        </AvatarFallback>
                        </Avatar>
                        <div className="flex-grow min-w-0">
                            <div className="flex items-center">
                                <p className="text-xs md:text-sm font-medium text-foreground truncate">{user.displayName || user.email}</p>
                                {adminUnreadCountForThisUser > 0 && (
                                    <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[9px] leading-tight">
                                        {adminUnreadCountForThisUser > 9 ? '9+' : adminUnreadCountForThisUser}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-[10px] md:text-xs text-muted-foreground truncate flex items-center">
                              <Mail size={10} className="mr-1 shrink-0"/> {user.email}
                            </p>
                            <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
                                {session?.lastMessageTimestamp ?
                                    `Chat: ${formatLastActive(session.lastMessageTimestamp)}` :
                                    `Active: ${formatLastActive(user.lastLoginAt || user.createdAt)}`
                                }
                            </p>
                        </div>
                    </button>
                  );
                })}
            </div>
            </ScrollArea>
        </CardContent>
    </Card>
  );
}
