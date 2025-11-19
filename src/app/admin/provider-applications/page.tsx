
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation'; // Added useRouter
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users2, Eye, Edit, Trash2, CheckCircle, XCircle, AlertTriangle, Loader2, PackageSearch, MoreHorizontal, UserCircle, Settings, FileText } from "lucide-react";
import type { ProviderApplication, ProviderApplicationStatus, FirestoreNotification } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, deleteDoc, addDoc } from "firebase/firestore"; 
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import ProviderApplicationDetailsModal from '@/components/admin/ProviderApplicationDetailsModal';
import { Textarea } from '@/components/ui/textarea'; 
import { Label } from '@/components/ui/label'; 
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; 
import { sendProviderApplicationStatusEmail, type ProviderApplicationStatusEmailInput } from '@/ai/flows/sendProviderApplicationStatusUpdateFlow'; 
import { getBaseUrl } from '@/lib/config'; 

const applicationStatusOptions: ProviderApplicationStatus[] = ['pending_review', 'pending_step_1', 'pending_step_2', 'pending_step_3', 'pending_step_4', 'approved', 'rejected', 'needs_update'];

const formatApplicationTimestamp = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function AdminProviderApplicationsPage() {
  const [applications, setApplications] = useState<ProviderApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null); 
  const [filterStatus, setFilterStatus] = useState<ProviderApplicationStatus | "all">("all");
  const { toast } = useToast();
  const router = useRouter(); // Added router

  const [selectedApplication, setSelectedApplication] = useState<ProviderApplication | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [adminReviewNotes, setAdminReviewNotes] = useState("");
  const [showNotesInputFor, setShowNotesInputFor] = useState<string | null>(null); 

  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig(); // For SMTP

  useEffect(() => {
    setIsLoading(true);
    const applicationsCollectionRef = collection(db, PROVIDER_APPLICATION_COLLECTION);
    const q = query(applicationsCollectionRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedApplications = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as ProviderApplication));
      setApplications(fetchedApplications);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching provider applications: ", error);
      toast({ title: "Error", description: "Could not fetch provider applications.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const filteredApplications = useMemo(() => {
    if (filterStatus === "all") {
      return applications;
    }
    return applications.filter(app => app.status === filterStatus);
  }, [applications, filterStatus]);

  const handleUpdateStatus = async (applicationId: string, newStatus: ProviderApplicationStatus, notes?: string) => {
    if (!applicationId) return;
    setIsUpdating(applicationId);
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, applicationId);
      const appToUpdate = applications.find(app => app.id === applicationId);
      if (!appToUpdate) {
          toast({ title: "Error", description: "Application not found.", variant: "destructive"});
          setIsUpdating(null);
          return;
      }

      const updatePayload: Partial<ProviderApplication> = {
        status: newStatus,
        updatedAt: Timestamp.now(),
      };
      if (notes && (newStatus === 'rejected' || newStatus === 'needs_update')) {
        updatePayload.adminReviewNotes = notes;
      }
      
      await updateDoc(appDocRef, updatePayload);
      toast({ title: "Success", description: `Application status updated to ${newStatus}.` });
      setShowNotesInputFor(null); 
      setAdminReviewNotes("");    

      // Send email to provider
      if (appConfig.smtpHost && appConfig.senderEmail && appToUpdate.email && appToUpdate.userId) {
        let emailSubjectAction = "";
        let emailMessageAction = "";
        let notificationType: "success" | "error" | "warning" = "info";
        let notificationLink = `/provider-registration`; // Default link

        switch(newStatus) {
            case 'approved':
                emailSubjectAction = "Your Provider Application has been Approved!";
                emailMessageAction = "Congratulations! Your application is approved. You can now access your provider dashboard.";
                notificationType = "success";
                notificationLink = "/provider"; // Link to dashboard for approved
                break;
            case 'rejected':
                emailSubjectAction = "Update Regarding Your Provider Application";
                emailMessageAction = "Your application was not approved at this time." + (notes ? ` Feedback: ${notes}` : "");
                notificationType = "error";
                break;
            case 'needs_update':
                emailSubjectAction = "Action Required: Update Your Provider Application";
                emailMessageAction = "Your application requires updates." + (notes ? ` Please address: ${notes}` : "");
                notificationType = "warning";
                break;
        }

        if (emailSubjectAction) { // Only send email for specific status changes
            const emailInput: ProviderApplicationStatusEmailInput = {
              providerName: appToUpdate.fullName || "Provider",
              providerEmail: appToUpdate.email,
              applicationStatus: newStatus,
              adminReviewNotes: notes,
              applicationUrl: `${getBaseUrl()}/provider-registration`, 
              smtpHost: appConfig.smtpHost,
              smtpPort: appConfig.smtpPort,
              smtpUser: appConfig.smtpUser,
              smtpPass: appConfig.smtpPass,
              senderEmail: appConfig.senderEmail,
            };
            try {
                await sendProviderApplicationStatusEmail(emailInput);
            } catch (emailError) {
                console.error("Failed to send provider status update email:", emailError);
                toast({ title: "Email Error", description: "Failed to send status update email to provider.", variant: "default" });
            }
        }
        
        // Create in-app notification for the provider
        const providerNotification: FirestoreNotification = {
            userId: appToUpdate.userId,
            title: `Application Status: ${newStatus.replace(/_/g, ' ')}`,
            message: emailMessageAction || `Your application status is now ${newStatus.replace(/_/g, ' ')}.`,
            type: notificationType,
            href: notificationLink,
            read: false,
            createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, "userNotifications"), providerNotification);

      } else {
        if (!appToUpdate.email) console.warn("Provider email missing, cannot send status update email.");
        if (!appConfig.smtpHost || !appConfig.senderEmail) console.warn("SMTP settings not configured. Skipping status update email to provider.");
      }

    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update application status.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };
  
  const handleDeleteApplication = async (applicationId: string) => {
    if (!applicationId) return;
    setIsUpdating(applicationId);
    try {
        await deleteDoc(doc(db, PROVIDER_APPLICATION_COLLECTION, applicationId));
        toast({title: "Success", description: "Provider application deleted."});
    } catch (error) {
        toast({title: "Error", description: "Could not delete application.", variant: "destructive"});
    } finally {
        setIsUpdating(null);
    }
  };

  const handleViewDetails = (application: ProviderApplication) => {
    setSelectedApplication(application);
    setAdminReviewNotes(application.adminReviewNotes || ""); 
    setIsDetailsModalOpen(true);
  };

  const handleEditApplication = (applicationId: string) => {
    if (applicationId) {
      router.push(`/provider-registration?editApplicationId=${applicationId}`);
    }
  };

  const prepareActionWithNotes = (applicationId: string, newStatus: ProviderApplicationStatus) => {
    if (adminReviewNotes.trim() === "" && (newStatus === 'rejected' || newStatus === 'needs_update')) {
        toast({ title: "Notes Required", description: "Please provide notes for rejection or requesting updates.", variant: "destructive"});
        return;
    }
    handleUpdateStatus(applicationId, newStatus, adminReviewNotes);
  };
  
  const getStatusBadgeVariant = (status: ProviderApplicationStatus) => {
    switch (status) {
      case 'approved': return 'default'; 
      case 'pending_review': return 'secondary'; 
      case 'rejected': return 'destructive'; 
      case 'needs_update': return 'outline'; 
      default: return 'outline'; 
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Users2 className="mr-2 h-6 w-6 text-primary" /> Provider Applications
            </CardTitle>
            <CardDescription>
              Review and manage provider registration applications.
            </CardDescription>
          </div>
          <div className="mt-4 sm:mt-0 w-full sm:w-auto sm:min-w-[200px]">
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as ProviderApplicationStatus | "all")}>
              <SelectTrigger><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {applicationStatusOptions.map(status => (
                  <SelectItem key={status} value={status} className="capitalize">{status.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading || isLoadingAppSettings ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : filteredApplications.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {filterStatus === "all" ? "No provider applications found yet." : `No applications found with status: ${filterStatus.replace(/_/g, ' ')}.`}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Avatar</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={app.profilePhotoUrl || undefined} alt={app.fullName || "P"} />
                        <AvatarFallback>{app.fullName ? app.fullName[0].toUpperCase() : <UserCircle />}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <div>{app.fullName || "N/A"}</div>
                      <div className="text-xs text-muted-foreground">{app.email || "No Email"}</div>
                      <div className="text-xs text-muted-foreground">{app.mobileNumber || "No Mobile"}</div>
                    </TableCell>
                    <TableCell>{app.workCategoryName || "N/A"}</TableCell>
                    <TableCell className="text-xs">{formatApplicationTimestamp(app.submittedAt || app.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(app.status)} className={`text-xs capitalize ${app.status === 'approved' ? 'bg-green-500 text-white' : ''}`}>{app.status.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isUpdating === app.id}>
                            {isUpdating === app.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <MoreHorizontal className="h-4 w-4"/>}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDetails(app)}>
                            <Eye className="mr-2 h-4 w-4"/>View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditApplication(app.id!)}>
                            <Edit className="mr-2 h-4 w-4"/>Edit Application
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {app.status !== 'approved' && (
                            <DropdownMenuItem onClick={() => handleUpdateStatus(app.id!, 'approved')}>
                              <CheckCircle className="mr-2 h-4 w-4 text-green-500"/>Approve
                            </DropdownMenuItem>
                          )}
                          {app.status !== 'rejected' && (
                             <DropdownMenuItem onClick={() => setShowNotesInputFor(app.id!)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                               <XCircle className="mr-2 h-4 w-4"/>Reject
                             </DropdownMenuItem>
                          )}
                          {app.status !== 'needs_update' && (
                            <DropdownMenuItem onClick={() => setShowNotesInputFor(app.id!)} className="text-yellow-600 focus:bg-yellow-500/10 focus:text-yellow-600">
                              <AlertTriangle className="mr-2 h-4 w-4"/>Request Update
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                           <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4"/>Delete Application
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                    <AlertDialogDescription>Delete application for {app.fullName || "this provider"}? This cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteApplication(app.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                           </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {showNotesInputFor === app.id && (
                        <div className="mt-2 p-2 border rounded-md bg-muted/50 space-y-2 max-w-xs ml-auto">
                            <Label htmlFor={`admin-notes-${app.id}`} className="text-xs font-medium">Notes for Provider:</Label>
                            <Textarea
                                id={`admin-notes-${app.id}`}
                                placeholder="Enter notes for rejection or update request..."
                                value={adminReviewNotes}
                                onChange={(e) => setAdminReviewNotes(e.target.value)}
                                className="w-full p-2 border rounded text-xs min-h-[60px]"
                                rows={3}
                            />
                            <div className="flex gap-2 justify-end">
                                <Button size="xs" variant="outline" onClick={() => {setShowNotesInputFor(null); setAdminReviewNotes("");}}>Cancel</Button>
                                <Button size="xs" onClick={() => prepareActionWithNotes(app.id!, app.status === 'rejected' ? 'rejected' : 'needs_update')} className="bg-primary hover:bg-primary/90">
                                    Confirm Action
                                </Button>
                            </div>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {selectedApplication && (
        <ProviderApplicationDetailsModal
          application={selectedApplication}
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          onUpdateStatus={(appId, newStatus, notesFromModal) => handleUpdateStatus(appId, newStatus, notesFromModal)}
          isLoadingStatusUpdate={!!isUpdating}
        />
      )}
    </div>
  );
}

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";
