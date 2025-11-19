
"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { Eye, Check, Trash2, Loader2, PackageSearch, Construction, MoreHorizontal, Phone } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import type { CustomServiceRequest, CustomRequestStatus } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter as AlertDialogFooterComponent, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComponent, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import Image from 'next/image';

const formatDate = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getStatusBadgeVariant = (status: CustomRequestStatus) => {
    switch (status) {
      case 'new': return 'destructive';
      case 'reviewed': return 'secondary';
      case 'contacted': return 'default';
      case 'closed': return 'outline';
      default: return 'outline';
    }
};

// --- Modal Component Logic ---
const DetailItem = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div>
    <p className="text-sm font-medium text-muted-foreground">{label}</p>
    <p className="text-base text-foreground">{value || "N/A"}</p>
  </div>
);

const CustomRequestDetailsModal = ({ isOpen, onClose, request }: { isOpen: boolean; onClose: () => void; request: CustomServiceRequest | null; }) => {
  if (!request) return null;

  const budgetDisplay = (request.minBudget != null && request.maxBudget != null) 
    ? `₹${request.minBudget} - ₹${request.maxBudget}` 
    : 'Not specified';

  const formatModalDate = (timestamp?: Timestamp): string => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[90vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-6 border-b flex-shrink-0">
          <DialogTitle className="text-xl sm:text-2xl">{request.serviceTitle}</DialogTitle>
          <DialogDescription>Submitted by {request.userName || "Guest"} on {formatDate(request.submittedAt)}</DialogDescription>
        </DialogHeader>
        
        {/* The fix is to make this middle div grow and handle its own overflow */}
        <div className="flex-grow overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DetailItem label="Customer Name" value={request.userName} />
                <DetailItem label="Category" value={request.categoryName || request.customCategory} />
                <DetailItem label="Customer Email" value={request.userEmail} />
                <DetailItem label="Customer Mobile" value={request.userMobile} />
                <DetailItem label="Preferred Start Date" value={formatDate(request.preferredStartDate)} />
                <DetailItem label="Budget" value={budgetDisplay} />
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="text-base text-foreground whitespace-pre-wrap mt-1">{request.description}</p>
            </div>
            
            {request.imageUrls && request.imageUrls.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Uploaded Images</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {request.imageUrls.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded-md overflow-hidden border">
                      <Image src={url} alt={`Request image ${index + 1}`} fill sizes="150px" className="object-cover hover:scale-105 transition-transform" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-6 border-t bg-muted/50 flex-shrink-0">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// --- Page Component Logic ---
export default function CustomServiceAdminPage() {
  const [requests, setRequests] = useState<CustomServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<CustomServiceRequest | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    const requestsRef = collection(db, "customServiceRequests");
    const q = query(requestsRef, orderBy("submittedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomServiceRequest)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching custom service requests:", error);
      toast({ title: "Error", description: "Could not fetch requests.", variant: "destructive" });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [toast]);

  const handleViewDetails = (request: CustomServiceRequest) => {
    setSelectedRequest(request);
    setIsDetailsModalOpen(true);
  };
  
  const handleUpdateStatus = async (requestId: string, newStatus: CustomRequestStatus) => {
    if (!requestId) return;
    setIsUpdating(requestId);
    try {
      await updateDoc(doc(db, "customServiceRequests", requestId), { status: newStatus });
      toast({ title: "Status Updated", description: `Request marked as ${newStatus}.` });
    } catch (error) {
      toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!requestId) return;
    setIsUpdating(requestId);
    try {
      await deleteDoc(doc(db, "customServiceRequests", requestId));
      toast({ title: "Request Deleted", description: "The custom service request has been removed." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete request.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Custom Service Requests</CardTitle></CardHeader>
        <CardContent className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Construction className="mr-2 h-6 w-6 text-primary" /> Custom Service Requests
          </CardTitle>
          <CardDescription>
            View and manage custom service requests submitted by users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No custom service requests found yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Submitted On</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.serviceTitle}</TableCell>
                    <TableCell>{req.categoryName || req.customCategory || "N/A"}</TableCell>
                    <TableCell>
                      <div>{req.userName || "Guest"}</div>
                      <div className="text-xs text-muted-foreground">{req.userEmail || req.userMobile}</div>
                    </TableCell>
                    <TableCell>{formatDate(req.submittedAt)}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(req.status)} className="capitalize">{req.status}</Badge></TableCell>
                    <TableCell className="text-right">
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isUpdating === req.id}>
                            {isUpdating === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <MoreHorizontal className="h-4 w-4"/>}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                           <DropdownMenuItem onClick={() => handleViewDetails(req)}>
                              <Eye className="mr-2 h-4 w-4" /> View Details
                           </DropdownMenuItem>
                           {req.status !== 'reviewed' && <DropdownMenuItem onClick={() => handleUpdateStatus(req.id!, 'reviewed')}><Check className="mr-2 h-4 w-4"/> Mark as Reviewed</DropdownMenuItem>}
                           {req.status !== 'contacted' && <DropdownMenuItem onClick={() => handleUpdateStatus(req.id!, 'contacted')}><Phone className="mr-2 h-4 w-4"/> Mark as Contacted</DropdownMenuItem>}
                           {req.status !== 'closed' && <DropdownMenuItem onClick={() => handleUpdateStatus(req.id!, 'closed')}><Check className="mr-2 h-4 w-4"/> Mark as Closed</DropdownMenuItem>}
                           <DropdownMenuSeparator />
                           <AlertDialog>
                            <AlertDialogTrigger asChild>
                               <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4"/> Delete</DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitleComponent>Confirm Deletion</AlertDialogTitleComponent>
                                <AlertDialogDescriptionComponent>This will permanently delete the request "{req.serviceTitle}".</AlertDialogDescriptionComponent>
                              </AlertDialogHeader>
                              <AlertDialogFooterComponent>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteRequest(req.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooterComponent>
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
      
      {selectedRequest && (
        <CustomRequestDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          request={selectedRequest}
        />
      )}
    </div>
  );
}
    
