
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Edit, Trash2, PackageSearch, MoreHorizontal, Send, Download } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, Timestamp, where } from "firebase/firestore";
import type { FirestoreQuotation, QuotationStatus, CompanyDetailsForPdf } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { generateQuotationPdf } from '@/lib/quotationGenerator';
import { uploadPdfToStorage, triggerPdfDownload, dataUriToBlob } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useAuth } from '@/hooks/useAuth';

interface ManageQuotationsTabProps {
  onEditQuotation: (quotation: FirestoreQuotation) => void;
}

const quotationStatusOptions: QuotationStatus[] = ['Draft', 'Sent', 'Accepted', 'Rejected', 'ConvertedToInvoice'];

export default function ManageQuotationsTab({ onEditQuotation }: ManageQuotationsTabProps) {
  const [quotations, setQuotations] = useState<FirestoreQuotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const { toast } = useToast();
  const { user: providerUser } = useAuth();
  const { settings: companySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();

  useEffect(() => {
    if (!providerUser) {
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    const quotationsCollectionRef = collection(db, "quotations");
    const q = query(quotationsCollectionRef, where("providerId", "==", providerUser.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedQuotations = querySnapshot.docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as FirestoreQuotation));
      fetchedQuotations.sort((a, b) => (b.quotationDate?.toMillis() || 0) - (a.quotationDate?.toMillis() || 0));
      setQuotations(fetchedQuotations);
      setIsLoading(false);
    }, (error) => {
      toast({ title: "Error", description: "Could not fetch quotations.", variant: "destructive" });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [providerUser, toast]);

  const handleDeleteQuotation = async (quotationId: string) => {
    if (!quotationId) return;
    setIsUpdating(quotationId);
    try { await deleteDoc(doc(db, "quotations", quotationId)); toast({ title: "Success", description: "Quotation deleted." });
    } catch (error) { toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally { setIsUpdating(null); }
  };

  const handleUpdateStatus = async (quotationId: string, newStatus: QuotationStatus) => {
    if (!quotationId) return;
    setIsUpdating(quotationId);
    try { await updateDoc(doc(db, "quotations", quotationId), { status: newStatus, updatedAt: Timestamp.now() }); toast({ title: "Success", description: `Status updated.` });
    } catch (error) { toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally { setIsUpdating(null); }
  };
  
  const handleAction = async (actionType: 'send' | 'download', quotation: FirestoreQuotation) => {
    if (!quotation.id) return;
    if (actionType === 'send') setIsSending(quotation.id); else setIsDownloading(quotation.id);
    try {
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "Wecanfix", address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "", contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
      };
      const pdfDataUri = await generateQuotationPdf(quotation, companyInfo);
      if (actionType === 'download') {
        triggerPdfDownload(pdfDataUri, `Quotation-${quotation.quotationNumber}.pdf`);
      } else {
        const pdfBlob = dataUriToBlob(pdfDataUri); if (!pdfBlob) throw new Error("Failed to generate PDF blob.");
        const storagePath = `quotations_pdf/${quotation.id}_${quotation.quotationNumber}.pdf`;
        const downloadUrl = await uploadPdfToStorage(pdfBlob, storagePath);
        await updateDoc(doc(db, "quotations", quotation.id), { status: 'Sent', updatedAt: Timestamp.now() });
        toast({
          duration: 10000, title: "Quotation Ready to Share",
          description: (<div><p>URL: <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{downloadUrl}</a></p><Button size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard.writeText(downloadUrl).then(() => toast({description: "URL Copied!"}))}>Copy URL</Button></div>),
        });
      }
    } catch (error) { toast({ title: `Error ${actionType}`, description: (error as Error).message, variant: "destructive" }); }
    finally { if (actionType === 'send') setIsSending(null); else setIsDownloading(null); }
  };

  const formatDate = (timestamp?: Timestamp) => timestamp ? timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
  const getStatusBadgeVariant = (status: QuotationStatus) => ({'Draft': 'secondary', 'Sent': 'outline', 'Accepted': 'default', 'Rejected': 'destructive', 'ConvertedToInvoice': 'default'})[status] || 'outline';

  const renderMobileCard = (quotation: FirestoreQuotation) => (
    <Card key={quotation.id} className="mb-4 shadow-sm">
        <CardContent className="p-4 space-y-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Quotation #</p><p className="font-semibold">{quotation.quotationNumber}</p></div>
            <div><p className="text-xs text-muted-foreground">Customer</p><p>{quotation.customerName}</p></div>
            <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Date</p><p>{formatDate(quotation.quotationDate)}</p></div>
                <div><p className="text-xs text-muted-foreground">Amount (₹)</p><p>{quotation.totalAmount.toFixed(2)}</p></div>
            </div>
            <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Select value={quotation.status} onValueChange={(s) => handleUpdateStatus(quotation.id!, s as QuotationStatus)} disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}>
                    <SelectTrigger className="h-9 text-xs"><Badge variant={getStatusBadgeVariant(quotation.status)} className={`capitalize ${quotation.status === 'Accepted' ? 'bg-green-500' : ''}`}>{quotation.status}</Badge></SelectTrigger>
                    <SelectContent>{quotationStatusOptions.map(s => (<SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>))}</SelectContent>
                </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs h-9" disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}>
                            {(isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id) ? <Loader2 className="h-4 w-4 animate-spin"/> : <MoreHorizontal className="h-4 w-4"/>}
                            <span className="ml-2">Actions</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditQuotation(quotation)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAction('send', quotation)} disabled={isSending === quotation.id}>{isSending === quotation.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>} Send</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAction('download', quotation)} disabled={isDownloading === quotation.id}>{isDownloading === quotation.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>} Download PDF</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                            <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:bg-destructive/10 focus:text-destructive"><Trash2 className="mr-2 h-4 w-4"/>Delete</DropdownMenuItem></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescription>Delete quotation {quotation.quotationNumber}?</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteQuotation(quotation.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </CardContent>
    </Card>
  );

  if (isLoading || isLoadingCompanySettings) return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-2">Loading quotations...</span></div>;
  if (!providerUser) return <div className="text-center py-10"><p className="text-muted-foreground">Please log in to view quotations.</p></div>;
  if (quotations.length === 0) return <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No quotations found yet.</p></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Quotations</CardTitle>
        <CardDescription>View, edit, and manage your existing customer quotations.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Desktop View */}
        <div className="hidden md:block">
            <Table>
            <TableHeader><TableRow><TableHead>Quotation #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount (₹)</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
                {quotations.map((quotation) => (<TableRow key={quotation.id}><TableCell className="font-medium text-xs">{quotation.quotationNumber}</TableCell><TableCell>{quotation.customerName}</TableCell><TableCell>{formatDate(quotation.quotationDate)}</TableCell><TableCell className="text-right">{quotation.totalAmount.toFixed(2)}</TableCell><TableCell><Select value={quotation.status} onValueChange={(s) => handleUpdateStatus(quotation.id!, s as QuotationStatus)} disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}><SelectTrigger className="h-8 text-xs min-w-[120px]"><Badge variant={getStatusBadgeVariant(quotation.status)} className={`capitalize ${quotation.status === 'Accepted' ? 'bg-green-500' : ''}`}>{quotation.status}</Badge></SelectTrigger><SelectContent>{quotationStatusOptions.map(s => (<SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>))}</SelectContent></Select></TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" disabled={isUpdating===quotation.id||isSending===quotation.id||isDownloading===quotation.id}>{(isUpdating===quotation.id||isSending===quotation.id||isDownloading===quotation.id)?<Loader2 className="h-4 w-4 animate-spin"/>:<MoreHorizontal className="h-4 w-4"/>}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEditQuotation(quotation)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem><DropdownMenuItem onClick={() => handleAction('send', quotation)} disabled={isSending===quotation.id}>{isSending===quotation.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Send className="mr-2 h-4 w-4"/>} Send</DropdownMenuItem><DropdownMenuItem onClick={() => handleAction('download', quotation)} disabled={isDownloading===quotation.id}>{isDownloading===quotation.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Download className="mr-2 h-4 w-4"/>} Download PDF</DropdownMenuItem><DropdownMenuSeparator /><AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:bg-destructive/10 focus:text-destructive"><Trash2 className="mr-2 h-4 w-4"/>Delete</DropdownMenuItem></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescription>Delete quotation {quotation.quotationNumber} for {quotation.customerName}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteQuotation(quotation.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DropdownMenuContent></DropdownMenu></TableCell></TableRow>))}
            </TableBody>
            </Table>
        </div>
        {/* Mobile View */}
        <div className="md:hidden">
            {quotations.map(renderMobileCard)}
        </div>
      </CardContent>
    </Card>
  );
}
