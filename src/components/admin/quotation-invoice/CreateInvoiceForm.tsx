
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2, ReceiptText, UserPlus, PlusCircle, Trash2, CalendarIcon, Save, Send, Download, AlertCircle, Phone } from "lucide-react";
import type { FirestoreUser, InvoiceItem, FirestoreInvoice, InvoicePaymentStatus, InvoicePaymentMode, CompanyDetailsForPdf } from '@/types/firestore';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, Timestamp, query, orderBy, doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { generateInvoicePdf } from '@/lib/sriinvoiceGenerator';
import { uploadPdfToStorage, triggerPdfDownload, dataUriToBlob } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

const invoiceItemSchema = z.object({
  id: z.string().optional(),
  itemName: z.string().min(1, "Item name is required."),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1."),
  ratePerUnit: z.coerce.number().min(0, "Rate must be non-negative."),
  total: z.number().optional(),
});

const paymentStatusOptions: InvoicePaymentStatus[] = ['Pending', 'Paid', 'Partial', 'Overdue', 'Cancelled'];
const paymentModeOptions: InvoicePaymentMode[] = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Online Gateway', 'Other'];

const createInvoiceFormSchema = z.object({
  userId: z.string().optional().or(z.literal('')),
  customerName: z.string().min(2, "Customer name is required if not selecting user."),
  customerEmail: z.string().email("Invalid email format.").optional().or(z.literal('')),
  customerMobile: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format (e.g., +919876543210 or 9876543210).")
    .optional().or(z.literal('')),
  invoiceNumber: z.string().min(1, "Invoice number is required."),
  invoiceDate: z.date({ required_error: "Invoice date is required."}),
  dueDate: z.date().optional().nullable(),
  serviceDescription: z.string().optional().or(z.literal('')),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required."),
  taxPercent: z.coerce.number().min(0).max(100).optional().default(0),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  paymentStatus: z.enum(paymentStatusOptions).default('Pending'),
  paymentMode: z.enum(paymentModeOptions).optional().nullable(),
  paymentNotes: z.string().optional().or(z.literal('')),
  additionalNotes: z.string().optional().or(z.literal('')),
  amountPaid: z.coerce.number().min(0).optional().nullable(),
});

type CreateInvoiceFormData = z.infer<typeof createInvoiceFormSchema>;

const generateInvoiceNumber = () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${timestamp}-${randomSuffix}`;
};

interface CreateInvoiceFormProps {
  initialData?: FirestoreInvoice | null;
  onSaveSuccess?: (savedItem: FirestoreInvoice) => void;
}

export default function CreateInvoiceForm({ initialData, onSaveSuccess }: CreateInvoiceFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { settings: companySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const [subtotal, setSubtotal] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [amountAfterDiscount, setAmountAfterDiscount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [amountDue, setAmountDue] = useState(0);

  const isEditing = !!initialData?.id;

  const form = useForm<CreateInvoiceFormData>({
    resolver: zodResolver(createInvoiceFormSchema),
    defaultValues: {
      userId: "", customerName: "", customerEmail: "", customerMobile: "",
      invoiceNumber: generateInvoiceNumber(),
      invoiceDate: new Date(),
      dueDate: null,
      serviceDescription: "", items: [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
      taxPercent: 0, discountPercent: 0, paymentStatus: 'Pending', paymentMode: null, paymentNotes: "", additionalNotes: "",
      amountPaid: null,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = form.watch("items");
  const watchedDiscountPercent = form.watch("discountPercent");
  const watchedTaxPercent = form.watch("taxPercent");
  const watchedUserId = form.watch("userId");
  const watchedAmountPaid = form.watch("amountPaid");


  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const usersQuery = query(collection(db, "users"), orderBy("displayName", "asc"));
        const snapshot = await getDocs(usersQuery);
        setUsers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreUser)));
      } catch (error) {
        toast({ title: "Error", description: "Could not load users.", variant: "destructive" });
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [toast]);

  useEffect(() => {
    if (initialData) {
      form.reset({
        userId: initialData.userId || "",
        customerName: initialData.customerName || "",
        customerEmail: initialData.customerEmail || "",
        customerMobile: initialData.customerMobile || "",
        invoiceNumber: initialData.invoiceNumber,
        invoiceDate: initialData.invoiceDate.toDate(),
        dueDate: initialData.dueDate?.toDate() || null,
        serviceDescription: initialData.serviceDescription || "",
        items: initialData.items.map(item => ({ ...item, id: item.id || nanoid() })) || [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
        taxPercent: initialData.taxPercent || 0,
        discountPercent: initialData.discountPercent || 0,
        paymentStatus: initialData.paymentStatus || 'Pending',
        paymentMode: initialData.paymentMode || null,
        paymentNotes: initialData.paymentNotes || "",
        additionalNotes: initialData.additionalNotes || "",
        amountPaid: initialData.amountPaid === undefined ? null : initialData.amountPaid,
      });
    } else {
      form.reset({
        userId: "", customerName: "", customerEmail: "", customerMobile: "", invoiceNumber: generateInvoiceNumber(), invoiceDate: new Date(),
        dueDate: null, serviceDescription: "", items: [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
        taxPercent: 0, discountPercent: 0, paymentStatus: 'Pending', paymentMode: null, paymentNotes: "", additionalNotes: "",
        amountPaid: null,
      });
    }
  }, [initialData, form]);

  useEffect(() => {
    if (watchedUserId) {
      const selectedUser = users.find(u => u.id === watchedUserId);
      if (selectedUser) {
        form.setValue("customerName", selectedUser.displayName || "", {shouldValidate: true});
        form.setValue("customerEmail", selectedUser.email || "", {shouldValidate: true});
        form.setValue("customerMobile", selectedUser.mobileNumber || "", {shouldValidate: true});
      }
    }
  }, [watchedUserId, users, form]);

  useEffect(() => {
    let currentSubtotal = 0;
    watchedItems.forEach((item, index) => {
      const itemTotal = (item.quantity || 0) * (item.ratePerUnit || 0);
      form.setValue(`items.${index}.total`, itemTotal);
      currentSubtotal += itemTotal;
    });
    setSubtotal(currentSubtotal);

    const currentDiscountPercent = watchedDiscountPercent || 0;
    const currentDiscountAmount = (currentSubtotal * currentDiscountPercent) / 100;
    setDiscountAmount(currentDiscountAmount);
    const currentAmountAfterDiscount = currentSubtotal - currentDiscountAmount;
    setAmountAfterDiscount(currentAmountAfterDiscount);

    const currentTaxPercent = watchedTaxPercent || 0;
    const currentTaxAmount = (currentAmountAfterDiscount * currentTaxPercent) / 100;
    setTaxAmount(currentTaxAmount);
    const currentGrandTotal = currentAmountAfterDiscount + currentTaxAmount;
    setGrandTotal(currentGrandTotal);

    const currentAmountPaid = watchedAmountPaid || 0;
    setAmountDue(currentGrandTotal - currentAmountPaid);

  }, [watchedItems, watchedDiscountPercent, watchedTaxPercent, watchedAmountPaid, form]);

  const onSubmit = async (data: CreateInvoiceFormData) => {
    setIsSaving(true);
    try {
      const invoiceDataForFirestore: Partial<Omit<FirestoreInvoice, 'id' | 'createdAt' | 'updatedAt'>> & { createdAt?: Timestamp, updatedAt: Timestamp } = {
        invoiceNumber: data.invoiceNumber,
        invoiceDate: Timestamp.fromDate(data.invoiceDate),
        customerName: data.customerName,
        items: data.items.map(item => ({
          itemName: item.itemName,
          quantity: item.quantity,
          ratePerUnit: item.ratePerUnit,
          total: (item.quantity || 0) * (item.ratePerUnit || 0),
        })),
        subtotal: subtotal,
        discountPercent: data.discountPercent || 0,
        discountAmount: discountAmount,
        taxPercent: data.taxPercent || 0,
        taxAmount: taxAmount,
        totalAmount: grandTotal,
        paymentStatus: data.paymentStatus,
        updatedAt: Timestamp.now(),
        amountPaid: data.amountPaid || 0,
        amountDue: grandTotal - (data.amountPaid || 0),
      };
      
      if (data.userId && data.userId.trim() !== "") invoiceDataForFirestore.userId = data.userId;
      if (data.customerEmail && data.customerEmail.trim() !== "") invoiceDataForFirestore.customerEmail = data.customerEmail;
      if (data.customerMobile && data.customerMobile.trim() !== "") invoiceDataForFirestore.customerMobile = data.customerMobile;
      if (data.dueDate) invoiceDataForFirestore.dueDate = Timestamp.fromDate(data.dueDate);
      if (data.serviceDescription && data.serviceDescription.trim() !== "") invoiceDataForFirestore.serviceDescription = data.serviceDescription;
      if (data.paymentMode) invoiceDataForFirestore.paymentMode = data.paymentMode;
      if (data.paymentNotes && data.paymentNotes.trim() !== "") invoiceDataForFirestore.paymentNotes = data.paymentNotes;
      if (data.additionalNotes && data.additionalNotes.trim() !== "") invoiceDataForFirestore.additionalNotes = data.additionalNotes;

      let savedItem: FirestoreInvoice;

      if (isEditing && initialData?.id) {
        await updateDoc(doc(db, "invoices", initialData.id), invoiceDataForFirestore);
        savedItem = { ...initialData, ...invoiceDataForFirestore, id: initialData.id } as FirestoreInvoice;
        toast({ title: "Success", description: "Invoice updated successfully." });
      } else {
        invoiceDataForFirestore.createdAt = Timestamp.now();
        const docRef = await addDoc(collection(db, "invoices"), invoiceDataForFirestore as Omit<FirestoreInvoice, 'id'>);
        savedItem = { ...invoiceDataForFirestore, id: docRef.id } as FirestoreInvoice;
        toast({ title: "Success", description: "Invoice created successfully." });
      }
      
      if (onSaveSuccess) onSaveSuccess(savedItem);

    } catch (error) {
      console.error("Error saving invoice:", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save invoice.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewUserRedirect = () => {
    router.push('/admin/users');
  };

  const handleSendInvoice = async () => {
    const currentInitialData = initialData; // Capture initialData at the time of click
    if (!currentInitialData?.id) {
      toast({ title: "Save First", description: "Please save the invoice before sending.", variant: "default" });
      return;
    }
    setIsSending(true);
    try {
      const invoiceSnap = await getDoc(doc(db, "invoices", currentInitialData.id));
      if (!invoiceSnap.exists()) throw new Error("Invoice not found for sending.");
      const savedInvoice = { id: invoiceSnap.id, ...invoiceSnap.data() } as FirestoreInvoice;
      
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "FixBro", address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "", contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
      };

      const pdfDataUri = await generateInvoicePdf(savedInvoice, companyInfo);
      const pdfBlob = dataUriToBlob(pdfDataUri);
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.");

      const storagePath = `invoices_pdf/${currentInitialData.id}_${savedInvoice.invoiceNumber}.pdf`;
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
      setIsSending(false);
    }
  };

  const handleDownloadPdf = async () => {
    const currentInitialData = initialData; // Capture initialData
     if (!currentInitialData?.id) {
      toast({ title: "Save First", description: "Please save the invoice before downloading.", variant: "default" });
      return;
    }
    setIsDownloading(true);
    try {
      const invoiceSnap = await getDoc(doc(db, "invoices", currentInitialData.id));
      if (!invoiceSnap.exists()) throw new Error("Invoice not found for download.");
      const savedInvoice = { id: invoiceSnap.id, ...invoiceSnap.data() } as FirestoreInvoice;

      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "FixBro", address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "", contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
      };

      const pdfDataUri = await generateInvoicePdf(savedInvoice, companyInfo);
      triggerPdfDownload(pdfDataUri, `Invoice-${savedInvoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error("Error downloading invoice PDF:", error);
      toast({ title: "Error Downloading", description: (error as Error).message || "Could not download PDF.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Invoice" : "Create New Invoice"}</CardTitle>
        <CardDescription>
          {isEditing ? `Editing Invoice #: ${initialData?.invoiceNumber}` : "Generate a new invoice for a customer or service."}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {/* Customer Info */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Customer Information</h3>
              <FormField control={form.control} name="userId" render={({ field }) => (<FormItem><FormLabel>Select Existing User (Optional)</FormLabel><Select onValueChange={field.onChange} value={field.value || ""} disabled={isSaving || isLoadingUsers}><FormControl><SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger></FormControl><SelectContent>{users.map(u => (<SelectItem key={u.id} value={u.id}>{u.displayName || u.email} ({u.mobileNumber || 'No mobile'})</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
              <Button type="button" variant="outline" size="sm" onClick={handleCreateNewUserRedirect} disabled={isSaving}><UserPlus className="mr-2 h-4 w-4" /> Create New User</Button>
              <FormField control={form.control} name="customerName" render={({ field }) => (<FormItem><FormLabel>Customer Name <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Customer's full name" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="customerEmail" render={({ field }) => (<FormItem><FormLabel>Customer Email (Optional)</FormLabel><FormControl><Input type="email" placeholder="customer@example.com" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="customerMobile" render={({ field }) => (<FormItem><FormLabel>Customer Mobile (Optional)</FormLabel><FormControl><Input type="tel" placeholder="+919876543210" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
            </div>

            {/* Invoice Details */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Invoice Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="invoiceNumber" render={({ field }) => (<FormItem><FormLabel>Invoice Number <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="e.g., INV-2023-001" {...field} disabled={isSaving || isEditing} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Invoice Date <span className="text-destructive">*</span></FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSaving}>
                      {field.value ? new Date(field.value).toLocaleDateString('en-IN') : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled={isSaving}/></PopoverContent></Popover><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="dueDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Due Date (Optional)</FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSaving}>
                      {field.value ? new Date(field.value).toLocaleDateString('en-IN') : <span>Pick a due date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} disabled={(date) => form.getValues("invoiceDate") ? date < form.getValues("invoiceDate") : false} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>
                )}/>
              </div>
              <FormField control={form.control} name="serviceDescription" render={({ field }) => (<FormItem><FormLabel>Overall Service Description (Optional)</FormLabel><FormControl><Textarea placeholder="Brief description of services rendered..." {...field} rows={3} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
            </div>

            {/* Itemized List */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Items / Services</h3>
              {fields.map((item, index) => (
                <div key={item.id} className="p-3 border rounded-md space-y-3 relative">
                  <div className="grid grid-cols-1 sm:grid-cols-itemized-quotation gap-3 items-end">
                    <FormField control={form.control} name={`items.${index}.itemName`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Item Name <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Service or Product" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Qty <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" placeholder="1" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name={`items.${index}.ratePerUnit`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Rate/Unit (₹) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" step="0.01" placeholder="100.00" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormItem><FormLabel className="text-xs">Total (₹)</FormLabel><Input type="text" value={((form.watch(`items.${index}.quantity`) || 0) * (form.watch(`items.${index}.ratePerUnit`) || 0)).toFixed(2)} disabled readOnly className="bg-muted/50"/></FormItem>
                  </div>
                  {fields.length > 1 && (<Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-destructive" onClick={() => remove(index)} disabled={isSaving}><Trash2 className="h-4 w-4" /></Button>)}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 })} disabled={isSaving}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
            </div>

            {/* Totals, Payment & Notes */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Summary & Payment</h3>
              <div className="space-y-1 text-right text-sm">
                <div>Subtotal: <span className="font-semibold">₹{subtotal.toFixed(2)}</span></div>
                <div className="flex items-center justify-end gap-2">
                  <FormLabel htmlFor="discountPercentInput" className="text-sm whitespace-nowrap">Discount (%):</FormLabel>
                  <FormField control={form.control} name="discountPercent" render={({ field }) => (<FormItem className="inline-block w-20"><FormControl><Input type="number" id="discountPercentInput" step="0.01" placeholder="0" {...field} disabled={isSaving} className="h-8 text-right" /></FormControl><FormMessage className="text-left text-xs" /></FormItem>)}/>
                </div>
                <div>Discount Amount: <span className="font-semibold text-green-600">- ₹{discountAmount.toFixed(2)}</span></div>
                <div>Amount After Discount: <span className="font-semibold">₹{amountAfterDiscount.toFixed(2)}</span></div>
                <div className="flex items-center justify-end gap-2">
                  <FormLabel htmlFor="taxPercentInvoiceInput" className="text-sm whitespace-nowrap">Tax (%):</FormLabel>
                  <FormField control={form.control} name="taxPercent" render={({ field }) => (<FormItem className="inline-block w-20"><FormControl><Input type="number" id="taxPercentInvoiceInput" step="0.01" placeholder="0" {...field} disabled={isSaving} className="h-8 text-right" /></FormControl><FormMessage className="text-left text-xs" /></FormItem>)}/>
                </div>
                <div>Tax Amount: <span className="font-semibold">₹{taxAmount.toFixed(2)}</span></div>
                <div className="text-lg font-bold text-primary">Grand Total: ₹{grandTotal.toFixed(2)}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                <FormField control={form.control} name="paymentStatus" render={({ field }) => (<FormItem><FormLabel>Payment Status <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSaving}><FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl><SelectContent>{paymentStatusOptions.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="paymentMode" render={({ field }) => (<FormItem><FormLabel>Payment Mode (Optional)</FormLabel><Select onValueChange={field.onChange} value={field.value || ""} disabled={isSaving}><FormControl><SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger></FormControl><SelectContent>{paymentModeOptions.map(m => (<SelectItem key={m} value={m}>{m}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
              </div>
              <FormField control={form.control} name="amountPaid" render={({ field }) => (
                <FormItem><FormLabel>Amount Paid (₹) (Optional)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ""} disabled={isSaving} /></FormControl><FormMessage /></FormItem>
              )}/>
              <div className="text-right text-sm font-semibold">Amount Due: <span className="text-destructive">₹{amountDue.toFixed(2)}</span></div>
              <FormField control={form.control} name="paymentNotes" render={({ field }) => (<FormItem><FormLabel>Payment Notes (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Transaction ID, Partial payment details" {...field} rows={2} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="additionalNotes" render={({ field }) => (<FormItem><FormLabel>Additional Invoice Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Terms and conditions, Bank details for transfer, etc." {...field} rows={3} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-6">
            <Button type="submit" disabled={isSaving || isSending || isDownloading || isLoadingCompanySettings}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? "Update Invoice" : "Save Invoice"}
            </Button>
            <Button type="button" variant="outline" onClick={handleSendInvoice} disabled={isSaving || isSending || isDownloading || !initialData?.id || isLoadingCompanySettings}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Invoice
            </Button>
            <Button type="button" variant="outline" onClick={handleDownloadPdf} disabled={isSaving || isSending || isDownloading || !initialData?.id || isLoadingCompanySettings}>
               {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download PDF
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
