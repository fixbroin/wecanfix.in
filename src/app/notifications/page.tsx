
"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing, BellOff, ArrowLeft, CheckCircle2, Info, AlertTriangle, Tag, Loader2, Trash2 as TrashIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, writeBatch, Timestamp, getDocs } from "firebase/firestore";
import type { FirestoreNotification } from "@/types/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from 'date-fns';
import { useLoading } from "@/contexts/LoadingContext";
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

const NotificationIcon = ({ type }: { type: FirestoreNotification['type'] }) => {
  if (type === "success") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (type === "info") return <Info className="h-5 w-5 text-blue-500" />;
  if (type === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
  if (type === "error") return <AlertTriangle className="h-5 w-5 text-destructive" />;
  if (type === "booking_update" || type === "admin_alert") return <Tag className="h-5 w-5 text-primary" />;
  return <BellRing className="h-5 w-5 text-gray-500" />;
};

export default function NotificationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<FirestoreNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const { showLoading, hideLoading } = useLoading();
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !user || authLoading) {
      if (!authLoading && !user && isMounted) setIsLoadingNotifications(false);
      return;
    }

    setIsLoadingNotifications(true);
    const notificationsCollectionRef = collection(db, "userNotifications");
    const q = query(
      notificationsCollectionRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedNotifications = querySnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as FirestoreNotification));
      setNotifications(fetchedNotifications);
      setIsLoadingNotifications(false);
    }, (error) => {
      console.error("Error fetching notifications: ", error);
      toast({ title: "Error", description: "Could not fetch notifications.", variant: "destructive" });
      setIsLoadingNotifications(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, toast, isMounted]);

  const handleMarkAsRead = async (notificationId?: string) => {
    if (!user || !notificationId) return;
    
    const notificationRef = doc(db, "userNotifications", notificationId);
    try {
      await updateDoc(notificationRef, { read: true });
    } catch (error) {
      console.error("Error marking notification as read: ", error);
      toast({ title: "Error", description: "Could not update notification status.", variant: "destructive" });
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user || notifications.filter(n => !n.read).length === 0) return;
    
    showLoading();
    const batch = writeBatch(db);
    notifications.forEach(notification => {
      if (!notification.read && notification.id) {
        const notificationRef = doc(db, "userNotifications", notification.id);
        batch.update(notificationRef, { read: true });
      }
    });

    try {
      await batch.commit();
      toast({ title: "Success", description: "All notifications marked as read." });
    } catch (error) {
      console.error("Error marking all notifications as read: ", error);
      toast({ title: "Error", description: "Could not mark all as read.", variant: "destructive" });
    } finally {
      hideLoading();
    }
  };

  const handleClearAllMyNotifications = async () => {
    if (!user) return;
    setIsClearing(true);
    try {
      const notificationsCollectionRef = collection(db, "userNotifications");
      const q = query(notificationsCollectionRef, where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast({ title: "No Notifications", description: "You have no notifications to clear.", variant: "default" });
        setIsClearing(false);
        return;
      }

      const batchArray = [];
      let currentBatch = writeBatch(db);
      let currentBatchSize = 0;

      querySnapshot.docs.forEach((doc) => {
        currentBatch.delete(doc.ref);
        currentBatchSize++;
        if (currentBatchSize === 500) {
          batchArray.push(currentBatch);
          currentBatch = writeBatch(db);
          currentBatchSize = 0;
        }
      });

      if (currentBatchSize > 0) {
        batchArray.push(currentBatch);
      }

      for (const batch of batchArray) {
        await batch.commit();
      }

      toast({ title: "Notifications Cleared", description: "All your notifications have been cleared." });
    } catch (error) {
      console.error("Error clearing user notifications: ", error);
      toast({ title: "Error Clearing", description: (error as Error).message || "Could not clear your notifications.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (authLoading || (isLoadingNotifications && isMounted)) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading notifications...</p>
      </div>
    );
  }

  if (!user && isMounted) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl text-center">
        <BellOff className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Login Required</h2>
        <p className="text-muted-foreground mb-6">Please login to view your notifications.</p>
        <Link href="/auth/login?redirect=/notifications" passHref>
          <Button>Login</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-headline font-semibold text-foreground">
            Notifications {unreadCount > 0 && <span className="text-sm text-primary">({unreadCount} unread)</span>}
          </h1>
        </div>
        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
          {notifications.length > 0 && unreadCount > 0 && (
             <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} className="w-full sm:w-auto" disabled={isClearing}>Mark all as read</Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-full sm:w-auto" disabled={isClearing || notifications.length === 0}>
                {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all your notifications. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAllMyNotifications} disabled={isClearing} className="bg-destructive hover:bg-destructive/90">
                  {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Yes, Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
           <Link href="/" passHref className="w-full sm:w-auto">
            <Button variant="outline" size="sm" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
        </div>
      </div>

      {notifications.length === 0 && !isLoadingNotifications ? (
        <div className="text-center py-12">
          <BellOff className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Notifications Yet</h2>
          <p className="text-muted-foreground text-sm">You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`shadow-sm transition-all hover:shadow-md ${!notification.read ? "border-primary/50 border-l-4" : "border"}`}
              onClick={() => !notification.read && notification.id && handleMarkAsRead(notification.id)}
            >
              <CardContent className="p-3 flex items-start space-x-3">
                <div className="pt-1">
                  <NotificationIcon type={notification.type} />
                </div>
                <div className="flex-grow">
                  {notification.href ? (
                     <Link href={notification.href} className="hover:underline" onClick={(e) => { e.stopPropagation(); showLoading(); if (!notification.read && notification.id) handleMarkAsRead(notification.id);}}>
                        <CardTitle className={`text-sm font-semibold ${!notification.read ? "text-primary" : ""}`}>
                          {notification.title}
                        </CardTitle>
                     </Link>
                  ) : (
                    <CardTitle className={`text-sm font-semibold ${!notification.read ? "text-primary" : ""}`}>
                      {notification.title}
                    </CardTitle>
                  )}
                  <CardDescription className="text-xs mt-0.5">{notification.message}</CardDescription>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {notification.createdAt ? formatDistanceToNow(notification.createdAt.toDate(), { addSuffix: true }) : 'just now'}
                  </p>
                </div>
                {!notification.read && (
                    <div className="h-2.5 w-2.5 bg-primary rounded-full shrink-0 mt-1.5" aria-label="Unread"></div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
