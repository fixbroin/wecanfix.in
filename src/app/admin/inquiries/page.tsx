
"use client";

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from '@/components/ui/badge';
import { Mail, MessageCircle, Phone, User, Edit, Trash2, CheckCircle, PackageSearch, Loader2, Send, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import type { FirestoreContactUsInquiry, FirestorePopupInquiry, InquiryStatus, AppSettings } from '@/types/firestore'; // Added AppSettings
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/useAuth';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { sendInquiryReplyEmail, type InquiryReplyEmailInput } from '@/ai/flows/sendInquiryReplyEmailFlow'; // Import Genkit flow
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; // Import app config hook

type Inquiry = FirestoreContactUsInquiry | FirestorePopupInquiry;
type InquiryType = 'contact' | 'popup';

const formatTimestamp = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return timestamp.toDate().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function AdminInquiriesPage() {
  const [contactInquiries, setContactInquiries] = useState<FirestoreContactUsInquiry[]>([]);
  const [popupInquiries, setPopupInquiries] = useState<FirestorePopupInquiry[]>([]);
  const [isLoadingContact, setIsLoadingContact] = useState(true);
  const [isLoadingPopup, setIsLoadingPopup] = useState(true);

  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);
  const [selectedInquiryForReply, setSelectedInquiryForReply] = useState<Inquiry | null>(null);
  const [selectedInquiryType, setSelectedInquiryType] = useState<InquiryType | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const { toast } = useToast();
  const { user: adminUser } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig(); // Get app config

  useEffect(() => {
    const contactRef = collection(db, "contactUsSubmissions");
    const qContact = query(contactRef, orderBy("submittedAt", "desc"));
    const unsubContact = onSnapshot(qContact, (snapshot) => {
      setContactInquiries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreContactUsInquiry)));
      setIsLoadingContact(false);
    }, (error) => { console.error("Error fetching contact inquiries:", error); setIsLoadingContact(false); });

    const popupRef = collection(db, "popupSubmissions");
    const qPopup = query(popupRef, orderBy("submittedAt", "desc"));
    const unsubPopup = onSnapshot(qPopup, (snapshot) => {
      setPopupInquiries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestorePopupInquiry)));
      setIsLoadingPopup(false);
    }, (error) => { console.error("Error fetching popup inquiries:", error); setIsLoadingPopup(false); });

    return () => { unsubContact(); unsubPopup(); };
  }, []);

  const handleOpenReplyDialog = (inquiry: Inquiry, type: InquiryType) => {
    setSelectedInquiryForReply(inquiry);
    setSelectedInquiryType(type);
    setReplyMessage(inquiry.replyMessage || "");
    setIsReplyDialogOpen(true);
  };

  const handleSendReply = async () => {
    if (!selectedInquiryForReply || !selectedInquiryType || !adminUser?.uid || !selectedInquiryForReply.id || !selectedInquiryForReply.email) {
      toast({ title: "Error", description: "Missing inquiry data or user email for reply.", variant: "destructive" });
      return;
    }
    setIsSubmittingReply(true);
    const collectionName = selectedInquiryType === 'contact' ? "contactUsSubmissions" : "popupSubmissions";
    const inquiryDocRef = doc(db, collectionName, selectedInquiryForReply.id);
    
    try {
      await updateDoc(inquiryDocRef, {
        replyMessage: replyMessage,
        repliedAt: Timestamp.now(),
        repliedByAdminUid: adminUser.uid,
        status: 'replied' as InquiryStatus,
      });
      toast({ title: "Reply Saved", description: "Your reply has been saved to Firestore." });

      // Prepare and send email using Genkit flow
      const originalMessageSummary = selectedInquiryType === 'contact' 
        ? (selectedInquiryForReply as FirestoreContactUsInquiry).message 
        : `Popup: ${(selectedInquiryForReply as FirestorePopupInquiry).popupName} - Data: ${JSON.stringify((selectedInquiryForReply as FirestorePopupInquiry).formData || {})}`;

      const emailInput: InquiryReplyEmailInput = {
        inquiryId: selectedInquiryForReply.id,
        inquiryType: selectedInquiryType,
        userName: selectedInquiryForReply.name || "Valued User",
        userEmail: selectedInquiryForReply.email,
        originalMessage: originalMessageSummary,
        replyMessage: replyMessage,
        adminName: adminUser.displayName || "Wecanfix Support",
        smtpHost: appConfig.smtpHost,
        smtpPort: appConfig.smtpPort,
        smtpUser: appConfig.smtpUser,
        smtpPass: appConfig.smtpPass,
        senderEmail: appConfig.senderEmail,
      };

      const emailResult = await sendInquiryReplyEmail(emailInput);
      if (emailResult.success) {
        toast({ title: "Email Sent", description: "Reply email sent to the user." });
      } else {
        toast({ title: "Email Failed", description: emailResult.message || "Could not send reply email. Check logs.", variant: "destructive", duration: 7000 });
      }

      setIsReplyDialogOpen(false);
      setReplyMessage("");
      setSelectedInquiryForReply(null);
    } catch (error) {
      console.error("Error sending reply:", error);
      toast({ title: "Error", description: "Could not save reply or send email.", variant: "destructive" });
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleMarkAsResolved = async (inquiryId: string, type: InquiryType) => {
    const collectionName = type === 'contact' ? "contactUsSubmissions" : "popupSubmissions";
    const inquiryDocRef = doc(db, collectionName, inquiryId);
    try {
      await updateDoc(inquiryDocRef, { status: 'resolved' as InquiryStatus, updatedAt: Timestamp.now() });
      toast({ title: "Inquiry Resolved", description: "Marked as resolved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    }
  };
  
  const handleDeleteInquiry = async (inquiryId: string, type: InquiryType) => {
    const collectionName = type === 'contact' ? "contactUsSubmissions" : "popupSubmissions";
    const inquiryDocRef = doc(db, collectionName, inquiryId);
    try {
      await deleteDoc(inquiryDocRef);
      toast({ title: "Inquiry Deleted", description: "The inquiry has been removed." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete inquiry.", variant: "destructive" });
    }
  };

  const renderInquiriesTable = (inquiries: Inquiry[], type: InquiryType, isLoadingTable: boolean) => {
    if (isLoadingTable || isLoadingAppSettings) {
      return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading inquiries...</span></div>;
    }
    if (inquiries.length === 0) {
      return <div className="text-center py-10"><PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No inquiries found in this category.</p></div>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Submitter Info</TableHead>
            <TableHead>Content</TableHead>
            <TableHead>Submitted At</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inquiries.map((inquiry) => (
            <TableRow key={inquiry.id}>
              <TableCell className="text-xs">
                <div className="font-medium flex items-center"><User size={14} className="mr-1 text-muted-foreground"/>{inquiry.name || "N/A"}</div>
                {inquiry.email && <div className="text-muted-foreground flex items-center mt-0.5"><Mail size={14} className="mr-1"/>{inquiry.email}</div>}
                {inquiry.phone && <div className="text-muted-foreground flex items-center mt-0.5"><Phone size={14} className="mr-1"/>{inquiry.phone}</div>}
                {type === 'popup' && (inquiry as FirestorePopupInquiry).popupName && (
                    <div className="text-muted-foreground text-[10px] mt-0.5">
                        Popup: {(inquiry as FirestorePopupInquiry).popupName} ({(inquiry as FirestorePopupInquiry).popupType})
                    </div>
                )}
              </TableCell>
              <TableCell className="text-xs max-w-sm truncate" title={inquiry.message || JSON.stringify((inquiry as FirestorePopupInquiry).formData)}>
                {inquiry.message || (type === 'popup' ? `Form Data: ${Object.entries((inquiry as FirestorePopupInquiry).formData || {}).map(([k,v]) => `${k}: ${v}`).join(', ')}` : 'N/A')}
              </TableCell>
              <TableCell className="text-xs">{formatTimestamp(inquiry.submittedAt)}</TableCell>
              <TableCell>
                <Badge variant={
                  inquiry.status === 'new' ? 'destructive' :
                  inquiry.status === 'replied' ? 'secondary' :
                  inquiry.status === 'resolved' ? 'default' : 'outline'
                } className="text-[10px] capitalize">
                  {inquiry.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenReplyDialog(inquiry, type)} disabled={isSubmittingReply || isLoadingAppSettings}><Edit className="h-3 w-3 mr-1"/>Reply</Button>
                  {inquiry.status !== 'resolved' && (
                    <Button variant="ghost" size="sm" onClick={() => handleMarkAsResolved(inquiry.id!, type)}><CheckCircle className="h-3 w-3 mr-1 text-green-600"/>Resolve</Button>
                  )}
                  <AlertDialog>
                      <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                          <AlertDialogHeader>
                              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                              <AlertDialogDescription>
                                  Are you sure you want to delete this inquiry from {inquiry.name || inquiry.email}? This action cannot be undone.
                              </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteInquiry(inquiry.id!, type)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                      </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Mail className="mr-2 h-6 w-6 text-primary"/>User Inquiries</CardTitle>
          <CardDescription>Manage inquiries submitted through contact forms and popups.</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="contact_us">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="contact_us">Contact Us Inquiries ({contactInquiries.filter(i => i.status === 'new').length} new)</TabsTrigger>
          <TabsTrigger value="popup_submissions">Popup Submissions ({popupInquiries.filter(i => i.status === 'new').length} new)</TabsTrigger>
        </TabsList>
        <TabsContent value="contact_us">
          <Card>
            <CardHeader><CardTitle>Contact Form Submissions</CardTitle></CardHeader>
            <CardContent>{renderInquiriesTable(contactInquiries, 'contact', isLoadingContact)}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="popup_submissions">
          <Card>
            <CardHeader><CardTitle>Newsletter & Popup Submissions</CardTitle></CardHeader>
            <CardContent>{renderInquiriesTable(popupInquiries, 'popup', isLoadingPopup)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isReplyDialogOpen} onOpenChange={setIsReplyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reply to Inquiry</DialogTitle>
            <DialogDescription>
              Replying to: {selectedInquiryForReply?.name || selectedInquiryForReply?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="text-sm p-3 border rounded-md bg-muted/50 max-h-32 overflow-y-auto">
                <p className="font-semibold">Original Message/Data:</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {selectedInquiryType === 'contact' 
                    ? (selectedInquiryForReply as FirestoreContactUsInquiry)?.message 
                    : JSON.stringify((selectedInquiryForReply as FirestorePopupInquiry)?.formData || {}, null, 2)}
                </p>
            </div>
            <Textarea
              placeholder="Type your reply here..."
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              rows={5}
              disabled={isSubmittingReply}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={isSubmittingReply}>Cancel</Button></DialogClose>
            <Button onClick={handleSendReply} disabled={isSubmittingReply || !replyMessage.trim() || isLoadingAppSettings}>
              {isSubmittingReply ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
              Save & Send Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

    