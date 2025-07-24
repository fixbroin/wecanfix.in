
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PackageSearch, Check, X, MoreHorizontal } from "lucide-react";
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, runTransaction, getDoc, addDoc } from "firebase/firestore";
import type { WithdrawalRequest, WithdrawalStatus, FirestoreNotification } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function WithdrawalRequestsTab() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    const requestsRef = collection(db, "withdrawalRequests");
    const q = query(requestsRef, orderBy("requestedAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WithdrawalRequest)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching withdrawal requests:", error);
      toast({ title: "Error", description: "Could not load requests.", variant: "destructive" });
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [toast]);

  const handleUpdateStatus = async (request: WithdrawalRequest, newStatus: WithdrawalStatus) => {
    if (!request.id) return;
    setIsUpdating(request.id);
    const userDocRef = doc(db, "users", request.userId);
    const requestDocRef = doc(db, "withdrawalRequests", request.id);

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) throw new Error("User not found.");

        const updatePayload: Partial<WithdrawalRequest> = { status: newStatus, processedAt: Timestamp.now() };
        let userUpdatePayload: Partial<{[key: string]: any}> = {};
        let notificationMessage = `Your withdrawal request of ₹${request.amount.toFixed(2)} has been updated to ${newStatus}.`;
        let notificationType: FirestoreNotification['type'] = 'info';

        switch (newStatus) {
          case 'rejected':
            const newWalletBalance = (userDoc.data().walletBalance || 0) + request.amount;
            userUpdatePayload = { walletBalance: newWalletBalance, withdrawalPending: false };
            notificationMessage = `Your withdrawal request of ₹${request.amount.toFixed(2)} was rejected. The amount has been refunded to your wallet.`;
            notificationType = 'error';
            break;
          case 'completed':
            userUpdatePayload = { withdrawalPending: false }; // Unlock for new requests
            notificationMessage = `Your withdrawal of ₹${request.amount.toFixed(2)} has been successfully completed.`;
            notificationType = 'success';
            break;
          case 'approved':
          case 'processing':
            // No change to user doc for these intermediate states
            break;
        }

        // Update the request document
        transaction.update(requestDocRef, updatePayload);
        
        // Update the user document if there are changes
        if (Object.keys(userUpdatePayload).length > 0) {
            transaction.update(userDocRef, userUpdatePayload);
        }
        
        // Create notification for user
        const notification: Omit<FirestoreNotification, 'id'> = {
            userId: request.userId,
            title: `Withdrawal Request ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
            message: notificationMessage,
            type: notificationType,
            href: '/referral?tab=withdraw',
            read: false,
            createdAt: Timestamp.now(),
        };
        transaction.set(doc(collection(db, "userNotifications")), notification);
      });
      
      toast({ title: "Success", description: `Request status updated to ${newStatus}.` });

    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update request.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };


  const getStatusBadgeVariant = (status: WithdrawalStatus) => {
    switch(status) {
      case 'pending': return 'secondary';
      case 'approved': return 'default';
      case 'processing': return 'default';
      case 'completed': return 'default';
      case 'rejected': return 'destructive';
      default: return 'outline';
    }
  };
  
  const getStatusBadgeClass = (status: WithdrawalStatus) => {
     switch(status) {
      case 'approved':
      case 'completed':
        return 'bg-green-500 hover:bg-green-600';
      case 'processing':
         return 'bg-blue-500 hover:bg-blue-600';
      default: return '';
    }
  }

  if (isLoading) {
    return <Card><CardContent className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Withdrawal Requests</CardTitle>
        <CardDescription>Manage user requests to withdraw their referral earnings.</CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No withdrawal requests received yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Details</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {requests.map(req => (
                 <TableRow key={req.id}>
                    <TableCell><div className="font-medium">{req.userName}</div><div className="text-xs text-muted-foreground">{req.userEmail}</div></TableCell>
                    <TableCell>₹{req.amount.toFixed(2)}</TableCell>
                    <TableCell className="capitalize">{req.method.replace('_', ' ')}</TableCell>
                    <TableCell className="text-xs">{Object.values(req.details).join(', ')}</TableCell>
                    <TableCell className="text-xs">{formatDate(req.requestedAt)}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(req.status)} className={`capitalize ${getStatusBadgeClass(req.status)}`}>{req.status}</Badge></TableCell>
                    <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" disabled={isUpdating === req.id || req.status === 'completed' || req.status === 'rejected'}>
                                    {isUpdating === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <MoreHorizontal className="h-4 w-4"/>}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                {req.status === 'pending' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(req, 'approved')}><Check className="mr-2 h-4 w-4"/>Approve</DropdownMenuItem>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10"><X className="mr-2 h-4 w-4"/>Reject</DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Confirm Rejection</AlertDialogTitle><AlertDialogDescription>This will reject the request and refund ₹{req.amount.toFixed(2)} to the user's wallet. Are you sure?</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleUpdateStatus(req, 'rejected')} className="bg-destructive hover:bg-destructive/90">Yes, Reject & Refund</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                                )}
                                {req.status === 'approved' && <DropdownMenuItem onClick={() => handleUpdateStatus(req, 'processing')}><Loader2 className="mr-2 h-4 w-4"/>Mark as Processing</DropdownMenuItem>}
                                {req.status === 'processing' && <DropdownMenuItem onClick={() => handleUpdateStatus(req, 'completed')}><Check className="mr-2 h-4 w-4"/>Mark as Completed</DropdownMenuItem>}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                 </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
