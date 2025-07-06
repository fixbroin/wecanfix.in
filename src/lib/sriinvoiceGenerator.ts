
"use client";

import jsPDF from 'jspdf';
import 'jspdf-autotable'; 
import type { UserOptions } from 'jspdf-autotable'; 
import type { FirestoreInvoice, Timestamp, CompanyDetailsForPdf } from '@/types/firestore'; 

interface ExtendedHeadCellDef extends UserOptions { 
    cellWidth?: 'auto' | number | string;
    halign?: 'left' | 'center' | 'right';
}

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    lastAutoTable: { finalY: number }; 
  }
}

const formatDateForIndiaDisplay = (timestamp?: Timestamp): string => {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate();
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return 'Invalid Date'; 
    }
};

export const generateInvoicePdf = async (invoice: FirestoreInvoice, companyDetails?: CompanyDetailsForPdf): Promise<string> => {
  const doc = new jsPDF();

  const defaultCompanyDetails: CompanyDetailsForPdf = {
    name: companyDetails?.name || "FixBro.in",
    address: companyDetails?.address || "#44 G S Palya Road Konappana Agrahara Electronic City Phase 2 -560100",
    contactEmail: companyDetails?.contactEmail || 'support@fixbro.in',
    contactMobile: companyDetails?.contactMobile || '+91-7353113455',
    logoUrl: companyDetails?.logoUrl, 
  };
  
  // Header Section
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(defaultCompanyDetails.name, 14, 22);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const addressLines = doc.splitTextToSize(defaultCompanyDetails.address, 100);
  doc.text(addressLines[0], 14, 28);
  if (addressLines.length > 1) doc.text(addressLines[1], 14, 32); 
  doc.text(`Email: ${defaultCompanyDetails.contactEmail} | Phone: ${defaultCompanyDetails.contactMobile}`, 14, (addressLines.length > 1 ? 32 : 28) + 6);


  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", 196, 22, { align: "right" });
  doc.setFont("helvetica", "normal");

  doc.setFontSize(10);
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, 196, 30, { align: "right" });
  doc.text(`Date: ${formatDateForIndiaDisplay(invoice.invoiceDate)}`, 196, 36, { align: "right" });
  if (invoice.dueDate) {
    doc.text(`Due Date: ${formatDateForIndiaDisplay(invoice.dueDate)}`, 196, 42, { align: "right" });
  }

  // Customer Details Section
  let startYCustomer = invoice.dueDate ? 50 : 45; 
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", 14, startYCustomer);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  startYCustomer += 5; doc.text(invoice.customerName, 14, startYCustomer);
  if (invoice.customerEmail) {
    startYCustomer += 5; doc.text(`Email: ${invoice.customerEmail}`, 14, startYCustomer);
  }
  if (invoice.customerMobile) { // Added customerMobile
    startYCustomer += 5; doc.text(`Mobile: ${invoice.customerMobile}`, 14, startYCustomer);
  }

  // Items Table
  const tableColumnStyles: { [key: string]: Partial<ExtendedHeadCellDef> } = {
    0: { cellWidth: 10 }, // #
    1: { cellWidth: 'auto' }, // Description
    2: { cellWidth: 20, halign: 'center' }, // Qty
    3: { cellWidth: 30, halign: 'right' }, // Rate
    4: { cellWidth: 30, halign: 'right' }, // Total
  };

  const head = [["#", "Description", "Qty", "Rate (Rs)", "Amount (Rs)"]];
  const body = invoice.items.map((item, index) => [
    index + 1,
    item.itemName,
    item.quantity,
    item.ratePerUnit.toFixed(2),
    item.total.toFixed(2),
  ]);

  doc.autoTable({
    head: head, body: body, startY: startYCustomer + 10, theme: 'striped',
    headStyles: { fillColor: [70, 160, 162] }, columnStyles: tableColumnStyles,
  });

  // Totals Section
  let finalY = doc.lastAutoTable.finalY || startYCustomer + 10 + (body.length + 1) * 10;
  finalY += 7;

  const drawRightAlignedText = (label: string, value: string, y: number) => {
    doc.text(label, 150, y, { align: "right" }); 
    doc.text(value, 196, y, { align: "right" });
  };

  doc.setFontSize(10);
  drawRightAlignedText("Subtotal:", `Rs. ${invoice.subtotal.toFixed(2)}`, finalY);

  if (invoice.discountAmount && invoice.discountAmount > 0) {
    finalY += 5;
    drawRightAlignedText(`Discount (${invoice.discountPercent?.toFixed(1) || ''}%):`, `- Rs. ${invoice.discountAmount.toFixed(2)}`, finalY);
  }
  
  if (invoice.taxAmount && invoice.taxAmount > 0) {
    finalY += 5;
    drawRightAlignedText(`Tax (${invoice.taxPercent?.toFixed(1) || ''}%):`, `+ Rs. ${invoice.taxAmount.toFixed(2)}`, finalY);
  }

  finalY += 7;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  drawRightAlignedText("Grand Total:", `Rs. ${invoice.totalAmount.toFixed(2)}`, finalY);
  doc.setFont("helvetica", "normal");

  if (invoice.amountPaid && invoice.amountPaid > 0) {
    finalY += 5;
    doc.setFontSize(10);
    drawRightAlignedText("Amount Paid:", `Rs. ${invoice.amountPaid.toFixed(2)}`, finalY);
    if (invoice.amountDue && invoice.amountDue !== invoice.totalAmount) { 
      finalY += 5;
      doc.setFont("helvetica", "bold");
      drawRightAlignedText("Amount Due:", `Rs. ${invoice.amountDue.toFixed(2)}`, finalY);
      doc.setFont("helvetica", "normal");
    }
  }

  // Payment & Notes Section
  finalY += 7;
  doc.setFontSize(10);
  doc.text(`Payment Status: ${invoice.paymentStatus}`, 14, finalY);
  if (invoice.paymentMode) {
    finalY += 5;
    doc.text(`Payment Mode: ${invoice.paymentMode}`, 14, finalY);
  }
  if (invoice.paymentNotes) {
    finalY += 5;
    const paymentNotesLines = doc.splitTextToSize(`Payment Notes: ${invoice.paymentNotes}`, 180);
    doc.text(paymentNotesLines, 14, finalY);
    finalY += (paymentNotesLines.length * 4); 
  }
  if (invoice.additionalNotes) {
    finalY += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Additional Notes:", 14, finalY);
    doc.setFont("helvetica", "normal");
    finalY += 5;
    const additionalNotesLines = doc.splitTextToSize(invoice.additionalNotes, 180);
    doc.text(additionalNotesLines, 14, finalY);
    finalY += (additionalNotesLines.length * 4);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(9);
  doc.text("Thank you for your business!", 105, pageHeight - 15, { align: "center" });
  doc.text("This is a computer generated invoice.", 105, pageHeight - 10, { align: "center" });

  return doc.output('datauristring'); 
};
