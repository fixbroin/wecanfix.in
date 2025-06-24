
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from "firebase/firestore";
import type { ChatSession } from '@/types/firestore';

interface UseTotalAdminUnreadChatCountReturn {
  totalUnreadCount: number;
  isLoading: boolean;
}

export function useTotalAdminUnreadChatCount(adminUid: string | null | undefined): UseTotalAdminUnreadChatCountReturn {
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!adminUid) {
      setTotalUnreadCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const chatsRef = collection(db, "chats");
    // Query for chat sessions where the admin is a participant.
    // Firestore's array-contains can check if an element exists in an array.
    const q = query(chatsRef, where("participants", "array-contains", adminUid));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let count = 0;
      querySnapshot.forEach((doc) => {
        const sessionData = doc.data() as ChatSession;
        // Ensure adminUnreadCount is a number and add it to the total
        count += Number(sessionData.adminUnreadCount) || 0;
      });
      setTotalUnreadCount(count);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching total admin unread chat count:", error);
      setTotalUnreadCount(0);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [adminUid]);

  return { totalUnreadCount, isLoading };
}
