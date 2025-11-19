
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XIcon, Users, MessageSquareText, ChevronLeft } from 'lucide-react';
import AdminUserListForChat from './AdminUserListForChat';
import AdminChatMessageArea from './AdminChatMessageArea';
import type { FirestoreUser } from '@/types/firestore';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface FloatingAdminChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FloatingAdminChatWindow({ isOpen, onClose }: FloatingAdminChatWindowProps) {
  const [selectedChatUser, setSelectedChatUser] = useState<FirestoreUser | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSelectedChatUser(null);
    }
  }, [isOpen]);

  if (!isMounted || !isOpen) {
    return null;
  }
  
  if (isMobile) {
    return (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col h-full w-full">
             <header className="p-3 border-b flex-shrink-0 flex items-center justify-between">
                 <div className="flex items-center space-x-2">
                    {selectedChatUser ? (
                        <Button variant="ghost" size="icon" onClick={() => setSelectedChatUser(null)} className="h-7 w-7">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                    ) : (
                         <Users className="h-5 w-5 text-primary" />
                    )}
                    <h2 className="text-base font-semibold truncate">
                        {selectedChatUser ? `Chat with ${selectedChatUser.displayName || 'User'}` : "Select User"}
                    </h2>
                 </div>
                 <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
                    <XIcon className="h-4 w-4" />
                </Button>
             </header>
             <div className="flex-grow overflow-hidden flex">
                <div className={cn("flex-shrink-0 w-full transition-transform duration-300 ease-in-out", {
                    '-translate-x-full': selectedChatUser
                })}>
                    <AdminUserListForChat 
                        onSelectUser={setSelectedChatUser} 
                        selectedUserId={selectedChatUser?.id}
                        scrollAreaHeightClass="h-[calc(100vh-theme(spacing.16))] md:h-auto"
                    />
                </div>
                <div className={cn("absolute inset-0 top-16 transition-transform duration-300 ease-in-out", {
                    'translate-x-full': !selectedChatUser
                })}>
                    {selectedChatUser && <AdminChatMessageArea selectedUser={selectedChatUser} />}
                </div>
             </div>
        </div>
    )
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex items-center justify-center",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      )}
      data-state={isOpen ? "open" : "closed"}
      onClick={onClose}
    >
        <Card
  onClick={(e) => e.stopPropagation()}
  className={cn(
    // Mobile
    "w-[100vw] max-w-full h-[90vh]",

    // Tablet (sm = ≥640px)
    "sm:w-[90vw] sm:max-w-[900px] sm:h-[85vh]",

    // Desktop (md = ≥768px)
    "md:w-[85vw] md:max-w-[1100px] md:h-[80vh]",

    // Large Desktop (lg = ≥1024px)
    "lg:w-[80vw] lg:max-w-[1300px]",

    // Extra-large desktop (xl = ≥1280px)
    "xl:w-[75vw] xl:max-w-[1500px]",

    "z-50 bg-card border shadow-xl rounded-lg flex flex-col",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
  )}
  data-state={isOpen ? "open" : "closed"}
>
            <CardHeader className="p-3 border-b flex flex-row items-center justify-between">
                <div className="flex items-center space-x-2">
                {selectedChatUser ? (
                    <Button variant="ghost" size="icon" onClick={() => setSelectedChatUser(null)} className="h-7 w-7">
                    <Users className="h-4 w-4" />
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
                <div
  className="
    w-[100%]                 // mobile full width
    sm:w-[260px]             // tablet
    md:w-[300px]             // small desktop
    lg:w-[350px]             // desktop
    xl:w-[380px]             // large desktop
    flex-shrink-0 border-r
  "
>
                <AdminUserListForChat
                    onSelectUser={(user) => setSelectedChatUser(user)}
                    selectedUserId={selectedChatUser?.id}
                    scrollAreaHeightClass="h-[calc(80vh-60px)]"
                />
                </div>
                <div className="flex-grow flex flex-col">
                <AdminChatMessageArea selectedUser={selectedChatUser} />
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
