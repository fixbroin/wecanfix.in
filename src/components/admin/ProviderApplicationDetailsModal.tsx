
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProviderApplication, KycDocument, BankDetails, ProviderApplicationStatus } from '@/types/firestore';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCircle, Briefcase, FileText, Banknote, MapPin, Image as ImageIcon, ShieldCheck, CheckCircle, AlertTriangle, XCircle, Loader2, Download, Edit as EditIcon, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import NextImage from 'next/image';
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { generateProviderApplicationPdf } from '@/lib/generateProviderPDF';
import { triggerPdfDownload } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

interface ProviderApplicationDetailsModalProps {
  application: ProviderApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (applicationId: string, newStatus: ProviderApplicationStatus, notes?: string) => Promise<void>;
  isLoadingStatusUpdate: boolean;
}

const formatTimestampToReadable = (timestamp?: any): string => {
  if (!timestamp) return "N/A";
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  try {
    return new Date(timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(timestamp);
  }
};


const KycDocDisplay: React.FC<{ doc?: KycDocument | null, docName: string }> = ({ doc, docName }) => {
  if (!doc || (!doc.docNumber && !doc.frontImageUrl)) return <p className="text-sm text-muted-foreground">Not Provided</p>;
  return (
    <div className="space-y-1">
      <p className="text-sm"><strong>{docName} No:</strong> {doc.docNumber || "N/A"}</p>
      {doc.frontImageUrl && (
        <div className="mt-1">
          <a href={doc.frontImageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Front Image ({doc.frontImageFileName || 'View'})</a>
          {doc.frontImageUrl.startsWith('http') && <div className="relative w-32 h-20 mt-1 border rounded"><NextImage src={doc.frontImageUrl} alt={`${docName} Front`} fill className="object-contain p-1"/></div>}
        </div>
      )}
      {doc.backImageUrl && (
         <div className="mt-1">
            <a href={doc.backImageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Back Image ({doc.backImageFileName || 'View'})</a>
            {doc.backImageUrl.startsWith('http') && <div className="relative w-32 h-20 mt-1 border rounded"><NextImage src={doc.backImageUrl} alt={`${docName} Back`} fill className="object-contain p-1"/></div>}
        </div>
      )}
       <div className="text-xs">Status: <Badge variant={doc.verified ? "default" : "secondary"} className={doc.verified ? "bg-green-500" : ""}>{doc.verified ? "Verified" : "Pending"}</Badge></div>
    </div>
  );
};

const BankDetailsDisplay: React.FC<{ details?: BankDetails | null }> = ({ details }) => {
  if (!details || !details.bankName) return <p className="text-sm text-muted-foreground">Not Provided</p>;
  return (
    <div className="space-y-1 text-sm">
      <p><strong>Bank:</strong> {details.bankName}</p>
      <p><strong>A/C Holder:</strong> {details.accountHolderName}</p>
      <p><strong>A/C No:</strong> {details.accountNumber}</p>
      <p><strong>IFSC:</strong> {details.ifscCode}</p>
      {details.cancelledChequeUrl && (
         <div className="mt-1">
            <a href={details.cancelledChequeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Cheque ({details.cancelledChequeFileName || 'View'})</a>
            {details.cancelledChequeUrl.startsWith('http') && <div className="relative w-32 h-20 mt-1 border rounded"><NextImage src={details.cancelledChequeUrl} alt="Cancelled Cheque" fill className="object-contain p-1"/></div>}
        </div>
      )}
      <div className="text-xs">Status: <Badge variant={details.verified ? "default" : "secondary"} className={details.verified ? "bg-green-500" : ""}>{details.verified ? "Verified" : "Pending"}</Badge></div>
    </div>
  );
};


export default function ProviderApplicationDetailsModal({
  application,
  isOpen,
  onClose,
  onUpdateStatus,
  isLoadingStatusUpdate,
}: ProviderApplicationDetailsModalProps) {
  const [adminNotes, setAdminNotes] = useState("");
  const { toast } = useToast();
  const { settings: globalCompanySettings } = useGlobalSettings();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  useEffect(() => {
    if (application) {
      setAdminNotes(application.adminReviewNotes || "");
    } else {
      setAdminNotes("");
    }
  }, [application]);

  if (!application) return null;

  const handleStatusAction = (newStatus: ProviderApplicationStatus) => {
    if (!application?.id) return;

    if (newStatus === 'rejected' || newStatus === 'needs_update') {
        if (!adminNotes.trim()) {
            toast({
              title: "Notes Required",
              description: "Please provide notes for rejection or requesting updates.",
              variant: "destructive"
            });
            return;
        }
    }
    onUpdateStatus(application.id, newStatus, adminNotes);
  };

  const handleDownloadProviderPdf = async () => {
    if (!application) return;
    setIsDownloadingPdf(true);
    try {
      const companyInfo = {
        name: globalCompanySettings?.websiteName || "FixBro.in",
        address: globalCompanySettings?.address || "Company Address Placeholder",
        contactEmail: globalCompanySettings?.contactEmail || 'support@example.com',
        contactMobile: globalCompanySettings?.contactMobile || '+91-XXXXXXXXXX',
        logoUrl: globalCompanySettings?.logoUrl || undefined,
      };
      const pdfDataUri = await generateProviderApplicationPdf(application, companyInfo);
      triggerPdfDownload(pdfDataUri, `ProviderApp-${application.fullName?.replace(/\s+/g, '_') || application.id}.pdf`);
    } catch (error) {
      console.error("Error generating or downloading provider PDF:", error);
      toast({ title: "PDF Error", description: (error as Error).message || "Could not generate or download PDF.", variant: "destructive" });
    } finally {
      setIsDownloadingPdf(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[90vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-6 border-b">
          <div className="flex items-start sm:items-center space-x-3 sm:space-x-4">
            <Avatar className="h-12 w-12 sm:h-16 sm:w-16">
              <AvatarImage src={application.profilePhotoUrl || undefined} alt={application.fullName || "Provider"} />
              <AvatarFallback className="text-xl sm:text-2xl">{application.fullName ? application.fullName[0].toUpperCase() : "P"}</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-xl sm:text-2xl">{application.fullName || "Provider Application"}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">ID: {application.id}</DialogDescription>
              <Badge variant="outline" className="mt-1 text-xs capitalize">{application.status.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-grow">
            <div className="p-4 sm:p-6">
            <Tabs defaultValue="personal">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 mb-4">
                <TabsTrigger value="personal"><UserCircle className="mr-1 h-4 w-4"/>Personal</TabsTrigger>
                <TabsTrigger value="work"><Briefcase className="mr-1 h-4 w-4"/>Work Info</TabsTrigger>
                <TabsTrigger value="kyc"><FileText className="mr-1 h-4 w-4"/>KYC</TabsTrigger>
                <TabsTrigger value="bank"><Banknote className="mr-1 h-4 w-4"/>Bank & Location</TabsTrigger>
                <TabsTrigger value="confirmation"><EditIcon className="mr-1 h-4 w-4"/>Confirmation</TabsTrigger>
                </TabsList>

                <TabsContent value="personal" className="space-y-3 text-sm">
                    <p><strong>Full Name:</strong> {application.fullName || 'N/A'}</p>
                    <p><strong>Email:</strong> {application.email || 'N/A'}</p>
                    <p><strong>Mobile:</strong> {application.mobileNumber || 'N/A'}</p>
                    <p><strong>Alternate Mobile:</strong> {application.alternateMobile || 'N/A'}</p>
                    <p><strong>Address:</strong> {application.address || 'N/A'}</p>
                    <p><strong>Age:</strong> {application.age || 'N/A'}</p>
                    <p><strong>Qualification:</strong> {application.qualificationLabel || 'N/A'}</p>
                    <p><strong>Languages Spoken:</strong> {application.languagesSpokenLabels?.join(', ') || 'N/A'}</p>
                    <p><strong>Submitted:</strong> {formatTimestampToReadable(application.submittedAt || application.createdAt)}</p>
                </TabsContent>

                <TabsContent value="work" className="space-y-3 text-sm">
                    <p><strong>Category:</strong> {application.workCategoryName || 'N/A'}</p>
                    <p><strong>Experience:</strong> {application.experienceLevelLabel || 'N/A'}</p>
                    <p><strong>Skill Level:</strong> {application.skillLevelLabel || 'N/A'}</p>
                </TabsContent>

                <TabsContent value="kyc" className="space-y-4 text-sm">
                    <KycDocDisplay doc={application.aadhaar} docName="Aadhaar"/>
                    <KycDocDisplay doc={application.pan} docName="PAN Card"/>
                    {application.optionalDocuments && application.optionalDocuments.length > 0 && (
                        <div>
                        <h4 className="font-semibold mt-3 mb-1">Optional Documents:</h4>
                        {application.optionalDocuments.map((doc, idx) => (
                            <div key={idx} className="p-2 border-t mt-2">
                                <KycDocDisplay doc={doc} docName={doc.docType || `Optional Doc ${idx+1}`}/>
                            </div>
                        ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="bank" className="space-y-4 text-sm">
                    <div><h4 className="font-semibold mb-1">Work PIN Codes:</h4><p>{application.workPinCodes?.join(', ') || 'N/A'}</p></div>
                    <div><h4 className="font-semibold mb-1">Bank Details:</h4><BankDetailsDisplay details={application.bankDetails} /></div>
                </TabsContent>

                <TabsContent value="confirmation" className="space-y-4 text-sm">
                    <div>
                        <h4 className="font-semibold mb-1">Terms Confirmation:</h4>
                        {application.termsConfirmedAt ? (
                            <p className="flex items-center text-green-600"><CheckCircle className="mr-2 h-4 w-4"/>Confirmed on {formatTimestampToReadable(application.termsConfirmedAt)}</p>
                        ) : (
                            <p className="flex items-center text-destructive"><XCircle className="mr-2 h-4 w-4"/>Not Confirmed</p>
                        )}
                    </div>
                     <div>
                        <h4 className="font-semibold mb-1">Signature:</h4>
                        {application.signatureUrl ? (
                            <div className="mt-1">
                                <a href={application.signatureUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Signature ({application.signatureFileName || 'View Image'})</a>
                                {application.signatureUrl.startsWith('http') && <div className="relative w-48 h-24 mt-1 border rounded bg-white"><NextImage src={application.signatureUrl} alt="Provider Signature" fill className="object-contain p-1"/></div>}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No signature provided.</p>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {(application.status === 'pending_review' || application.status === 'needs_update' || application.status === 'rejected') && (
            <div className="mt-4 pt-4 border-t">
                <Label htmlFor="adminReviewNotes" className="font-semibold">Admin Review Notes:</Label>
                <Textarea
                    id="adminReviewNotes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes for approval, rejection, or update request..."
                    rows={3}
                    className="mt-1"
                    disabled={isLoadingStatusUpdate}
                />
            </div>
            )}
            </div>
        </ScrollArea>

        <DialogFooter className="p-4 sm:p-6 border-t flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleDownloadProviderPdf} disabled={isLoadingStatusUpdate || isDownloadingPdf} className="w-full sm:w-auto">
             {isDownloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>} Download PDF
          </Button>
          <div className="flex-grow"></div> {/* Spacer */}
          <DialogClose asChild><Button variant="outline" disabled={isLoadingStatusUpdate} className="w-full sm:w-auto">Close</Button></DialogClose>
          {application.status !== 'approved' && (
            <Button onClick={() => handleStatusAction('approved')} disabled={isLoadingStatusUpdate} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
              {isLoadingStatusUpdate && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} <CheckCircle className="mr-2 h-4 w-4"/>Approve
            </Button>
          )}
           {application.status !== 'rejected' && (
            <Button variant="destructive" onClick={() => handleStatusAction('rejected')} disabled={isLoadingStatusUpdate} className="w-full sm:w-auto">
                {isLoadingStatusUpdate && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} <XCircle className="mr-2 h-4 w-4"/>Reject
            </Button>
          )}
          {application.status !== 'needs_update' && (
            <Button variant="outline" onClick={() => handleStatusAction('needs_update')} disabled={isLoadingStatusUpdate} className="border-yellow-500 text-yellow-600 hover:bg-yellow-500/10 w-full sm:w-auto">
                {isLoadingStatusUpdate && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} <AlertTriangle className="mr-2 h-4 w-4"/>Needs Update
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    
