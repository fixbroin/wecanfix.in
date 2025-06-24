
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Activity, UserCircle, Home, ShoppingCart, FileText, UserPlus, Tag, Zap, CalendarCheck2, LogOut, Trash2 as TrashIcon, AlertTriangle } from "lucide-react";
import type { UserActivity } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, limit, getDocs, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from 'date-fns'; // No change here as formatDistanceToNow is good
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
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
    default: return <Activity className="h-5 w-5 text-gray-400" />;
  }
};

const formatTimestamp = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return formatDistanceToNow(timestamp.toDate(), { addSuffix: true }); // formatDistanceToNow is good for relative time
};

const ITEMS_PER_PAGE = 25;

export default function AdminActivityFeedPage() {
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    const activitiesCollectionRef = collection(db, "userActivities");
    const q = query(activitiesCollectionRef, orderBy("timestamp", "desc"), limit(ITEMS_PER_PAGE));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedActivities = querySnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as UserActivity));
      setActivities(fetchedActivities);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching activities: ", error);
      toast({ title: "Error", description: "Could not fetch activity feed.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

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
        return <Link href={data.pageUrl || '#'} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline text-blue-600 truncate max-w-[200px] sm:max-w-xs md:max-w-sm lg:max-w-md xl:max-w-lg" title={data.pageUrl}>{data.pageUrl || 'N/A'}</Link>;
      case 'addToCart':
        return <span className="text-xs">{data.serviceName || 'Unknown Service'} (Qty: {data.quantity || 1})</span>;
      case 'removeFromCart':
        return <span className="text-xs">Removed: {data.serviceName || 'Unknown Service'}</span>;
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
        return <pre className="text-xs bg-muted p-1 rounded max-w-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-2xl flex items-center">
                <Activity className="mr-2 h-6 w-6 text-primary" /> User Activity Feed
              </CardTitle>
              <CardDescription>
                Latest activities happening on your platform. Showing last {ITEMS_PER_PAGE} events.
              </CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isLoading || isClearing || activities.length === 0}>
                  {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                  Clear All Activities
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Are you absolutely sure?</AlertDialogTitle>
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
        </CardHeader>
        <CardContent className="pt-2">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No user activities recorded yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Event</TableHead>
                  <TableHead>User/Guest ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell><EventIcon eventType={activity.eventType} /></TableCell>
                    <TableCell className="text-xs font-mono">
                      {activity.userId ? <Badge variant="secondary" title={`User ID: ${activity.userId}`}>USER</Badge> : <Badge variant="outline" title={`Guest ID: ${activity.guestId}`}>GUEST</Badge>}
                      <span className="block truncate max-w-[100px] mt-0.5" title={activity.userId || activity.guestId || undefined}>{activity.userId || activity.guestId}</span>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{activity.eventType.replace(/([A-Z])/g, ' $1').trim()}</TableCell>
                    <TableCell>{renderEventData(activity)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatTimestamp(activity.timestamp)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

