
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PackageSearch, Check, X, MoreHorizontal, AlertTriangle, Eye, Trash2 } from "lucide-react";
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, runTransaction, getDoc, addDoc, deleteDoc } from "firebase/firestore";
import type { WithdrawalRequest, WithdrawalStatus, FirestoreNotification } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogDescription as DialogDescriptionComponent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getStatusBadgeVariant = (status: WithdrawalStatus) => {
    switch(status) {
      case 'pending': return 'secondary';
      case 'approved': return 'default';
      case 'processing': return 'default';
      case 'completed': return 'default';
      case 'rejected': return 'destructive';
      case 're_submit': return 'destructive';
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
      case 're_submit':
         return 'bg-yellow-500 hover:bg-yellow-600';
      default: return '';
    }
};

const DetailItem = ({ label, value }: { label: string, value?: string | null }) => (
    <div className="grid grid-cols-3 gap-2">
        <p className="text-sm text-muted-foreground col-span-1">{label}</p>
        <p className="text-sm font-semibold col-span-2">{value || 'N/A'}</p>
    </div>
);

export default function ProviderWithdrawalsPage() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [requestToActOn, setRequestToActOn] = useState<WithdrawalRequest | null>(null);
  const [actionType, setActionType] = useState<'rejected' | 're_submit' | null>(null);

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedRequestForDetails, setSelectedRequestForDetails] = useState<WithdrawalRequest | null>(null);


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
  
  const handleViewDetails = (request: WithdrawalRequest) => {
    setSelectedRequestForDetails(request);
    setDetailsModalOpen(true);
  };

  const openRejectionDialog = (request: WithdrawalRequest, action: 'rejected' | 're_submit') => {
    setRequestToActOn(request);
    setActionType(action);
    setRejectionReason(action === 're_submit' ? request.adminNotes || '' : '');
    setShowRejectionDialog(true);
  };

  const handleUpdateStatus = async (request: WithdrawalRequest, newStatus: WithdrawalStatus, reason?: string) => {
    if (!request.id) return;
    setIsUpdating(request.id);
    const userDocRef = doc(db, "users", request.providerId);
    const requestDocRef = doc(db, "withdrawalRequests", request.id);

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) throw new Error("Provider user not found.");

        const updatePayload: Partial<WithdrawalRequest> = { status: newStatus, processedAt: Timestamp.now() };
        let userUpdatePayload: Partial<{[key: string]: any}> = {};
        let notificationMessage = `Your withdrawal request of ₹${request.amount.toFixed(2)} has been updated to ${newStatus}.`;
        let notificationType: FirestoreNotification['type'] = 'info';

        if (newStatus === 'rejected' || newStatus === 're_submit') {
          updatePayload.adminNotes = reason;
          const newWalletBalance = (userDoc.data().withdrawableBalance || 0) + request.amount;
          userUpdatePayload = { withdrawableBalance: newWalletBalance, withdrawalPending: false }; // Refund and unlock
          notificationMessage = `Your withdrawal of ₹${request.amount.toFixed(2)} was ${newStatus === 'rejected' ? 'rejected' : 'sent back for re-submission'}. Reason: ${reason}. The amount has been refunded to your wallet.`;
          notificationType = newStatus === 'rejected' ? 'error' : 'warning';
        } else if (newStatus === 'completed') {
            userUpdatePayload = { withdrawalPending: false }; // Unlock for new requests
             notificationMessage = `Your withdrawal of ₹${request.amount.toFixed(2)} has been successfully completed.`;
            notificationType = 'success';
        }
        
        transaction.update(requestDocRef, updatePayload);
        if (Object.keys(userUpdatePayload).length > 0) {
            transaction.update(userDocRef, userUpdatePayload);
        }
        
        const notification: Omit<FirestoreNotification, 'id'> = {
            userId: request.providerId,
            title: `Withdrawal Request ${newStatus.replace(/_/g, ' ')}`,
            message: notificationMessage,
            type: notificationType,
            href: '/provider/withdrawal',
            read: false,
            createdAt: Timestamp.now(),
        };
        transaction.set(doc(collection(db, "userNotifications")), notification);
      });
      
      toast({ title: "Success", description: `Request status updated to ${newStatus}.` });
      if (newStatus === 'rejected' || newStatus === 're_submit') {
        setShowRejectionDialog(false);
        setRequestToActOn(null);
      }

    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update request.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!requestId) return;
    setIsUpdating(requestId);
    try {
        await deleteDoc(doc(db, "withdrawalRequests", requestId));
        toast({title: "Success", description: "Withdrawal request deleted."});
        // The onSnapshot listener will automatically update the UI.
    } catch (error) {
        toast({title: "Error", description: "Could not delete request.", variant: "destructive"});
    } finally {
        setIsUpdating(null);
    }
  };

  if (isLoading) {
    return <Card><CardContent className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Provider Withdrawal Requests</CardTitle>
          <CardDescription>Manage and process withdrawal requests from your service providers.</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No withdrawal requests received yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Details</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {requests.map(req => (
                   <TableRow key={req.id}>
                      <TableCell><div className="font-medium">{req.providerName}</div><div className="text-xs text-muted-foreground">{req.providerEmail}</div></TableCell>
                      <TableCell>₹{req.amount.toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{req.method.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => handleViewDetails(req)}>
                          <Eye className="mr-1 h-4 w-4" /> View
                        </Button>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(req.requestedAt)}</TableCell>
                      <TableCell><Badge variant={getStatusBadgeVariant(req.status)} className={`capitalize ${getStatusBadgeClass(req.status)}`}>{req.status.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="text-right">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" disabled={isUpdating === req.id}>
                                      {isUpdating === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <MoreHorizontal className="h-4 w-4"/>}
                                  </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                  {req.status === 'pending' && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleUpdateStatus(req, 'approved')}><Check className="mr-2 h-4 w-4"/>Approve</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openRejectionDialog(req, 're_submit')} className="text-yellow-600 focus:text-yellow-600"><AlertTriangle className="mr-2 h-4 w-4"/>Ask to Re-submit</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openRejectionDialog(req, 'rejected')} className="text-destructive focus:text-destructive focus:bg-destructive/10"><X className="mr-2 h-4 w-4"/>Reject</DropdownMenuItem>
                                  </>
                                  )}
                                  {req.status === 'approved' && <DropdownMenuItem onClick={() => handleUpdateStatus(req, 'processing')}><Loader2 className="mr-2 h-4 w-4"/>Mark as Processing</DropdownMenuItem>}
                                  {req.status === 'processing' && <DropdownMenuItem onClick={() => handleUpdateStatus(req, 'completed')}><Check className="mr-2 h-4 w-4"/>Mark as Completed</DropdownMenuItem>}
                                  <DropdownMenuSeparator />
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4"/>Delete Request</DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                            <AlertDialogDescription>This will permanently delete the withdrawal request from {req.providerName}. This action cannot be undone.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteRequest(req.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
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
      
      <AlertDialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionType === 'rejected' ? 'Reject' : 'Request Re-submission'}</AlertDialogTitle>
            <AlertDialogDescription>Please provide a reason. This will be sent to the provider and the amount will be refunded to their wallet.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="rejection-reason">Reason for {actionType === 'rejected' ? 'Rejection' : 'Re-submission'}</Label>
            <Textarea id="rejection-reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="e.g., Bank details incorrect. Please verify and submit again."/>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(requestToActOn) handleUpdateStatus(requestToActOn, actionType!, rejectionReason)}} disabled={!rejectionReason.trim()} className="bg-destructive hover:bg-destructive/90">Confirm Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Withdrawal Request Details</DialogTitle>
                <DialogDescriptionComponent>
                    Request from: <span className="font-semibold">{selectedRequestForDetails?.providerName}</span>
                </DialogDescriptionComponent>
            </DialogHeader>
            <div className="space-y-4 py-2">
                <DetailItem label="Amount" value={`₹${selectedRequestForDetails?.amount.toFixed(2)}`} />
                <DetailItem label="Method" value={selectedRequestForDetails?.method.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} />
                <Separator />
                <h4 className="font-semibold text-sm">Account Details</h4>
                {selectedRequestForDetails?.method === 'bank_transfer' ? (
                    <>
                        <DetailItem label="Account Holder" value={selectedRequestForDetails.details.accountHolderName} />
                        <DetailItem label="Bank Name" value={selectedRequestForDetails.details.bankName} />
                        <DetailItem label="Account Number" value={selectedRequestForDetails.details.accountNumber} />
                        <DetailItem label="IFSC Code" value={selectedRequestForDetails.details.ifscCode} />
                    </>
                ) : selectedRequestForDetails?.method === 'upi' ? (
                    <DetailItem label="UPI ID" value={selectedRequestForDetails.details.upiId} />
                ) : (
                    <DetailItem label="Email" value={selectedRequestForDetails?.details.email} />
                )}
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="secondary">Close</Button>
                </DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
