
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'; // Added useSearchParams
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ShieldOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp, collection, getDocs, query, orderBy, addDoc, where, limit } from "firebase/firestore";
import type {
  ProviderApplication,
  ProviderApplicationStatus,
  ProviderControlOptions,
  FirestoreCategory,
  ExperienceLevelOption,
  SkillLevelOption,
  QualificationOption,
  LanguageOption,
  OptionalDocumentTypeOption,
  FirestoreUser,
  KycDocument,
  BankDetails,
  PinCodeAreaMapping,
  FirestoreNotification,
} from '@/types/firestore';
import ProviderRegistrationStepper from '@/components/provider-registration/ProviderRegistrationStepper';
import Step0AuthPrompt from '@/components/provider-registration/Step0AuthPrompt';
import ApplicationStatusDisplay from '@/components/provider-registration/ApplicationStatusDisplay';
import Step1CategorySkills from '@/components/provider-registration/Step1CategorySkills';
import Step2PersonalInfo from '@/components/provider-registration/Step2PersonalInfo';
import Step3KycDocuments from '@/components/provider-registration/Step3KycDocuments';
import Step4LocationBank from '@/components/provider-registration/Step4LocationBank';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { sendNewProviderApplicationAdminEmail, type NewProviderApplicationAdminEmailInput } from '@/ai/flows/sendProviderApplicationAdminNotificationFlow';
import { getBaseUrl } from '@/lib/config';
import { useToast } from '@/hooks/use-toast'; // Added useToast

const RegistrationCompleted = ({ isAdminEdit }: { isAdminEdit?: boolean }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-center text-2xl font-headline">
        {isAdminEdit ? "Application Updated" : "Application Submitted!"}
      </CardTitle>
    </CardHeader>
    <CardContent className="text-center">
      <p className="text-muted-foreground mb-6">
        {isAdminEdit 
          ? "The provider's application details have been successfully updated." 
          : "Thank you for submitting your provider application. We will review it and get back to you soon regarding the status."}
      </p>
      <Link href={isAdminEdit ? "/admin/provider-applications" : "/"}>
        <Button>{isAdminEdit ? "Back to Admin Panel" : "Back to Home"}</Button>
      </Link>
    </CardContent>
  </Card>
);

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";
const PROVIDER_CONTROL_OPTIONS_COLLECTION = "providerControlOptions";

export default function ProviderRegistrationPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams(); // For edit mode
  const { toast } = useToast(); // Added toast

  const [currentStep, setCurrentStep] = useState(0);
  const [applicationData, setApplicationData] = useState<Partial<ProviderApplication>>({});
  const [applicationStatus, setApplicationStatus] = useState<ProviderApplicationStatus | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSavingStep, setIsSavingStep] = useState(false);

  const [controlOptions, setControlOptions] = useState<ProviderControlOptions | null>(null);
  const [isLoadingControls, setIsLoadingControls] = useState(true);
  const [userFirestoreData, setUserFirestoreData] = useState<Partial<FirestoreUser> | null>(null);

  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();

  // For admin edit mode
  const [editingApplicationIdForAdmin, setEditingApplicationIdForAdmin] = useState<string | null>(null);
  const [isEditModeByAdmin, setIsEditModeByAdmin] = useState(false);

  useEffect(() => {
    const editAppId = searchParams.get('editApplicationId');
    if (editAppId && user?.email === ADMIN_EMAIL) {
      setEditingApplicationIdForAdmin(editAppId);
      setIsEditModeByAdmin(true);
    } else {
      setEditingApplicationIdForAdmin(null);
      setIsEditModeByAdmin(false);
    }
  }, [searchParams, user]);

  const fetchControlOptions = useCallback(async () => {
    setIsLoadingControls(true);
    try {
      const fetchArrayOption = async (docId: string, fieldName: string) => {
        const docRef = doc(db, PROVIDER_CONTROL_OPTIONS_COLLECTION, docId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? (docSnap.data()[fieldName] as any[] || []) : [];
      };

      const categoriesSnap = await getDocs(query(collection(db, "adminCategories"), orderBy("name", "asc")));
      const fetchedCategories = categoriesSnap.docs.map(d => ({...d.data(), id: d.id } as FirestoreCategory));

      const [experienceLevels, skillLevels, qualificationOptions, languageOptions, optionalDocTypes, pinCodeMappingsDoc] = await Promise.all([
        fetchArrayOption("experienceLevels", "levels"),
        fetchArrayOption("skillLevels", "levels"),
        fetchArrayOption("qualificationOptions", "options"),
        fetchArrayOption("languageOptions", "options"),
        fetchArrayOption("optionalDocTypes", "options"),
        getDoc(doc(db, PROVIDER_CONTROL_OPTIONS_COLLECTION, "pinCodeAreaMappings")),
      ]);
      
      const fetchedPinCodeMappings = pinCodeMappingsDoc.exists() ? (pinCodeMappingsDoc.data().mappings as PinCodeAreaMapping[] || []) : [];

      setControlOptions({
        categories: fetchedCategories,
        experienceLevels,
        skillLevels,
        qualificationOptions,
        languageOptions,
        optionalDocTypes,
        pinCodeAreaMappings: fetchedPinCodeMappings.sort((a, b) => a.order - b.order),
      });
    } catch (error) {
      console.error("Error fetching control options:", error);
    } finally {
      setIsLoadingControls(false);
    }
  }, []);

  const fetchApplicationAndUserData = useCallback(async () => {
    const targetUserId = isEditModeByAdmin ? editingApplicationIdForAdmin : user?.uid;
    if (!targetUserId) {
      setIsLoadingPage(false); // No user or admin edit ID, nothing to load for application
      return;
    }
    setIsLoadingPage(true);
    let fetchedUserDbData: Partial<FirestoreUser> = {};
    try {
      // If admin is editing, we still might want to fetch the provider's "users" collection data
      // if it contains relevant info not in ProviderApplication (e.g. original email if admin can change it)
      // For now, we fetch based on targetUserId which works for both provider self-view and admin edit.
      const userDocRef = doc(db, "users", targetUserId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        fetchedUserDbData = userDocSnap.data() as FirestoreUser;
        setUserFirestoreData(fetchedUserDbData); // This might be the provider's data or admin's own data if not editing
      }

      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, targetUserId);
      const docSnap = await getDoc(appDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as ProviderApplication;
        setApplicationData(data);
        setApplicationStatus(data.status);
        if (!isEditModeByAdmin) { // Provider's own flow
          if (data.status === 'approved') {
            // router.push('/provider/dashboard'); // Placeholder
          } else if (data.status === 'pending_review' || data.status === 'rejected') {
            // Status handled by ApplicationStatusDisplay
          } else {
            if (data.status.startsWith('pending_step_')) {
              setCurrentStep(parseInt(data.status.replace('pending_step_', ''), 10));
            } else if (data.status === 'needs_update') {
              setCurrentStep(1); 
            }
          }
        } else { // Admin is editing, set currentStep to 1 to allow editing from start
            setCurrentStep(1);
        }
      } else { // No application found
        if (isEditModeByAdmin) {
          toast({ title: "Error", description: "Application not found for editing.", variant: "destructive" });
          router.push('/admin/provider-applications'); // Redirect admin if no app to edit
          return;
        }
        // Provider is starting fresh
        const initialAppData: Partial<ProviderApplication> = {
          userId: user?.uid, // Should be set if user exists
          createdAt: Timestamp.now(),
          fullName: user?.displayName || fetchedUserDbData.displayName || "",
          email: user?.email || fetchedUserDbData.email || "",
          mobileNumber: fetchedUserDbData.mobileNumber || "",
        };
        setApplicationData(initialAppData);
        setApplicationStatus(null);
        setCurrentStep(1);
      }
    } catch (error) {
      console.error("Error fetching provider application or user data:", error);
    } finally {
      setIsLoadingPage(false);
    }
  }, [user, isEditModeByAdmin, editingApplicationIdForAdmin, router, toast]);

  useEffect(() => {
    if (!authLoading && !isLoadingAppConfig) {
      if (user || (isEditModeByAdmin && editingApplicationIdForAdmin)) { // Proceed if logged in user OR admin is editing
        fetchApplicationAndUserData();
        fetchControlOptions();
      } else { // No user and not admin edit mode
        setCurrentStep(0); // Show auth prompt
        setIsLoadingPage(false);
        setIsLoadingControls(false);
      }
    }
  }, [user, authLoading, fetchApplicationAndUserData, fetchControlOptions, isLoadingAppConfig, isEditModeByAdmin, editingApplicationIdForAdmin]);

  const handleSaveStep = async (
    stepData: Partial<ProviderApplication>,
    nextStepStatus: ProviderApplicationStatus, // This status is for provider's own progression
    newUploadedFileUrl?: string | null,
    fileFieldKey?: keyof Pick<ProviderApplication, 'profilePhotoUrl' | 'aadhaar' | 'pan' | 'optionalDocuments' | 'bankDetails' | 'signatureUrl'>
  ) => {
    const targetUserIdForSave = editingApplicationIdForAdmin || user?.uid;
    if (!targetUserIdForSave) return;
    setIsSavingStep(true);
  
    const dataToUpdate: Partial<ProviderApplication> = { ...applicationData, ...stepData };
  
    if (fileFieldKey === 'profilePhotoUrl') {
        dataToUpdate.profilePhotoUrl = newUploadedFileUrl === undefined ? applicationData.profilePhotoUrl : newUploadedFileUrl;
    } else if (fileFieldKey === 'signatureUrl') {
        dataToUpdate.signatureUrl = newUploadedFileUrl === undefined ? applicationData.signatureUrl : newUploadedFileUrl;
        if ('signatureFileName' in stepData) dataToUpdate.signatureFileName = stepData.signatureFileName;
    } else if (fileFieldKey === 'bankDetails' && stepData.bankDetails) {
        dataToUpdate.bankDetails = {
          ...(applicationData.bankDetails || {}), ...stepData.bankDetails, 
          cancelledChequeUrl: newUploadedFileUrl === undefined ? applicationData.bankDetails?.cancelledChequeUrl : newUploadedFileUrl,
        };
        if ('cancelledChequeFileName' in stepData.bankDetails) (dataToUpdate.bankDetails as BankDetails).cancelledChequeFileName = stepData.bankDetails.cancelledChequeFileName;
    } else if (fileFieldKey === 'aadhaar' && stepData.aadhaar) dataToUpdate.aadhaar = stepData.aadhaar;
    else if (fileFieldKey === 'pan' && stepData.pan) dataToUpdate.pan = stepData.pan;
    else if (fileFieldKey === 'optionalDocuments' && stepData.optionalDocuments) dataToUpdate.optionalDocuments = stepData.optionalDocuments;
  
    const currentStatusForSave = isEditModeByAdmin ? (applicationData.status || 'pending_review') : nextStepStatus;

    const currentAppData: Partial<ProviderApplication> = {
      ...dataToUpdate,
      status: currentStatusForSave, // Preserve admin-edited status, or update for provider
      userId: targetUserIdForSave,
      updatedAt: Timestamp.now(),
    };
  
    if (!currentAppData.createdAt && !isEditModeByAdmin) { // Only set createdAt if it's a new application by provider
      currentAppData.createdAt = Timestamp.now();
    }
    setApplicationData(currentAppData); // Update local state immediately
  
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, targetUserIdForSave);
      await setDoc(appDocRef, currentAppData, { merge: true });
    } catch (error) {
      console.error("Error saving step data:", error);
    } finally {
      setIsSavingStep(false);
    }
  };

  const handleNextStep = async (stepDataFromComponent: Partial<ProviderApplication>, uploadedFileUrl?: string | null, fileFieldKey?: keyof ProviderApplication) => {
    const nextStep = currentStep + 1;
    // For provider, status is pending_step_X. For admin, status should not change during intermediate steps.
    const nextProviderStepStatus = `pending_step_${nextStep}` as ProviderApplicationStatus;
    await handleSaveStep(stepDataFromComponent, nextProviderStepStatus, uploadedFileUrl, fileFieldKey as any);
    setCurrentStep(nextStep);
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleFinalSubmitApplication = async (finalStepData: Partial<ProviderApplication>) => {
    const targetUserIdForSubmit = editingApplicationIdForAdmin || user?.uid;
    if (!targetUserIdForSubmit) return;
    setIsSavingStep(true);

    const completeFinalData: Partial<ProviderApplication> = {
      ...applicationData, ...finalStepData,
      updatedAt: Timestamp.now(),
    };
    
    if (isEditModeByAdmin) {
      // Admin is editing, preserve current status (or allow admin to change it separately)
      // `submittedAt` is not changed. `createdAt` is preserved.
      completeFinalData.status = applicationData.status || 'pending_review'; // Keep existing status
    } else {
      // Provider is submitting
      completeFinalData.status = 'pending_review';
      if (!applicationData.submittedAt) completeFinalData.submittedAt = Timestamp.now();
      if (!applicationData.createdAt) completeFinalData.createdAt = Timestamp.now();
    }
    setApplicationData(completeFinalData);

    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, targetUserIdForSubmit);
      await setDoc(appDocRef, completeFinalData, { merge: true });

      if (isEditModeByAdmin) {
        toast({ title: "Application Updated", description: "Provider application details saved by admin." });
        // Notify provider about admin edit
        const providerNotification: FirestoreNotification = {
          userId: targetUserIdForSubmit, // The provider's ID
          title: "Application Updated by Admin",
          message: `An administrator has made changes to your provider application. Please review.`,
          type: 'info',
          href: `/provider-registration`, // Link for provider to view their application
          read: false,
          createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, "userNotifications"), providerNotification);
        router.push('/admin/provider-applications');
      } else {
        // Provider submitted - original logic
        setApplicationStatus('pending_review');
        setCurrentStep(5); // Move to "Completed" display step for provider

        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        let adminUid: string | null = null;
        if (!adminSnapshot.empty) adminUid = adminSnapshot.docs[0].id;

        if (adminUid) {
          const adminNotificationData: FirestoreNotification = {
            userId: adminUid, title: "New Provider Application",
            message: `Provider ${completeFinalData.fullName || user?.email} has submitted an application. Category: ${completeFinalData.workCategoryName || 'N/A'}.`,
            type: 'admin_alert', href: `/admin/provider-applications?appId=${targetUserIdForSubmit}`,
            read: false, createdAt: Timestamp.now(),
          };
          await addDoc(collection(db, "userNotifications"), adminNotificationData);
        }

        if (appConfig.smtpHost && appConfig.senderEmail) {
          const emailInput: NewProviderApplicationAdminEmailInput = {
            applicationId: targetUserIdForSubmit,
            providerName: completeFinalData.fullName || user?.displayName || "N/A",
            providerEmail: user?.email || "N/A",
            providerCategory: completeFinalData.workCategoryName || "N/A",
            applicationUrl: `${getBaseUrl()}/admin/provider-applications?appId=${targetUserIdForSubmit}`,
            smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort,
            smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail,
          };
          try { await sendNewProviderApplicationAdminEmail(emailInput); } 
          catch (emailError) { console.error("Failed to send admin notification email:", emailError); }
        }
      }
    } catch (error) {
      console.error("Error during final application submission/update:", error);
      toast({ title: "Error", description: `Could not ${isEditModeByAdmin ? 'update' : 'submit'} application.`, variant: "destructive" });
    } finally {
      setIsSavingStep(false);
    }
  };

  if (authLoading || isLoadingPage || isLoadingControls || isLoadingAppConfig) {
    return (<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>);
  }

  if (!appConfig.isProviderRegistrationEnabled && user?.email !== ADMIN_EMAIL && !isEditModeByAdmin) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShieldOff className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-4">Registrations Closed</h1>
        <p className="text-lg text-muted-foreground mb-8">We are not accepting new provider registrations at this time. Please check back later.</p>
        <Link href="/"><Button variant="outline">Go Back to Home</Button></Link>
      </div>
    );
  }

  const renderStepContent = () => {
    if (!isEditModeByAdmin && applicationStatus === 'approved') return <ApplicationStatusDisplay status="approved" />;
    if (!isEditModeByAdmin && applicationStatus === 'rejected') return <ApplicationStatusDisplay status="rejected" message={applicationData.adminReviewNotes} />;
    if (!isEditModeByAdmin && applicationStatus === 'pending_review') return <ApplicationStatusDisplay status="pending_review" />;

    const initialStepDataForForm = {
        ...applicationData,
        fullName: applicationData.fullName || user?.displayName || userFirestoreData?.displayName || "",
        email: applicationData.email || user?.email || userFirestoreData?.email || "",
        mobileNumber: applicationData.mobileNumber || userFirestoreData?.mobileNumber || "",
    };

    switch (currentStep) {
      case 0: return <Step0AuthPrompt redirectUrl="/provider-registration" />;
      case 1: return <Step1CategorySkills onNext={handleNextStep} initialData={applicationData} controlOptions={controlOptions} isSaving={isSavingStep} />;
      case 2: return <Step2PersonalInfo onNext={handleNextStep} onPrevious={handlePreviousStep} initialData={initialStepDataForForm} controlOptions={controlOptions} isSaving={isSavingStep} userUid={editingApplicationIdForAdmin || user?.uid || ""} />;
      case 3: return <Step3KycDocuments onNext={handleNextStep} onPrevious={handlePreviousStep} initialData={initialStepDataForForm} controlOptions={controlOptions} isSaving={isSavingStep} userUid={editingApplicationIdForAdmin || user?.uid || ""} />;
      case 4: return <Step4LocationBank onSubmit={handleFinalSubmitApplication} onPrevious={handlePreviousStep} initialData={initialStepDataForForm} controlOptions={controlOptions} isSaving={isSavingStep} userUid={editingApplicationIdForAdmin || user?.uid || ""} isEditModeByAdmin={isEditModeByAdmin} />;
      case 5: return <RegistrationCompleted isAdminEdit={isEditModeByAdmin} />; // For provider after submission
      default: return <Card><CardContent className="pt-6">Loading step or unknown state...</CardContent></Card>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 min-h-screen">
      <Card className="max-w-3xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl font-headline text-center">
            {isEditModeByAdmin ? "Edit Provider Application" : "Provider Registration"}
          </CardTitle>
          {currentStep > 0 && currentStep < 5 && (
            <CardDescription className="text-center">
              {isEditModeByAdmin 
                ? `Editing application for: ${applicationData.fullName || editingApplicationIdForAdmin}`
                : "Complete the following steps to join our network of professionals."}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {currentStep > 0 && currentStep < 5 && (
            <ProviderRegistrationStepper currentStep={currentStep} />
          )}
          <div className="mt-6">
            {renderStepContent()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
