
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Edit, Trash2, PackageSearch, AlertTriangle, FileText, MoreHorizontal, Send, Download } from "lucide-react";
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, Timestamp, getDoc } from "firebase/firestore";
import type { FirestoreInvoice, InvoicePaymentStatus, CompanyDetailsForPdf } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { generateInvoicePdf } from '@/lib/sriinvoiceGenerator';
import { uploadPdfToStorage, triggerPdfDownload, dataUriToBlob } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

interface ManageInvoicesTabProps {
  onEditInvoice: (invoice: FirestoreInvoice) => void;
}

const paymentStatusOptions: InvoicePaymentStatus[] = ['Pending', 'Paid', 'Partial', 'Overdue', 'Cancelled'];

export default function ManageInvoicesTab({ onEditInvoice }: ManageInvoicesTabProps) {
  const [invoices, setInvoices] = useState<FirestoreInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null); // For status updates or delete
  const [isSending, setIsSending] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const { toast } = useToast();
  const { settings: companySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();

  useEffect(() => {
    setIsLoading(true);
    const invoicesCollectionRef = collection(db, "invoices");
    const q = query(invoicesCollectionRef, orderBy("invoiceDate", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedInvoices = querySnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as FirestoreInvoice));
      setInvoices(fetchedInvoices);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching invoices: ", error);
      toast({ title: "Error", description: "Could not fetch invoices.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!invoiceId) return;
    setIsUpdating(invoiceId);
    try {
      await deleteDoc(doc(db, "invoices", invoiceId));
      toast({ title: "Success", description: "Invoice deleted successfully." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not delete invoice.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdatePaymentStatus = async (invoiceId: string, newStatus: InvoicePaymentStatus) => {
    if (!invoiceId) return;
    setIsUpdating(invoiceId);
    try {
      await updateDoc(doc(db, "invoices", invoiceId), {
        paymentStatus: newStatus,
        updatedAt: Timestamp.now(),
      });
      toast({ title: "Success", description: `Invoice status updated to ${newStatus}.` });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update invoice status.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleSendInvoice = async (invoice: FirestoreInvoice) => {
    if (!invoice.id) return;
    setIsSending(invoice.id);
    try {
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "FixBro",
        address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "",
        contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
      };
      const pdfDataUri = await generateInvoicePdf(invoice, companyInfo);
      const pdfBlob = dataUriToBlob(pdfDataUri);
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.");

      const storagePath = `invoices_pdf/${invoice.id}_${invoice.invoiceNumber}.pdf`;
      const downloadUrl = await uploadPdfToStorage(pdfBlob, storagePath);
      
      toast({
        duration: 10000,
        title: "Invoice Ready to Share",
        description: (
          <div>
            <p>Shareable URL: <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{downloadUrl}</a></p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard.writeText(downloadUrl).then(() => toast({description: "URL Copied!"}))}>Copy URL</Button>
          </div>
        ),
      });
    } catch (error) {
      console.error("Error sending invoice:", error);
      toast({ title: "Error Sending", description: (error as Error).message || "Could not send invoice.", variant: "destructive" });
    } finally {
      setIsSending(null);
    }
  };

  const handleDownloadPdf = async (invoice: FirestoreInvoice) => {
    if (!invoice.id) return;
    setIsDownloading(invoice.id);
    try {
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "FixBro",
        address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "",
        contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
      };
      const pdfDataUri = await generateInvoicePdf(invoice, companyInfo);
      triggerPdfDownload(pdfDataUri, `Invoice-${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error("Error downloading invoice PDF:", error);
      toast({ title: "Error Downloading", description: (error as Error).message || "Could not download PDF.", variant: "destructive" });
    } finally {
      setIsDownloading(null);
    }
  };

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStatusBadgeVariant = (status: InvoicePaymentStatus) => {
    switch (status) {
      case 'Paid': return 'default'; // Primary
      case 'Pending': return 'secondary';
      case 'Partial': return 'outline';
      case 'Overdue': return 'destructive';
      case 'Cancelled': return 'destructive';
      default: return 'outline';
    }
  };


  if (isLoading || isLoadingCompanySettings) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-2">Loading invoices...</span></div>;
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-10">
        <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No invoices found yet.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Invoices</CardTitle>
        <CardDescription>View, edit, and manage existing customer invoices.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead>Payment Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium text-xs">{invoice.invoiceNumber}</TableCell>
                <TableCell>{invoice.customerName}</TableCell>
                <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                <TableCell className="text-right">{invoice.totalAmount.toFixed(2)}</TableCell>
                <TableCell>
                  <Select
                    value={invoice.paymentStatus}
                    onValueChange={(newStatus) => handleUpdatePaymentStatus(invoice.id!, newStatus as InvoicePaymentStatus)}
                    disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id}
                  >
                    <SelectTrigger className="h-8 text-xs min-w-[100px] sm:min-w-[120px]">
                       <Badge variant={getStatusBadgeVariant(invoice.paymentStatus)} className="capitalize">{invoice.paymentStatus}</Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {paymentStatusOptions.map(status => (
                        <SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id}>
                        {(isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditInvoice(invoice)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSendInvoice(invoice)} disabled={isSending === invoice.id}>
                        {isSending === invoice.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>} Send
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadPdf(invoice)} disabled={isDownloading === invoice.id}>
                         {isDownloading === invoice.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>} Download PDF
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
                            <AlertDialogDescription>Delete invoice {invoice.invoiceNumber} for {invoice.customerName}?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteInvoice(invoice.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
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
