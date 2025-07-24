
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, Loader2, Megaphone, CheckCircle, XCircle, Eye } from "lucide-react";
import type { FirestorePopup } from '@/types/firestore';
import PopupForm from '@/components/admin/PopupForm';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, query, Timestamp } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';

const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");

export default function AdminNewsletterPopupsPage() {
  const [popups, setPopups] = useState<FirestorePopup[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPopup, setEditingPopup] = useState<FirestorePopup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const popupsCollectionRef = collection(db, "adminPopups");

  const fetchPopups = async () => {
    setIsLoading(true);
    try {
      const q = query(popupsCollectionRef, orderBy("createdAt", "desc"));
      const data = await getDocs(q);
      const fetchedPopups = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestorePopup));
      setPopups(fetchedPopups);
    } catch (error) {
      console.error("Error fetching popups: ", error);
      toast({ title: "Error", description: "Could not fetch popups.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPopups();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddPopup = () => {
    setEditingPopup(null);
    setIsFormOpen(true);
  };

  const handleEditPopup = (popup: FirestorePopup) => {
    setEditingPopup(popup);
    setIsFormOpen(true);
  };

  const handleDeletePopup = async (popupId: string) => {
    setIsSubmitting(true);
    try {
      const popupDoc = await getDoc(doc(db, "adminPopups", popupId));
      const popupData = popupDoc.data() as FirestorePopup | undefined;

      // Delete associated image from Firebase Storage if it's a Firebase URL
      if (popupData?.imageUrl && isFirebaseStorageUrl(popupData.imageUrl)) {
        try {
          const imageToDeleteRef = storageRef(storage, popupData.imageUrl);
          await deleteObject(imageToDeleteRef);
        } catch (imgError: any) {
          console.warn("Error deleting image from Firebase Storage during popup delete:", imgError);
        }
      }
      // Delete associated image from local /public/uploads (if applicable) via API
      else if (popupData?.imageUrl && popupData.imageUrl.startsWith('/uploads/')) {
        try {
          const response = await fetch('/api/delete-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: popupData.imageUrl }),
          });
          if (!response.ok) {
            const errorResult = await response.json();
            console.warn(`Failed to delete local image ${popupData.imageUrl}: ${errorResult.error}`);
          }
        } catch (apiError) {
            console.warn(`Error calling API to delete local image ${popupData.imageUrl}:`, apiError);
        }
      }

      await deleteDoc(doc(db, "adminPopups", popupId));
      setPopups(popups.filter(p => p.id !== popupId));
      toast({ title: "Success", description: "Popup deleted successfully." });
    } catch (error: any) {
      console.error("Error deleting popup: ", error);
      if (error.message && (error.message.includes('offline') || error.message.includes('unavailable'))) {
        toast({
          title: "Network Error",
          description: "Could not delete popup. The application appears to be offline or unable to reach Firebase. Please check your internet connection and try again.",
          variant: "destructive",
          duration: 7000,
        });
      } else {
        toast({ title: "Error", description: "Could not delete popup. " + (error.message || ""), variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleToggleActive = async (popup: FirestorePopup) => {
    setIsSubmitting(true);
    try {
      const popupDocRef = doc(db, "adminPopups", popup.id);
      await updateDoc(popupDocRef, { isActive: !popup.isActive, updatedAt: Timestamp.now() });
      await fetchPopups();
      toast({ title: "Status Updated", description: `Popup "${popup.name}" ${!popup.isActive ? "activated" : "deactivated"}.`});
    } catch (error: any) {
        console.error("Error toggling popup status:", error);
        if (error.message && (error.message.includes('offline') || error.message.includes('unavailable'))) {
           toast({
            title: "Network Error",
            description: "Could not update popup status. The application appears to be offline. Please check your internet connection.",
            variant: "destructive",
            duration: 7000,
          });
        } else {
          toast({ title: "Error", description: "Could not update popup status.", variant: "destructive" });
        }
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestorePopup, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    setIsSubmitting(true);
    const payload: Omit<FirestorePopup, 'id' | 'createdAt' | 'updatedAt'> & {displayRuleValue?: number | null} = {
      name: data.name,
      popupType: data.popupType,
      title: data.title || "",
      displayText: data.displayText || "",
      imageUrl: data.imageUrl || "",
      imageHint: data.imageHint || "",
      videoUrl: data.videoUrl || "",
      showEmailInput: data.showEmailInput,
      showNameInput: data.showNameInput || false,
      showMobileInput: data.showMobileInput || false,
      promoCode: data.promoCode || "",
      promoCodeConditionFieldsRequired: data.promoCodeConditionFieldsRequired ?? 0,
      targetUrl: data.targetUrl || "",
      displayRuleType: data.displayRuleType,
      displayRuleValue: data.displayRuleValue === undefined || data.displayRuleValue === null ? null : data.displayRuleValue,
      displayFrequency: data.displayFrequency,
      showCloseButton: data.showCloseButton,
      isActive: data.isActive,
    };
    
    const firestorePayload: any = { ...payload };
    if (firestorePayload.displayRuleValue === null || firestorePayload.displayRuleValue === undefined) {
        delete firestorePayload.displayRuleValue;
    }


    try {
      if (data.id) { 
        const popupDoc = doc(db, "adminPopups", data.id);
        await updateDoc(popupDoc, { ...firestorePayload, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Popup updated successfully." });
      } else { 
        await addDoc(popupsCollectionRef, { ...firestorePayload, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "Popup added successfully." });
      }
      setIsFormOpen(false);
      setEditingPopup(null);
      await fetchPopups(); 
    } catch (error: any) {
      console.error("Error saving popup: ", error);
      if (error.message && (error.message.includes('offline') || error.message.includes('unavailable'))) {
         toast({
            title: "Network Error",
            description: "Could not save popup. The application appears to be offline. Please check your internet connection.",
            variant: "destructive",
            duration: 7000,
          });
      } else {
        toast({ title: "Error", description: (error as Error).message || "Could not save popup.", variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><Megaphone className="mr-2 h-6 w-6 text-primary" />Newsletter & Marketing Popups</CardTitle>
            <CardDescription>Manage various popups for your website to engage users and promote offers.</CardDescription>
          </div>
          <Button onClick={handleAddPopup} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Popup
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading popups...</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name (Internal)</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popups.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No popups configured yet.</TableCell></TableRow>
                ) : (
                  popups.map((popup) => (
                    <TableRow key={popup.id}>
                      <TableCell className="font-medium">{popup.name}</TableCell>
                      <TableCell><Badge variant="secondary">{popup.popupType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate" title={popup.title}>{popup.title || "N/A"}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={popup.isActive} onCheckedChange={() => handleToggleActive(popup)} disabled={isSubmitting} aria-label={`Toggle active status for ${popup.name}`} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          <Button variant="outline" size="icon" onClick={() => handleEditPopup(popup)} disabled={isSubmitting}><Edit className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the popup "{popup.name}".</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePopup(popup.id)} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingPopup(null); } }}>
        <DialogContent className="w-[90vw] max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-6 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle>{editingPopup ? 'Edit Popup' : 'Add New Popup'}</DialogTitle>
            <DialogDescription>{editingPopup ? 'Update configuration for this popup.' : 'Fill in details to create a new website popup.'}</DialogDescription>
          </DialogHeader>
          <PopupForm onSubmit={handleFormSubmit} initialData={editingPopup} onCancel={() => { setIsFormOpen(false); setEditingPopup(null); }} isSubmitting={isSubmitting} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

    
