
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTotalAdminUnreadChatCount } from '@/hooks/useTotalAdminUnreadChatCount'; // Import the new hook
import { Badge } from '@/components/ui/badge'; // Import Badge

interface AdminFloatingChatButtonProps {
  onClick: () => void;
}

export default function AdminFloatingChatButton({ onClick }: AdminFloatingChatButtonProps) {
  const [isMounted, setIsMounted] = useState(false);
  const { user: adminUser, isLoading: authLoading } = useAuth();

  // Use the new hook to get the total unread count
  const { totalUnreadCount, isLoading: isLoadingUnreadCount } = useTotalAdminUnreadChatCount(adminUser?.uid);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || authLoading) {
    return (
      <Button
        variant="default"
        size="lg"
        className="fixed bottom-6 right-6 rounded-full shadow-xl h-14 w-14 p-0 z-40 flex items-center justify-center sm:h-16 sm:w-16"
        aria-label="Loading Chat Button"
        disabled
      >
        <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 animate-spin" />
      </Button>
    );
  }
  
  if (!adminUser) {
    return null;
  }

  return (
    <Button
      variant="default"
      size="lg"
      className="fixed bottom-6 right-6 rounded-full shadow-xl h-14 w-14 p-0 z-40 flex items-center justify-center sm:h-16 sm:w-16"
      onClick={onClick}
      aria-label="Open Chat Window"
    >
      <MessageSquare className="h-6 w-6 sm:h-7 sm:w-7" />
      {!isLoadingUnreadCount && totalUnreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
          aria-label={`${totalUnreadCount} unread messages`}
        >
          {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
        </Badge>
      )}
      {isLoadingUnreadCount && ( // Show a small loader on the badge if count is loading
         <Badge
          variant="secondary"
          className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
        </Badge>
      )}
    </Button>
  );
}
