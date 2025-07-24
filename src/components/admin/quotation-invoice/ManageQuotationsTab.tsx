
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Edit, Trash2, PackageSearch, AlertTriangle, FileText, MoreHorizontal, Send, Download } from "lucide-react";
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, Timestamp, getDoc } from "firebase/firestore";
import type { FirestoreQuotation, QuotationStatus, CompanyDetailsForPdf } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { generateQuotationPdf } from '@/lib/quotationGenerator';
import { uploadPdfToStorage, triggerPdfDownload, dataUriToBlob } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

interface ManageQuotationsTabProps {
  onEditQuotation: (quotation: FirestoreQuotation) => void;
}

const quotationStatusOptions: QuotationStatus[] = ['Draft', 'Sent', 'Accepted', 'Rejected', 'ConvertedToInvoice'];

export default function ManageQuotationsTab({ onEditQuotation }: ManageQuotationsTabProps) {
  const [quotations, setQuotations] = useState<FirestoreQuotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null); // For status updates or delete
  const [isSending, setIsSending] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const { toast } = useToast();
  const { settings: companySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();

  useEffect(() => {
    setIsLoading(true);
    const quotationsCollectionRef = collection(db, "quotations");
    const q = query(quotationsCollectionRef, orderBy("quotationDate", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedQuotations = querySnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as FirestoreQuotation));
      setQuotations(fetchedQuotations);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching quotations: ", error);
      toast({ title: "Error", description: "Could not fetch quotations.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleDeleteQuotation = async (quotationId: string) => {
    if (!quotationId) return;
    setIsUpdating(quotationId);
    try {
      await deleteDoc(doc(db, "quotations", quotationId));
      toast({ title: "Success", description: "Quotation deleted successfully." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not delete quotation.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateStatus = async (quotationId: string, newStatus: QuotationStatus) => {
    if (!quotationId) return;
    setIsUpdating(quotationId);
    try {
      await updateDoc(doc(db, "quotations", quotationId), {
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
      toast({ title: "Success", description: `Quotation status updated to ${newStatus}.` });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update quotation status.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };
  
  const handleSendQuotation = async (quotation: FirestoreQuotation) => {
    if (!quotation.id) return;
    setIsSending(quotation.id);
    try {
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "FixBro",
        address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "",
        contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
      };

      const pdfDataUri = await generateQuotationPdf(quotation, companyInfo);
      const pdfBlob = dataUriToBlob(pdfDataUri);
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.");
      
      const storagePath = `quotations_pdf/${quotation.id}_${quotation.quotationNumber}.pdf`;
      const downloadUrl = await uploadPdfToStorage(pdfBlob, storagePath);
      
      await updateDoc(doc(db, "quotations", quotation.id), { status: 'Sent', updatedAt: Timestamp.now() });

      toast({
        duration: 10000,
        title: "Quotation Ready to Share",
        description: (
          <div>
            <p>Status updated to 'Sent'.</p>
            <p>Shareable URL: <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{downloadUrl}</a></p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard.writeText(downloadUrl).then(() => toast({description: "URL Copied!"}))}>Copy URL</Button>
          </div>
        ),
      });
    } catch (error) {
      console.error("Error sending quotation:", error);
      toast({ title: "Error Sending", description: (error as Error).message || "Could not send quotation.", variant: "destructive" });
    } finally {
      setIsSending(null);
    }
  };

  const handleDownloadPdf = async (quotation: FirestoreQuotation) => {
    if (!quotation.id) return;
    setIsDownloading(quotation.id);
    try {
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "FixBro",
        address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "",
        contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
      };
      const pdfDataUri = await generateQuotationPdf(quotation, companyInfo);
      triggerPdfDownload(pdfDataUri, `Quotation-${quotation.quotationNumber}.pdf`);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast({ title: "Error Downloading", description: (error as Error).message || "Could not download PDF.", variant: "destructive" });
    } finally {
      setIsDownloading(null);
    }
  };

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  
  const getStatusBadgeVariant = (status: QuotationStatus) => {
    switch (status) {
      case 'Draft': return 'secondary';
      case 'Sent': return 'outline';
      case 'Accepted': return 'default'; // Primary color
      case 'Rejected': return 'destructive';
      case 'ConvertedToInvoice': return 'default'; // Similar to accepted
      default: return 'outline';
    }
  };


  if (isLoading || isLoadingCompanySettings) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-2">Loading quotations...</span></div>;
  }

  if (quotations.length === 0) {
    return (
      <div className="text-center py-10">
        <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No quotations found yet.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Quotations</CardTitle>
        <CardDescription>View, edit, and manage existing customer quotations.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quotation #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotations.map((quotation) => (
              <TableRow key={quotation.id}>
                <TableCell className="font-medium text-xs">{quotation.quotationNumber}</TableCell>
                <TableCell>{quotation.customerName}</TableCell>
                <TableCell>{formatDate(quotation.quotationDate)}</TableCell>
                <TableCell className="text-right">{quotation.totalAmount.toFixed(2)}</TableCell>
                <TableCell>
                  <Select
                    value={quotation.status}
                    onValueChange={(newStatus) => handleUpdateStatus(quotation.id!, newStatus as QuotationStatus)}
                    disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}
                  >
                    <SelectTrigger className="h-8 text-xs min-w-[100px] sm:min-w-[120px]">
                       <Badge variant={getStatusBadgeVariant(quotation.status)} className="capitalize">{quotation.status}</Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {quotationStatusOptions.map(status => (
                        <SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}>
                        {(isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditQuotation(quotation)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSendQuotation(quotation)} disabled={isSending === quotation.id}>
                        {isSending === quotation.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>} Send
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadPdf(quotation)} disabled={isDownloading === quotation.id}>
                        {isDownloading === quotation.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>} Download PDF
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                             <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                            <AlertDialogDescription>Delete quotation {quotation.quotationNumber} for {quotation.customerName}?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteQuotation(quotation.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
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
      </CardContent>
    </Card>
  );
}
