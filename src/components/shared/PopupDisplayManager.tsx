
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import { XIcon, Mail, Loader2, User, Phone } from 'lucide-react'; 
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, addDoc, Timestamp } from 'firebase/firestore'; 
import type { FirestorePopup, PopupDisplayFrequency, InquirySource, InquiryStatus, FirestorePopupInquiry } from '@/types/firestore'; 
import { usePathname, useRouter } from 'next/navigation'; // Added useRouter
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth'; 
import { getGuestId } from '@/lib/guestIdManager'; 
import { useLoading } from '@/contexts/LoadingContext'; // Added useLoading

const POPUP_SESSION_STORAGE_KEY_PREFIX = 'fixbroPopupShown_';
const POPUP_DAY_STORAGE_KEY_PREFIX = 'fixbroPopupDayShown_'; 

const PopupDisplayManager = () => {
  const [allActivePopups, setAllActivePopups] = useState<FirestorePopup[]>([]);
  const [currentPopupToDisplay, setCurrentPopupToDisplay] = useState<FirestorePopup | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [isLoadingPopups, setIsLoadingPopups] = useState(true);
  const pathname = usePathname();
  const router = useRouter(); // Added router
  const { toast } = useToast();
  const [emailForSubscription, setEmailForSubscription] = useState('');
  const [nameForSubscription, setNameForSubscription] = useState(''); 
  const [mobileForSubscription, setMobileForSubscription] = useState(''); 
  const [isSubscribing, setIsSubscribing] = useState(false); 
  const { user, triggerAuthRedirect } = useAuth();  // Added triggerAuthRedirect
  const { showLoading } = useLoading(); // Added showLoading
  const [showPromoCode, setShowPromoCode] = useState(false);

  const popupShownThisLoadRef = useRef(false);
  const exitIntentListenerRef = useRef<(() => void) | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);
  const timerRefs = useRef<NodeJS.Timeout[]>([]);

  const checkFrequency = useCallback((popupId: string, frequency: PopupDisplayFrequency): boolean => {
    if (frequency === "always") return true;

    if (frequency === "once_per_session") {
      const sessionKey = `${POPUP_SESSION_STORAGE_KEY_PREFIX}${popupId}`;
      if (sessionStorage.getItem(sessionKey) === 'true') {
        return false;
      }
    }

    if (frequency === "once_per_day") {
      const dayKey = `${POPUP_DAY_STORAGE_KEY_PREFIX}${popupId}`;
      const lastShownTimestamp = localStorage.getItem(dayKey);
      if (lastShownTimestamp) {
        const today = new Date().toDateString();
        const lastShownDate = new Date(parseInt(lastShownTimestamp, 10)).toDateString();
        if (today === lastShownDate) {
          return false;
        }
      }
    }
    return true;
  }, []);

  const markAsShown = useCallback((popupId: string, frequency: PopupDisplayFrequency) => {
    if (frequency === "once_per_session") {
      const sessionKey = `${POPUP_SESSION_STORAGE_KEY_PREFIX}${popupId}`;
      sessionStorage.setItem(sessionKey, 'true');
    }
    if (frequency === "once_per_day") {
      const dayKey = `${POPUP_DAY_STORAGE_KEY_PREFIX}${popupId}`;
      localStorage.setItem(dayKey, Date.now().toString());
    }
  }, []);

  const activatePopup = useCallback((popup: FirestorePopup) => {
    if (popupShownThisLoadRef.current) return;

    if (checkFrequency(popup.id, popup.displayFrequency)) {
      console.log(`PopupDisplayManager: Activating popup "${popup.name}" (Rule: ${popup.displayRuleType})`);
      setCurrentPopupToDisplay(popup);
      setIsPopupVisible(true);
      markAsShown(popup.id, popup.displayFrequency);
      popupShownThisLoadRef.current = true;

      if (exitIntentListenerRef.current) {
        exitIntentListenerRef.current();
        exitIntentListenerRef.current = null;
      }
      if (scrollListenerRef.current) {
        scrollListenerRef.current();
        scrollListenerRef.current = null;
      }
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    } else {
      console.log(`PopupDisplayManager: Frequency check failed for popup "${popup.name}"`);
    }
  }, [checkFrequency, markAsShown]);


  useEffect(() => {
    const fetchPopupsAndSetupTriggers = async () => {
      setIsLoadingPopups(true);
      popupShownThisLoadRef.current = false;

      try {
        const popupsCollectionRef = collection(db, "adminPopups");
        const q = query(popupsCollectionRef, where("isActive", "==", true), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const fetchedPopups = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestorePopup));
        setAllActivePopups(fetchedPopups);

        const pageLoadPopup = fetchedPopups.find(p => p.displayRuleType === 'on_page_load');
        if (pageLoadPopup) {
          activatePopup(pageLoadPopup);
        }
        if (popupShownThisLoadRef.current) { setIsLoadingPopups(false); return; }

        fetchedPopups.filter(p => p.displayRuleType === 'after_x_seconds').forEach(popup => {
          if (!popupShownThisLoadRef.current && checkFrequency(popup.id, popup.displayFrequency)) {
            const delay = (popup.displayRuleValue || 5) * 1000;
            const timerId = setTimeout(() => {
              if (!popupShownThisLoadRef.current) {
                activatePopup(popup);
              }
            }, delay);
            timerRefs.current.push(timerId);
          }
        });
        if (popupShownThisLoadRef.current) { setIsLoadingPopups(false); return; }

        const scrollPopup = fetchedPopups.find(p => p.displayRuleType === 'on_scroll_percentage');
        if (scrollPopup && !popupShownThisLoadRef.current && checkFrequency(scrollPopup.id, scrollPopup.displayFrequency)) {
          const handleScroll = () => {
            if (popupShownThisLoadRef.current) {
              window.removeEventListener('scroll', handleScroll);
              return;
            }
            const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
            if (scrollPercent >= (scrollPopup.displayRuleValue || 50)) {
              activatePopup(scrollPopup);
              window.removeEventListener('scroll', handleScroll);
            }
          };
          window.addEventListener('scroll', handleScroll, { passive: true });
          scrollListenerRef.current = () => window.removeEventListener('scroll', handleScroll);
        }
        if (popupShownThisLoadRef.current) { setIsLoadingPopups(false); return; }

        const exitIntentPopup = fetchedPopups.find(p => p.displayRuleType === 'on_exit_intent');
        if (exitIntentPopup && !popupShownThisLoadRef.current && checkFrequency(exitIntentPopup.id, exitIntentPopup.displayFrequency)) {
          const isDesktop = window.innerWidth >= 768;

          if (isDesktop) {
            const handleDesktopMouseOut = (e: MouseEvent) => {
              if (popupShownThisLoadRef.current) {
                document.documentElement.removeEventListener('mouseout', handleDesktopMouseOut);
                return;
              }
              if (e.clientY <= 0) {
                activatePopup(exitIntentPopup);
                document.documentElement.removeEventListener('mouseout', handleDesktopMouseOut);
              }
            };
            document.documentElement.addEventListener('mouseout', handleDesktopMouseOut);
            exitIntentListenerRef.current = () => document.documentElement.removeEventListener('mouseout', handleDesktopMouseOut);
          } else { 
            const mobileExitIntentStateKey = 'fixbroMobileExitIntentMarker';
            let statePushedByManager = false;
            const pushOurState = () => {
                if (history.state?.[mobileExitIntentStateKey] !== true) {
                    history.pushState({ [mobileExitIntentStateKey]: true }, "");
                    statePushedByManager = true;
                }
            };
            pushOurState(); 
            const handleMobilePopState = (event: PopStateEvent) => {
              if (event.state?.[mobileExitIntentStateKey] !== true && !popupShownThisLoadRef.current) {
                activatePopup(exitIntentPopup);
              }
              window.removeEventListener('popstate', handleMobilePopState);
              exitIntentListenerRef.current = null; 
            };
            window.addEventListener('popstate', handleMobilePopState);
            exitIntentListenerRef.current = () => {
              window.removeEventListener('popstate', handleMobilePopState);
            };
          }
        }

      } catch (error) {
        console.error("Error fetching or setting up popups:", error);
        toast({ title: "Popup System Error", description: "Could not initialize popups.", variant: "destructive" });
      } finally {
        setIsLoadingPopups(false);
      }
    };

    if (pathname === '/') {
      fetchPopupsAndSetupTriggers();
    } else {
      setIsLoadingPopups(false);
    }

    return () => {
      if (exitIntentListenerRef.current) {
        exitIntentListenerRef.current();
        exitIntentListenerRef.current = null;
      }
      if (scrollListenerRef.current) {
        scrollListenerRef.current();
        scrollListenerRef.current = null;
      }
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
  }, [pathname, toast, activatePopup, checkFrequency]);


  const handlePopupClose = () => {
    setIsPopupVisible(false);
    setEmailForSubscription('');
    setNameForSubscription(''); 
    setMobileForSubscription(''); 
  };

  const handleActionClick = (targetUrl?: string | null) => {
    if (targetUrl) {
      if (targetUrl.startsWith('http')) {
        window.open(targetUrl, '_blank');
      } else {
        showLoading();
        if (!user && (targetUrl.startsWith('/category/') || targetUrl.startsWith('/service/'))) {
            triggerAuthRedirect(targetUrl);
        } else {
            router.push(targetUrl);
        }
      }
    }
    handlePopupClose();
  };
  
  const handleSubscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentPopupToDisplay?.showEmailInput && (!emailForSubscription || !/^\S+@\S+\.\S+$/.test(emailForSubscription))) {
        toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
        return;
    }
    if (currentPopupToDisplay?.showNameInput && !nameForSubscription.trim()) {
        toast({ title: "Name Required", description: "Please enter your name.", variant: "destructive" });
        return;
    }
    if (currentPopupToDisplay?.showMobileInput && (!mobileForSubscription.trim() || !/^\+?[1-9]\d{1,14}$/.test(mobileForSubscription))) {
        toast({ title: "Invalid Mobile", description: "Please enter a valid mobile number.", variant: "destructive" });
        return;
    }
    if (!currentPopupToDisplay) {
        toast({ title: "Error", description: "Popup data missing.", variant: "destructive"});
        return;
    }
    setIsSubscribing(true);
    
    let inquirySource: InquirySource = 'other_popup';
    if (currentPopupToDisplay.popupType === 'newsletter_signup') inquirySource = 'newsletter_popup';
    else if (currentPopupToDisplay.popupType === 'lead_capture') inquirySource = 'lead_capture_popup';
    else if (currentPopupToDisplay.popupType === 'subscribe') inquirySource = 'newsletter_popup';

    const capturedFormData: Record<string, any> = {};
    if (currentPopupToDisplay.showEmailInput && emailForSubscription) capturedFormData.email = emailForSubscription;
    if (currentPopupToDisplay.showNameInput && nameForSubscription) capturedFormData.name = nameForSubscription;
    if (currentPopupToDisplay.showMobileInput && mobileForSubscription) capturedFormData.mobile = mobileForSubscription;


    const popupInquiryData: Omit<FirestorePopupInquiry, 'id'> = {
        popupId: currentPopupToDisplay.id,
        popupName: currentPopupToDisplay.name,
        popupType: currentPopupToDisplay.popupType,
        email: (currentPopupToDisplay.showEmailInput && emailForSubscription) ? emailForSubscription : undefined,
        name: (currentPopupToDisplay.showNameInput && nameForSubscription) ? nameForSubscription : (user?.displayName || undefined),
        phone: (currentPopupToDisplay.showMobileInput && mobileForSubscription) ? mobileForSubscription : undefined,
        submittedAt: Timestamp.now(),
        status: 'new' as InquiryStatus,
        source: inquirySource,
        formData: capturedFormData,
    };

    try {
        await addDoc(collection(db, "popupSubmissions"), popupInquiryData);
        toast({ title: "Submitted!", description: `Thank you for your submission.`, className:"bg-green-100 text-green-700 border-green-300" });
        
        setEmailForSubscription(''); 
        setNameForSubscription('');
        setMobileForSubscription('');
        
        if (currentPopupToDisplay?.targetUrl) {
            setTimeout(() => {
                 if (currentPopupToDisplay.targetUrl!.startsWith('http')) {
                    window.open(currentPopupToDisplay.targetUrl!, '_blank');
                 } else {
                    showLoading();
                    if (!user && (currentPopupToDisplay.targetUrl!.startsWith('/category/') || currentPopupToDisplay.targetUrl!.startsWith('/service/'))) {
                         triggerAuthRedirect(currentPopupToDisplay.targetUrl!);
                    } else {
                        router.push(currentPopupToDisplay.targetUrl!);
                    }
                 }
                 handlePopupClose();
            }, 1500);
        } else {
            handlePopupClose();
        }
    } catch (error) {
        console.error("Error saving popup submission:", error);
        toast({ title: "Submission Failed", description: "Could not process your submission. Please try again.", variant: "destructive" });
    } finally {
        setIsSubscribing(false);
    }
  };

  const getVideoEmbedUrl = (url: string): string => {
    let videoId;
    if (url.includes("youtube.com/watch?v=")) {
      videoId = url.split("v=")[1]?.split("&")[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&loop=1&playlist=${videoId}`;
    }
    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&loop=1&playlist=${videoId}`;
    }
    if (url.includes("vimeo.com/")) {
      videoId = url.split("vimeo.com/")[1]?.split("?")[0];
      if (videoId && !isNaN(Number(videoId))) {
         return `https://player.vimeo.com/video/${videoId}?autoplay=1&muted=1&controls=0&loop=1&autopause=0&background=1`;
      }
    }
    return url;
  };

  useEffect(() => {
    if (currentPopupToDisplay?.promoCode) {
        const requiredFieldsCount = currentPopupToDisplay.promoCodeConditionFieldsRequired ?? 0;

        if (requiredFieldsCount === 0) {
            setShowPromoCode(true);
            return;
        }

        let numEnabledFields = 0;
        if (currentPopupToDisplay.showNameInput) numEnabledFields++;
        if (currentPopupToDisplay.showEmailInput) numEnabledFields++;
        if (currentPopupToDisplay.showMobileInput) numEnabledFields++;

        if (numEnabledFields === 0 && requiredFieldsCount > 0) {
            setShowPromoCode(false);
            return;
        }
        
        let filledAndValidCount = 0;
        if (currentPopupToDisplay.showNameInput && nameForSubscription.trim() !== "") {
            filledAndValidCount++;
        }
        if (currentPopupToDisplay.showEmailInput && emailForSubscription.trim() !== "" && /^\S+@\S+\.\S+$/.test(emailForSubscription)) {
            filledAndValidCount++;
        }
        if (currentPopupToDisplay.showMobileInput && mobileForSubscription.trim() !== "" && /^\+?[1-9]\d{1,14}$/.test(mobileForSubscription)) {
            filledAndValidCount++;
        }
        setShowPromoCode(filledAndValidCount >= requiredFieldsCount);
    } else {
        setShowPromoCode(false);
    }
  }, [currentPopupToDisplay, nameForSubscription, emailForSubscription, mobileForSubscription]);


  if (isLoadingPopups || !currentPopupToDisplay || !isPopupVisible || pathname !== '/') {
    return null;
  }

  const isDirectVideoLink = currentPopupToDisplay.videoUrl && (currentPopupToDisplay.videoUrl.endsWith('.mp4') || currentPopupToDisplay.videoUrl.endsWith('.webm') || currentPopupToDisplay.videoUrl.endsWith('.ogv'));
  const embedUrl = currentPopupToDisplay.videoUrl ? getVideoEmbedUrl(currentPopupToDisplay.videoUrl) : '';

  return (
    <Dialog open={isPopupVisible} onOpenChange={(open) => { if (!open) handlePopupClose(); }}>
      <DialogContent className="max-w-[90%] sm:max-w-md md:max-w-lg p-0 overflow-hidden shadow-2xl rounded-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
        {currentPopupToDisplay.showCloseButton !== false && (
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 z-50 h-7 w-7 rounded-full bg-background/60 hover:bg-background/90 text-muted-foreground hover:text-foreground backdrop-blur-sm"
              aria-label="Close popup"
              onClick={handlePopupClose} 
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </DialogClose>
        )}

        <div 
          className="relative"
          onClick={currentPopupToDisplay.popupType === 'video' && currentPopupToDisplay.targetUrl ? () => handleActionClick(currentPopupToDisplay.targetUrl) : undefined}
          style={currentPopupToDisplay.popupType === 'video' && currentPopupToDisplay.targetUrl ? { cursor: 'pointer' } : {}}
        >
          {currentPopupToDisplay.imageUrl && currentPopupToDisplay.popupType !== 'video' && (
          <div className="flex items-center justify-center">
            <div 
              className="relative aspect-square w-48 md:w-64 overflow-hidden"
              onClick={currentPopupToDisplay.targetUrl ? () => handleActionClick(currentPopupToDisplay.targetUrl) : undefined}
              style={currentPopupToDisplay.targetUrl ? {cursor: 'pointer'} : {}}
            >
              <Image
                src={currentPopupToDisplay.imageUrl}
                alt={currentPopupToDisplay.title || "Popup Image"}
                fill
                className="object-contain object-center"
                data-ai-hint={currentPopupToDisplay.imageHint || "popup marketing image"}
              />
            </div>
          </div>
          )}
          
          {currentPopupToDisplay.popupType === 'video' && currentPopupToDisplay.videoUrl && (
            <div className="relative w-full aspect-video bg-black">
              {isDirectVideoLink ? (
                 <video
                    src={embedUrl}
                    className="w-full h-full"
                    autoPlay
                    muted
                    loop
                    playsInline
                    webkit-playsinline="true" 
                />
              ) : (
                <iframe
                    src={embedUrl}
                    title={currentPopupToDisplay.title || "Popup Video"}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen={true}
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                ></iframe>
              )}
            </div>
          )}
          
          <div className="p-6 space-y-3 text-center">
            <DialogHeader >
              {currentPopupToDisplay.title && (
                <DialogTitle className="text-center text-2xl font-headline text-foreground">
                  {currentPopupToDisplay.title}
                </DialogTitle>
              )}
            </DialogHeader>
            {currentPopupToDisplay.displayText && (
              <DialogDescription className="text-muted-foreground text-base">
                {currentPopupToDisplay.displayText}
              </DialogDescription>
            )}
            {currentPopupToDisplay.promoCode && showPromoCode && (
              <div className="py-2">
                <p className="text-sm text-muted-foreground">Use promo code:</p>
                <p className="text-lg font-bold text-primary tracking-wider border border-dashed border-primary/50 bg-primary/10 py-1.5 px-3 rounded-md inline-block">
                  {currentPopupToDisplay.promoCode}
                </p>
              </div>
            )}
            
            {(currentPopupToDisplay.showNameInput || currentPopupToDisplay.showEmailInput || currentPopupToDisplay.showMobileInput) && (
              <form onSubmit={handleSubscribe} className="flex flex-col gap-3 mt-2">
                {currentPopupToDisplay.showNameInput && (
                    <Input
                        type="text"
                        placeholder="Full Name"
                        value={nameForSubscription}
                        onChange={(e) => setNameForSubscription(e.target.value)}
                        required={currentPopupToDisplay.showNameInput} 
                        className="h-10 text-base"
                        disabled={isSubscribing}
                        aria-label="Full Name"
                    />
                )}
                {currentPopupToDisplay.showEmailInput && (
                    <Input
                        type="email"
                        placeholder="Enter your email"
                        value={emailForSubscription}
                        onChange={(e) => setEmailForSubscription(e.target.value)}
                        required={currentPopupToDisplay.showEmailInput}
                        className="h-10 text-base"
                        disabled={isSubscribing}
                        aria-label="Email Address"
                    />
                )}
                 {currentPopupToDisplay.showMobileInput && (
                    <Input
                        type="tel"
                        placeholder="Mobile Number"
                        value={mobileForSubscription}
                        onChange={(e) => setMobileForSubscription(e.target.value)}
                        required={currentPopupToDisplay.showMobileInput} 
                        className="h-10 text-base"
                        disabled={isSubscribing}
                        aria-label="Mobile Number"
                    />
                )}
                <Button type="submit" className="w-full h-10" disabled={isSubscribing}>
                  {isSubscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4"/>}
                  Submit
                </Button>
              </form>
            )}

             {currentPopupToDisplay.buttonText && currentPopupToDisplay.targetUrl && (
               <DialogFooter className="mt-4 sm:justify-center">
                 <Button size="lg" onClick={() => handleActionClick(currentPopupToDisplay.targetUrl)} className="w-full sm:w-auto">
                   {currentPopupToDisplay.buttonText}
                 </Button>
               </DialogFooter>
             )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PopupDisplayManager;

