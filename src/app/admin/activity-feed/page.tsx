
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Activity, UserCircle, Home, ShoppingCart, FileText, UserPlus, Tag, Zap, CalendarCheck2, LogOut, Trash2 as TrashIcon, AlertTriangle, Clock } from "lucide-react";
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

const EventIcon = ({ eventType }: { eventType: UserActivity['eventType'] }) => {
  switch (eventType) {
    case 'newUser': return <UserPlus className="h-5 w-5 text-green-500" />;
    case 'userLogin': return <UserCircle className="h-5 w-5 text-blue-500" />;
    case 'userLogout': return <LogOut className="h-5 w-5 text-red-500" />;
    case 'pageView': return <Home className="h-5 w-5 text-indigo-500" />;
    case 'addToCart': return <ShoppingCart className="h-5 w-5 text-orange-500" />;
    case 'removeFromCart': return <TrashIcon className="h-5 w-5 text-pink-500" />;
    case 'newBooking': return <Tag className="h-5 w-5 text-teal-500" />;
    case 'checkoutStep': return <Zap className="h-5 w-5 text-purple-500" />;
    case 'adminAction': return <CalendarCheck2 className="h-5 w-5 text-gray-500" />;
    case 'timeOnPage': return <Clock className="h-5 w-5 text-gray-500" />;
    default: return <Activity className="h-5 w-5 text-gray-400" />;
  }
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
      return storedInterval ? Number(storedInterval) : 5; // Default to 5 seconds if not set
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
        fetchInitialActivities(true); // Pass true for silent auto-refresh
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
        return <Link href={data.pageUrl || '#'} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline text-blue-600 break-all" title={data.pageUrl}>{data.pageUrl || 'N/A'}</Link>;
      case 'timeOnPage':
        return <span className="text-xs">{data.pageUrl || 'A page'} for {data.durationSeconds}s</span>;
      case 'addToCart':
        return <span className="text-xs">{data.serviceName || 'Unknown Service'} (Qty: {data.quantity || 1})</span>;
      case 'removeFromCart':
        return <span className="text-xs">Removed: {data.serviceName || 'Unknown Service'} (Qty: {data.quantity || 1})</span>;
      case 'newBooking':
        return <span className="text-xs">ID: <Link href={`/admin/bookings/edit/${data.bookingDocId || '#'}`} className="hover:underline text-blue-600">{data.bookingId || 'N/A'}</Link>, Total: ₹{data.totalAmount?.toFixed(2) || 'N/A'}</span>;
      case 'newUser':
        return <span className="text-xs">Email: {data.email || 'N/A'}, Name: {data.fullName || 'N/A'}</span>;
      case 'userLogin':
        return <span className="text-xs">Email: {data.email || 'N/A'}</span>;
      case 'userLogout':
        return <span className="text-xs">User logged out. Method: {data.logoutMethod || 'Unknown'}</span>;
      case 'checkoutStep':
        return <span className="text-xs">Step: {data.checkoutStepName || 'Unknown'} ({data.pageUrl || 'N/A'})</span>;
      default:
        return <code className="text-xs bg-muted p-1 rounded block overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(data, null, 2)}</code>;
    }
  };

  const renderMobileCard = (activity: UserActivity) => (
    <Card key={activity.id} className="mb-4">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-3">
          <EventIcon eventType={activity.eventType} />
          <div>
            <p className="font-semibold capitalize">{activity.eventType.replace(/([A-Z])/g, ' $1').trim()}</p>
            <p className="text-xs text-muted-foreground">{formatTimestamp(activity.timestamp)}</p>
          </div>
        </div>
        <div className="pl-8 text-sm space-y-1">
          <div>
            <strong className="text-muted-foreground">User:</strong>
            <div className="text-foreground break-words">
              {activity.userId ? (
                <>
                  <p>{usersData[activity.userId]?.fullName || 'Registered User'}</p>
                  <p className="text-xs text-muted-foreground/80 break-all" title={activity.userId}>ID: {activity.userId}</p>
                </>
              ) : (
                <>
                  <p>Guest</p>
                  <p className="text-xs text-muted-foreground/80 break-all" title={activity.guestId || undefined}>ID: {activity.guestId}</p>
                </>
              )}
            </div>
          </div>
          <div>
            <strong className="text-muted-foreground">Details:</strong>
            <div className="text-foreground break-words">{renderEventData(activity)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center">
                <Activity className="mr-2 h-6 w-6 text-primary" /> User Activity Feed
              </CardTitle>
              <CardDescription>
                Latest activities happening on your platform.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <div className="flex items-center space-x-2">
                    <Switch id="auto-refresh-switch" checked={isAutoRefreshEnabled} onCheckedChange={handleAutoRefreshToggle} />
                    <Label htmlFor="auto-refresh-switch">Auto-Refresh</Label>
                </div>
                <Select value={String(refreshInterval)} onValueChange={handleIntervalChange} disabled={!isAutoRefreshEnabled}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Set Interval" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="5">Every 5 seconds</SelectItem>
                        <SelectItem value="10">Every 10 seconds</SelectItem>
                        <SelectItem value="30">Every 30 seconds</SelectItem>
                    </SelectContent>
                </Select>
                <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isLoading || isClearing || activities.length === 0}>
                    {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                    Clear All
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action will permanently delete ALL user activities. This cannot be undone.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAllActivities} disabled={isClearing} className="bg-destructive hover:bg-destructive/90">
                        {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Yes, Clear All
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
                </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {isLoading && activities.length === 0 ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No user activities recorded yet.</p>
            </div>
          ) : (
            <>
              {/* Desktop and Tablet View: Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Event</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="whitespace-nowrap">Type</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell><EventIcon eventType={activity.eventType} /></TableCell>
                        <TableCell>
                          {activity.userId ? (
                            <div>
                              <div className="font-medium">{usersData[activity.userId]?.fullName || 'Registered User'}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={activity.userId}>
                                ID: {activity.userId}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium">Guest</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={activity.guestId || undefined}>
                                ID: {activity.guestId}
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs capitalize whitespace-nowrap">{activity.eventType.replace(/([A-Z])/g, ' $1').trim()}</TableCell>
                        <TableCell>{renderEventData(activity)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">{formatTimestamp(activity.timestamp)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile View: Cards */}
              <div className="md:hidden">
                {activities.map(renderMobileCard)}
              </div>
            </>
          )}
        </CardContent>
        {hasMore && (
            <CardFooter className="pt-4 justify-center">
                <Button onClick={handleLoadMore} disabled={isFetchingMore || isLoading}>
                    {isFetchingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    Load More Activities
                </Button>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
