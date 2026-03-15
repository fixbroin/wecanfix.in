
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Loader2, Activity, UserCircle, Home, ShoppingCart, FileText, UserPlus, 
  Tag, Zap, CalendarCheck2, LogOut, Trash2 as TrashIcon, AlertTriangle, 
  Clock, RefreshCcw, ChevronRight, ExternalLink, ShieldCheck, User
} from "lucide-react";
import type { UserActivity, FirestoreUser } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, Timestamp, limit, getDocs, writeBatch, where, documentId, startAfter, type DocumentSnapshot } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const EventBadge = ({ eventType }: { eventType: UserActivity['eventType'] }) => {
  const configs: Record<string, { icon: any, color: string, bg: string, label: string }> = {
    newUser: { icon: UserPlus, color: 'text-green-600', bg: 'bg-green-500/10', label: 'New User' },
    userLogin: { icon: UserCircle, color: 'text-blue-600', bg: 'bg-blue-500/10', label: 'Login' },
    userLogout: { icon: LogOut, color: 'text-red-600', bg: 'bg-red-500/10', label: 'Logout' },
    pageView: { icon: Home, color: 'text-indigo-600', bg: 'bg-indigo-500/10', label: 'Page View' },
    addToCart: { icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-500/10', label: 'Cart Add' },
    removeFromCart: { icon: TrashIcon, color: 'text-pink-600', bg: 'bg-pink-500/10', label: 'Cart Remove' },
    newBooking: { icon: Tag, color: 'text-teal-600', bg: 'bg-teal-500/10', label: 'Booking' },
    checkoutStep: { icon: Zap, color: 'text-purple-600', bg: 'bg-purple-500/10', label: 'Checkout' },
    adminAction: { icon: CalendarCheck2, color: 'text-slate-600', bg: 'bg-slate-500/10', label: 'Admin' },
    timeOnPage: { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/5', label: 'Time Spent' },
  };

  const config = configs[eventType] || { icon: Activity, color: 'text-gray-500', bg: 'bg-gray-500/10', label: eventType };
  const Icon = config.icon;

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-transparent font-bold text-[10px] uppercase tracking-wider shadow-sm", config.bg, config.color)}>
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </div>
  );
};

const formatTimestamp = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
};

const ITEMS_PER_PAGE = 25;
const AUTO_REFRESH_TOGGLE_STORAGE_KEY = 'wecanfix_admin_activity_auto_refresh_enabled';
const AUTO_REFRESH_INTERVAL_STORAGE_KEY = 'wecanfix_admin_activity_refresh_interval';

export default function AdminActivityFeedPage() {
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [usersData, setUsersData] = useState<Record<string, { fullName: string; }>>({});
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const { toast } = useToast();

  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem(AUTO_REFRESH_TOGGLE_STORAGE_KEY) !== 'false';
    }
    return true; 
  });
  
  const [refreshInterval, setRefreshInterval] = useState(() => {
    if (typeof window !== 'undefined') {
      const storedInterval = localStorage.getItem(AUTO_REFRESH_INTERVAL_STORAGE_KEY);
      return storedInterval ? Number(storedInterval) : 5; 
    }
    return 5;
  });

  const handleAutoRefreshToggle = (checked: boolean) => {
    setIsAutoRefreshEnabled(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTO_REFRESH_TOGGLE_STORAGE_KEY, String(checked));
    }
  };
  
  const handleIntervalChange = (value: string) => {
    const newInterval = Number(value);
    setRefreshInterval(newInterval);
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTO_REFRESH_INTERVAL_STORAGE_KEY, String(newInterval));
    }
  };

  const fetchInitialActivities = useCallback(async (isAutoRefresh = false) => {
    if (!isAutoRefresh) {
        setIsLoading(true);
    }
    try {
      const activitiesCollectionRef = collection(db, "userActivities");
      const q = query(activitiesCollectionRef, orderBy("timestamp", "desc"), limit(ITEMS_PER_PAGE));
      const querySnapshot = await getDocs(q);

      const fetchedActivities = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as UserActivity));

      setActivities(fetchedActivities);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching initial activities: ", error);
      if (!isAutoRefresh) {
        toast({ title: "Error", description: "Could not fetch activity feed.", variant: "destructive" });
      }
    } finally {
      if (!isAutoRefresh) {
        setIsLoading(false);
      }
    }
  }, [toast]);
  
  useEffect(() => {
    fetchInitialActivities();
  }, [fetchInitialActivities]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

    if (isAutoRefreshEnabled) {
      intervalId = setInterval(() => {
        fetchInitialActivities(true); 
      }, refreshInterval * 1000);
    }

    return () => clearInterval(intervalId);
  }, [isAutoRefreshEnabled, refreshInterval, fetchInitialActivities]);
  
  const handleLoadMore = async () => {
    if (!lastVisible || !hasMore || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const activitiesCollectionRef = collection(db, "userActivities");
      const q = query(
        activitiesCollectionRef,
        orderBy("timestamp", "desc"),
        startAfter(lastVisible),
        limit(ITEMS_PER_PAGE)
      );
      const querySnapshot = await getDocs(q);
      const newActivities = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as UserActivity));
      
      setActivities(prevActivities => [...prevActivities, ...newActivities]);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching more activities: ", error);
      toast({ title: "Error", description: "Could not fetch more activities.", variant: "destructive" });
    } finally {
      setIsFetchingMore(false);
    }
  };


  useEffect(() => {
    const fetchUsers = async () => {
        if (activities.length === 0) return;

        const userIds = new Set(activities.map(a => a.userId).filter((id): id is string => !!id));
        const userIdsToFetch = Array.from(userIds).filter(id => !usersData[id]);
        
        if (userIdsToFetch.length === 0) return;

        setIsLoadingUsers(true);
        const CHUNK_SIZE = 30;
        const newUsersData: Record<string, { fullName: string; }>= {};

        try {
            for (let i = 0; i < userIdsToFetch.length; i += CHUNK_SIZE) {
                const chunk = userIdsToFetch.slice(i, i + CHUNK_SIZE);
                if (chunk.length === 0) continue;
                const usersQuery = query(collection(db, "users"), where(documentId(), "in", chunk));
                const usersSnapshot = await getDocs(usersQuery);
                usersSnapshot.forEach(docSnap => {
                    const userData = docSnap.data() as FirestoreUser;
                    newUsersData[docSnap.id] = { fullName: userData.displayName || 'Unknown User' };
                });
            }
            setUsersData(prev => ({...prev, ...newUsersData}));
        } catch (error) {
            console.error("Error fetching user names for activity feed:", error);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    fetchUsers();
  }, [activities, usersData]);

  const handleClearAllActivities = async () => {
    setIsClearing(true);
    try {
      const activitiesCollectionRef = collection(db, "userActivities");
      const querySnapshot = await getDocs(activitiesCollectionRef);
      
      if (querySnapshot.empty) {
        toast({ title: "No Activities", description: "There are no activities to clear.", variant: "default" });
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
      
      setActivities([]);
      setLastVisible(null);
      setHasMore(false);

      toast({ title: "Activities Cleared", description: "All user activities have been cleared." });
    } catch (error) {
      console.error("Error clearing activities: ", error);
      toast({ title: "Error Clearing Activities", description: (error as Error).message || "Could not clear all activities.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const renderEventData = (activity: UserActivity) => {
    const data = activity.eventData;
    switch (activity.eventType) {
      case 'pageView':
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{data.pageUrl || 'N/A'}</span>
            <Link href={data.pageUrl || '#'} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-primary/10 rounded-md transition-colors">
              <ExternalLink className="h-3 w-3 text-primary" />
            </Link>
          </div>
        );
      case 'timeOnPage':
        return <span className="text-xs font-medium">Spent <span className="text-primary">{data.durationSeconds}s</span> on {data.pageUrl || 'a page'}</span>;
      case 'addToCart':
        return <span className="text-xs font-medium">Added <span className="text-orange-600">{data.serviceName}</span> (Qty: {data.quantity})</span>;
      case 'removeFromCart':
        return <span className="text-xs font-medium text-pink-600">Removed {data.serviceName}</span>;
      case 'newBooking':
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-teal-600">₹{data.totalAmount?.toFixed(2)}</span>
            <Link href={`/admin/bookings/edit/${data.bookingDocId || '#'}`} className="text-xs font-bold text-blue-600 hover:underline flex items-center">
              {data.bookingId} <ChevronRight className="h-3 w-3 ml-0.5" />
            </Link>
          </div>
        );
      case 'newUser':
        return <span className="text-xs font-bold text-green-600">{data.email}</span>;
      case 'userLogin':
        return <span className="text-xs font-medium">via {data.email}</span>;
      case 'userLogout':
        return <span className="text-xs text-muted-foreground italic">Logout ({data.logoutMethod})</span>;
      case 'checkoutStep':
        return <span className="text-xs font-bold text-purple-600 uppercase tracking-tighter">{data.checkoutStepName}</span>;
      default:
        return <code className="text-[10px] bg-muted/50 p-1 px-2 rounded font-mono text-muted-foreground break-all">{JSON.stringify(data)}</code>;
    }
  };

  const renderUserCell = (activity: UserActivity) => {
    const isGuest = !activity.userId;
    const name = activity.userId ? (usersData[activity.userId]?.fullName || 'Loading...') : 'Guest User';
    
    return (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 border shadow-sm shrink-0">
          <AvatarFallback className={cn("text-[10px] font-black uppercase", isGuest ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary")}>
            {isGuest ? <User className="h-4 w-4" /> : name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold truncate tracking-tight">{name}</p>
            {!isGuest && <ShieldCheck className="h-3 w-3 text-blue-500" />}
          </div>
          <p className="text-[9px] text-muted-foreground font-mono truncate max-w-[120px]" title={activity.userId || activity.guestId || ""}>
            {activity.userId || activity.guestId}
          </p>
        </div>
      </div>
    );
  };

  const renderMobileCard = (activity: UserActivity, idx: number) => (
    <motion.div
      key={activity.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx < 10 ? idx * 0.05 : 0 }}
      className="p-5 border-b last:border-none bg-card hover:bg-muted/30 transition-colors"
    >
      <div className="flex justify-between items-start mb-4">
        <EventBadge eventType={activity.eventType} />
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
            {formatTimestamp(activity.timestamp)}
          </p>
          <p className="text-[9px] text-muted-foreground font-medium">
            {activity.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-2xl border border-dashed border-muted-foreground/20">
          <Avatar className="h-10 w-10 border shadow-sm shrink-0">
            <AvatarFallback className={cn("text-xs font-black uppercase", !activity.userId ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary")}>
              {!activity.userId ? <User className="h-4 w-4" /> : (activity.userId ? (usersData[activity.userId]?.fullName || 'U').charAt(0) : 'U')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold truncate tracking-tight">
                {activity.userId ? (usersData[activity.userId]?.fullName || 'Loading...') : 'Guest User'}
              </p>
              {activity.userId && <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate break-all" title={activity.userId || activity.guestId || ""}>
              {activity.userId || activity.guestId}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-primary/[0.03] border border-primary/5">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">Interaction Details</span>
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {renderEventData(activity)}
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2 border-b">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <div className={cn("h-2 w-2 rounded-full", isAutoRefreshEnabled ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.6)]" : "bg-muted")} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Live System Monitor</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight flex items-center">
            Activity Feed <RefreshCcw className={cn("ml-4 h-6 w-6 text-muted-foreground/30", isAutoRefreshEnabled && "animate-spin")} />
          </h1>
          <p className="text-muted-foreground text-sm font-medium">Real-time stream of all platform events and user interactions.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-card border shadow-sm p-2 rounded-2xl">
          <div className="flex items-center space-x-3 px-3 py-1.5 border-r border-dashed mr-1">
            <Switch id="auto-refresh-switch" checked={isAutoRefreshEnabled} onCheckedChange={handleAutoRefreshToggle} className="scale-90" />
            <Label htmlFor="auto-refresh-switch" className="text-[10px] font-black uppercase tracking-wider">Live Refresh</Label>
          </div>
          
          <Select value={String(refreshInterval)} onValueChange={handleIntervalChange} disabled={!isAutoRefreshEnabled}>
            <SelectTrigger className="h-9 border-none bg-muted/50 focus:ring-0 text-xs font-bold w-[140px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-none shadow-xl">
              <SelectItem value="5" className="text-xs font-bold uppercase tracking-tighter">Every 5s</SelectItem>
              <SelectItem value="10" className="text-xs font-bold uppercase tracking-tighter">Every 10s</SelectItem>
              <SelectItem value="30" className="text-xs font-bold uppercase tracking-tighter">Every 30s</SelectItem>
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive font-bold text-xs" disabled={isLoading || isClearing || activities.length === 0}>
                {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                Purge All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-3xl p-8">
              <AlertDialogHeader>
                <div className="bg-destructive/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <AlertDialogTitle className="text-2xl font-bold tracking-tight text-destructive uppercase">Confirm Full Purge</AlertDialogTitle>
                <AlertDialogDescription className="text-base font-medium">
                  This will permanently wipe ALL recorded user activities from the system. This operation cannot be reversed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-8 gap-3">
                <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80">Keep Data</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAllActivities} className="rounded-xl bg-destructive hover:bg-destructive/90 px-8">
                  Erase Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-card">
        <CardContent className="p-0">
          {isLoading && activities.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-[400px] space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Scanning Events...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-32 bg-muted/5">
              <Activity className="h-16 w-16 mx-auto text-muted-foreground/20 mb-6" />
              <p className="text-xl font-bold tracking-tight">No Events Detected</p>
              <p className="text-muted-foreground text-sm mt-1">Activities will appear here as they happen.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="w-[180px] pl-8 py-5 text-[10px] font-black uppercase tracking-widest">Type</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest">Interaction</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest">User Identity</TableHead>
                      <TableHead className="text-right pr-8 text-[10px] font-black uppercase tracking-widest">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {activities.map((activity, idx) => (
                        <motion.tr
                          key={activity.id}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.3, delay: idx < 10 ? idx * 0.05 : 0 }}
                          className={cn(
                            "group border-b border-muted/40 transition-all hover:bg-primary/[0.02]",
                            idx === 0 && isAutoRefreshEnabled && "bg-primary/[0.03]"
                          )}
                        >
                          <TableCell className="pl-8 py-4">
                            <EventBadge eventType={activity.eventType} />
                          </TableCell>
                          <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                            {renderEventData(activity)}
                          </TableCell>
                          <TableCell>
                            {renderUserCell(activity)}
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
                                {formatTimestamp(activity.timestamp)}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-medium">
                                {activity.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              {/* Mobile View: Cards */}
              <div className="md:hidden">
                <AnimatePresence initial={false}>
                  {activities.map((activity, idx) => renderMobileCard(activity, idx))}
                </AnimatePresence>
              </div>
            </>
          )}
        </CardContent>
        {hasMore && (
          <CardFooter className="py-10 bg-muted/10 justify-center">
            <Button 
              onClick={handleLoadMore} 
              disabled={isFetchingMore || isLoading}
              variant="outline"
              className="rounded-2xl px-10 h-12 border-2 border-primary/20 text-primary font-bold shadow-sm hover:bg-primary hover:text-primary-foreground transition-all"
            >
              {isFetchingMore ? <Loader2 className="mr-3 h-5 w-5 animate-spin"/> : null}
              Load Older Events
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
