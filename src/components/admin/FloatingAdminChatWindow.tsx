
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XIcon, Users, MessageSquareText, Loader2 } from 'lucide-react';
import AdminUserListForChat from './AdminUserListForChat';
import AdminChatMessageArea from './AdminChatMessageArea';
import type { FirestoreUser } from '@/types/firestore';
import { cn } from '@/lib/utils';

interface FloatingAdminChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FloatingAdminChatWindow({ isOpen, onClose }: FloatingAdminChatWindowProps) {
  const [selectedChatUser, setSelectedChatUser] = useState<FirestoreUser | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Reset selected user when window is closed to ensure fresh state on reopen
      setSelectedChatUser(null);
    }
  }, [isOpen]);

  if (!isMounted || !isOpen) {
    return null;
  }

  return (
    <Card
      className={cn(
        "fixed bottom-[calc(theme(spacing.6)_+_theme(spacing.14)_+_theme(spacing.4))] right-6 z-40", // Position above FAB
        "w-[360px] h-[500px] sm:w-[400px] sm:h-[550px] md:w-[700px] md:h-[600px]", // Responsive size
        "bg-card border shadow-xl rounded-lg flex flex-col",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-bottom-2 data-[side=right]:slide-in-from-right-2" // Example animations
      )}
      data-state={isOpen ? "open" : "closed"}
    >
      <CardHeader className="p-3 border-b flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2">
          {selectedChatUser ? (
            <Button variant="ghost" size="icon" onClick={() => setSelectedChatUser(null)} className="h-7 w-7">
              <Users className="h-4 w-4" /> {/* Back to user list icon */}
            </Button>
          ) : (
            <Users className="h-5 w-5 text-primary" />
          )}
          <CardTitle className="text-base">
            {selectedChatUser ? `Chat with ${selectedChatUser.displayName || selectedChatUser.email}` : "Select User to Chat"}
          </CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <XIcon className="h-4 w-4" />
          <span className="sr-only">Close chat</span>
        </Button>
      </CardHeader>

      <CardContent className="p-0 flex-grow overflow-hidden flex">
        {/* Conditional rendering or responsive layout for user list and chat area */}
        <div className={cn(
            "transition-all duration-300 ease-in-out flex-shrink-0 border-r",
            selectedChatUser ? "w-0 md:w-[220px] opacity-0 md:opacity-100 overflow-hidden" : "w-full md:w-[220px] opacity-100"
          )}
        >
            {isMounted && ( // Ensure AdminUserListForChat only renders client-side
              <AdminUserListForChat
                onSelectUser={(user) => {
                  setSelectedChatUser(user);
                }}
                selectedUserId={selectedChatUser?.id}
              />
            )}
        </div>

        <div className={cn(
            "flex-grow flex flex-col transition-all duration-300 ease-in-out",
            selectedChatUser ? "w-full opacity-100" : "w-0 opacity-0 overflow-hidden md:w-auto md:opacity-100"
          )}
        >
            {selectedChatUser ? (
                 isMounted && <AdminChatMessageArea selectedUser={selectedChatUser} />
            ) : (
                <div className="h-full flex-grow flex flex-col items-center justify-center text-center p-4 md:hidden">
                    <MessageSquareText className="h-12 w-12 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">Select a user from the list to start chatting.</p>
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
