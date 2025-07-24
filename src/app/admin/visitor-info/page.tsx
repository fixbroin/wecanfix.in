
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Globe2, PackageSearch, AlertTriangle, Trash2 as TrashIcon } from "lucide-react"; // Added TrashIcon
import type { FirestoreVisitorInfoLog } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, limit, startAfter, getDocs, writeBatch } from "firebase/firestore"; // Added writeBatch
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from 'date-fns';
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogDescriptionComponent, // Renamed to avoid conflict
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ITEMS_PER_PAGE = 20;

const formatLogTimestamp = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
};

const formatDateForDisplay = (timestamp?: Timestamp): string => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
};


export default function AdminVisitorInfoPage() {
  const [visitorLogs, setVisitorLogs] = useState<FirestoreVisitorInfoLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isClearing, setIsClearing] = useState(false); // For clearing logs state
  const { toast } = useToast();

  const fetchInitialLogs = async () => {
    setIsLoading(true);
    try {
      const logsCollectionRef = collection(db, "visitorInfoLogs");
      const q = query(logsCollectionRef, orderBy("timestamp", "desc"), limit(ITEMS_PER_PAGE));
      const querySnapshot = await getDocs(q);
      
      const fetchedLogs = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as FirestoreVisitorInfoLog));
      
      setVisitorLogs(fetchedLogs);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null); // Handle empty snapshot
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching initial visitor logs: ", error);
      toast({ title: "Error", description: "Could not fetch visitor logs.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchInitialLogs();
    // No onSnapshot here to avoid excessive reads if logs are very frequent.
    // Admin can manually refresh or use "Load More".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadMore = async () => {
    if (!lastVisible || !hasMore || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const logsCollectionRef = collection(db, "visitorInfoLogs");
      const q = query(
        logsCollectionRef,
        orderBy("timestamp", "desc"),
        startAfter(lastVisible),
        limit(ITEMS_PER_PAGE)
      );
      const querySnapshot = await getDocs(q);
      const newLogs = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as FirestoreVisitorInfoLog));
      
      setVisitorLogs(prevLogs => [...prevLogs, ...newLogs]);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null); // Handle empty snapshot
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching more visitor logs: ", error);
      toast({ title: "Error", description: "Could not fetch more logs.", variant: "destructive" });
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleClearAllLogs = async () => {
    setIsClearing(true);
    try {
      const logsCollectionRef = collection(db, "visitorInfoLogs");
      const querySnapshot = await getDocs(logsCollectionRef); // Get all documents
      
      if (querySnapshot.empty) {
        toast({ title: "No Logs", description: "There are no visitor logs to clear.", variant: "default" });
        setIsClearing(false);
        return;
      }

      // Firestore allows up to 500 operations in a single batch.
      // For very large collections, you might need to process in multiple batches.
      const batchArray: ReturnType<typeof writeBatch>[] = [];
      batchArray.push(writeBatch(db));
      let operationCount = 0;
      let batchIndex = 0;

      querySnapshot.docs.forEach((doc) => {
        batchArray[batchIndex].delete(doc.ref);
        operationCount++;
        if (operationCount === 499) { // Leave a little room, 500 is the limit
          batchArray.push(writeBatch(db));
          batchIndex++;
          operationCount = 0;
        }
      });

      for (const batch of batchArray) {
        await batch.commit();
      }

      setVisitorLogs([]);
      setLastVisible(null);
      setHasMore(false);
      toast({ title: "Logs Cleared", description: "All visitor logs have been successfully deleted." });
    } catch (error) {
      console.error("Error clearing visitor logs: ", error);
      toast({ title: "Error Clearing Logs", description: (error as Error).message || "Could not clear visitor logs.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-2xl flex items-center">
                <Globe2 className="mr-2 h-6 w-6 text-primary" /> Visitor Information Logs
              </CardTitle>
              <CardDescription>
                Recent website visitor geolocation and technical data. Data from ipapi.co.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button onClick={fetchInitialLogs} variant="outline" size="sm" disabled={isLoading || isFetchingMore || isClearing} className="w-full sm:w-auto">
                  <Loader2 className={`mr-2 h-4 w-4 ${isLoading && !isFetchingMore && !isClearing ? 'animate-spin' : 'hidden'}`} /> Refresh Logs
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isLoading || isFetchingMore || isClearing || visitorLogs.length === 0} className="w-full sm:w-auto">
                    {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                    Clear All Logs
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescriptionComponent>
                      This action will permanently delete ALL visitor logs. This cannot be undone.
                    </AlertDialogDescriptionComponent>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAllLogs} disabled={isClearing} className="bg-destructive hover:bg-destructive/90">
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
          {isLoading && visitorLogs.length === 0 ? ( // Show main loader only if initial load and no logs yet
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : visitorLogs.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No visitor logs recorded yet.</p>
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px]">Timestamp</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Postal</TableHead>
                  <TableHead>ISP</TableHead>
                  <TableHead>Path Visited</TableHead>
                  <TableHead className="min-w-[150px]">User Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitorLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground" title={formatDateForDisplay(log.timestamp)}>
                        {formatLogTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.ipAddress}</TableCell>
                    <TableCell className="text-xs">{log.city || 'N/A'}</TableCell>
                    <TableCell className="text-xs">{log.region || 'N/A'}</TableCell>
                    <TableCell className="text-xs">{log.countryName || 'N/A'}</TableCell>
                    <TableCell className="text-xs">{log.postalCode || 'N/A'}</TableCell>
                    <TableCell className="text-xs truncate max-w-[100px]" title={log.ispOrganization}>{log.ispOrganization || 'N/A'}</TableCell>
                    <TableCell className="text-xs truncate max-w-[150px]" title={log.pathname}>{log.pathname}</TableCell>
                    <TableCell className="text-xs truncate max-w-[150px]" title={log.userAgent}>{log.userAgent}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hasMore && (
                <div className="text-center mt-6">
                    <Button onClick={handleLoadMore} disabled={isFetchingMore || isLoading || isClearing}>
                        {isFetchingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Load More Logs
                    </Button>
                </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
       <Alert variant="default" className="mt-4 text-xs bg-muted/50">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <AlertDescription>
            <strong>Note:</strong> IP-based geolocation can have inaccuracies and is subject to privacy considerations.
            The "IP Address" shown is typically the visitor's public IP. Location data provided by <a href="https://ipapi.co/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">ipapi.co</a>.
            This log does not track logged-in user actions specifically; use the "User Activity Feed" for that.
          </AlertDescription>
        </Alert>
    </div>
  );
}

