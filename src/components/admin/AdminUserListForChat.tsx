
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, UserCircle, Mail, Search, Users, Circle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where, documentId } from "firebase/firestore";
import type { FirestoreUser, ChatSession } from '@/types/firestore';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { getTimestampMillis } from '@/lib/utils';

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
  const [searchQuery, setSearchQuery] = useState('');
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
    if (!adminUser?.uid || users.length === 0) {
        setChatSessions({});
        return;
    }

    const getChatSessionId = (userId1: string, userId2: string): string => {
        return [userId1, userId2].sort().join('_');
    };

    const sessionIdsForQuery = users.map(u => getChatSessionId(u.id, adminUser.uid!));

    const CHUNK_SIZE = 30;
    const unsubscribes: (() => void)[] = [];

    for (let i = 0; i < sessionIdsForQuery.length; i += CHUNK_SIZE) {
        const chunk = sessionIdsForQuery.slice(i, i + CHUNK_SIZE);
        if (chunk.length > 0) {
            const sessionsQuery = query(collection(db, "chats"), where(documentId(), "in", chunk));
            const unsubscribeChunk = onSnapshot(sessionsQuery, (snapshot) => {
                setChatSessions(prevSessions => {
                    const updatedSessions = { ...prevSessions };
                    snapshot.forEach(docSnap => {
                        const session = { id: docSnap.id, ...docSnap.data() } as ChatSession;
                        const participantUserId = session.participants?.find(pId => pId !== adminUser?.uid);
                        if (participantUserId) {
                             updatedSessions[participantUserId] = session;
                        }
                    });
                    return updatedSessions;
                });
            }, (error) => {
                console.error("Error fetching chat sessions chunk:", error);
            });
            unsubscribes.push(unsubscribeChunk);
        }
    }

    return () => unsubscribes.forEach(unsub => unsub());
  }, [users, adminUser]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const lowerQuery = searchQuery.toLowerCase();
    return users.filter(user => 
      (user.displayName?.toLowerCase().includes(lowerQuery)) || 
      (user.email?.toLowerCase().includes(lowerQuery))
    );
  }, [users, searchQuery]);

  const sortedUsersForDisplay = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      const sessionA = chatSessions[a.id];
      const sessionB = chatSessions[b.id];

      const unreadA = sessionA?.adminUnreadCount || 0;
      const unreadB = sessionB?.adminUnreadCount || 0;
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      if (unreadA !== unreadB && unreadA > 0 && unreadB > 0) return unreadB - unreadA;

      const timeA = getTimestampMillis(sessionA?.lastMessageTimestamp);
      const timeB = getTimestampMillis(sessionB?.lastMessageTimestamp);

      if (timeA !== timeB) return timeB - timeA;
      
      const lastLoginA = getTimestampMillis(a.lastLoginAt) || getTimestampMillis(a.createdAt);
      const lastLoginB = getTimestampMillis(b.lastLoginAt) || getTimestampMillis(b.createdAt);
      return lastLoginB - lastLoginA;
    });
  }, [filteredUsers, chatSessions]);

  const formatLastActive = (timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'Never';
    return formatDistanceToNowStrict(new Date(millis), { addSuffix: true });
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">Loading users...</p>
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col shadow-none border-0 rounded-none bg-transparent">
        <CardHeader className="p-4 border-b space-y-4">
            <CardTitle className="text-lg font-bold flex items-center justify-between">
              <span className="flex items-center">
                <Users className="mr-2 h-5 w-5 text-primary"/> Conversations
              </span>
              <Badge variant="secondary" className="font-mono text-[10px]">{sortedUsersForDisplay.length}</Badge>
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-9 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/30 h-9 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
        </CardHeader>
        <CardContent className="p-0 flex-grow overflow-hidden">
            <ScrollArea className={cn("h-full", scrollAreaHeightClass)}>
            <div className="p-2 space-y-1">
                {sortedUsersForDisplay.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="bg-muted/30 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Search className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm text-muted-foreground">No users found matching your search.</p>
                  </div>
                ) : sortedUsersForDisplay.map(user => {
                  const session = chatSessions[user.id];
                  const adminUnreadCount = session?.adminUnreadCount || 0;
                  const isSelected = selectedUserId === user.id;
                  const lastMsg = session?.lastMessageText;

                  return (
                    <button
                        key={user.id}
                        onClick={() => onSelectUser(user)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl transition-colors duration-200 flex items-center space-x-3 relative",
                          isSelected 
                            ? "bg-primary text-primary-foreground z-10" 
                            : "hover:bg-accent/80 text-foreground"
                        )}
                    >
                        <div className="relative shrink-0">
                          <Avatar className={cn(
                            "h-10 w-10 border-2 transition-colors duration-200",
                            isSelected ? "border-primary-foreground/30" : "border-transparent"
                          )}>
                            <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || ""} />
                            <AvatarFallback className={cn(isSelected ? "bg-primary-foreground/10" : "")}>
                                {user.displayName ? user.displayName.charAt(0).toUpperCase() : <UserCircle size={20}/>}
                            </AvatarFallback>
                          </Avatar>
                          {adminUnreadCount > 0 && (
                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 rounded-full border-2 border-background animate-in zoom-in duration-300" variant="destructive">
                              {adminUnreadCount > 9 ? '9+' : adminUnreadCount}
                            </Badge>
                          )}
                        </div>

                        <div className="flex-grow min-w-0">
                            <div className="flex items-center justify-between">
                                <p className={cn("text-sm font-bold truncate", isSelected ? "text-primary-foreground" : "text-foreground")}>
                                  {user.displayName || user.email?.split('@')[0]}
                                </p>
                                <span className={cn("text-[10px] whitespace-nowrap ml-2", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                  {session?.lastMessageTimestamp ? formatLastActive(session.lastMessageTimestamp) : ''}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <p className={cn("text-xs truncate max-w-[150px]", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                                {lastMsg || user.email}
                              </p>
                              {!isSelected && !adminUnreadCount && user.lastLoginAt && (
                                <Circle className="h-2 w-2 fill-green-500 text-green-500 ml-2" />
                              )}
                            </div>
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
