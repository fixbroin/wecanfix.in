
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings, DollarSign, CreditCard, Clock, Save, Loader2, AlertCircle, MapPin as MapIcon, MailIcon, PlaySquare, Percent, Ban, Users } from "lucide-react"; // Renamed MapPin, added Users
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import type { AppSettings } from '@/types/firestore'; 
import { defaultAppSettings } from '@/config/appDefaults'; 

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";


export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const loadSettingsFromFirestore = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const settingsDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const firestoreData = docSnap.data() as Partial<AppSettings>;
        // Ensure all fields from defaultAppSettings are present, overriding with Firestore data
        const mergedSettings = { 
          ...defaultAppSettings, 
          ...firestoreData,
          timeSlotSettings: { // Deep merge for timeSlotSettings
            ...defaultAppSettings.timeSlotSettings,
            ...(firestoreData.timeSlotSettings || {}),
            morning: { ...defaultAppSettings.timeSlotSettings.morning, ...(firestoreData.timeSlotSettings?.morning || {}) },
            afternoon: { ...defaultAppSettings.timeSlotSettings.afternoon, ...(firestoreData.timeSlotSettings?.afternoon || {}) },
            evening: { ...defaultAppSettings.timeSlotSettings.evening, ...(firestoreData.timeSlotSettings?.evening || {}) },
          },
           // Merge cancellation policy settings
          enableCancellationPolicy: typeof firestoreData.enableCancellationPolicy === 'boolean' ? firestoreData.enableCancellationPolicy : defaultAppSettings.enableCancellationPolicy,
          freeCancellationDays: firestoreData.freeCancellationDays ?? defaultAppSettings.freeCancellationDays,
          freeCancellationHours: firestoreData.freeCancellationHours ?? defaultAppSettings.freeCancellationHours,
          freeCancellationMinutes: firestoreData.freeCancellationMinutes ?? defaultAppSettings.freeCancellationMinutes,
          cancellationFeeType: firestoreData.cancellationFeeType ?? defaultAppSettings.cancellationFeeType,
          cancellationFeeValue: firestoreData.cancellationFeeValue ?? defaultAppSettings.cancellationFeeValue,
          maxProviderRadiusKm: firestoreData.maxProviderRadiusKm ?? defaultAppSettings.maxProviderRadiusKm, // Merge new field
        };
        setSettings(mergedSettings);
      } else {
        setSettings(defaultAppSettings);
      }
    } catch (e) {
      console.error("Failed to load settings from Firestore", e);
      toast({ title: "Error Loading Settings", description: "Could not load settings from database. Using defaults.", variant: "destructive" });
      setSettings(defaultAppSettings); 
    } finally {
      setIsLoadingSettings(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettingsFromFirestore();
  }, [loadSettingsFromFirestore]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const [section, field, subField] = name.split('.');

    setSettings(prev => {
      const newSettings = JSON.parse(JSON.stringify(prev)); 

      if (section === "timeSlotSettings" && field && subField) {
        if (!newSettings.timeSlotSettings) newSettings.timeSlotSettings = { ...defaultAppSettings.timeSlotSettings };
        (newSettings.timeSlotSettings[field as keyof AppSettings['timeSlotSettings']] as any)[subField] = value;
      } else if (section === "timeSlotSettings" && field === "slotIntervalMinutes") {
         if (!newSettings.timeSlotSettings) newSettings.timeSlotSettings = { ...defaultAppSettings.timeSlotSettings };
         newSettings.timeSlotSettings.slotIntervalMinutes = parseInt(value, 10) || 0;
      } else if (['carouselAutoplayDelay', 'visitingChargeTaxPercent', 'minimumBookingAmount', 'visitingChargeAmount', 'limitLateBookingHours', 'freeCancellationDays', 'freeCancellationHours', 'freeCancellationMinutes', 'cancellationFeeValue', 'maxProviderRadiusKm'].includes(name)) { // Added maxProviderRadiusKm
        newSettings[name as keyof AppSettings] = parseFloat(value) || 0;
      }
      else {
        (newSettings as any)[name] = value;
      }

      // If tax on VC is disabled or rate is 0, ensure isVisitingChargeTaxInclusive is false
      if (name === "enableTaxOnVisitingCharge" && value === "false") {
        newSettings.isVisitingChargeTaxInclusive = false;
      }
      if (name === "visitingChargeTaxPercent" && (parseFloat(value) || 0) <= 0) {
        newSettings.isVisitingChargeTaxInclusive = false;
      }
      return newSettings;
    });
  };
  
  const handleSwitchChange = (name: keyof AppSettings, checked: boolean) => {
    setSettings(prev => {
      const newSettings = { ...prev, [name]: checked };
      // If tax on VC is disabled, ensure isVisitingChargeTaxInclusive is false
      if (name === "enableTaxOnVisitingCharge" && !checked) {
        newSettings.isVisitingChargeTaxInclusive = false;
      }
      // If main cancellation policy is disabled, ensure fee type/value are reset or handled appropriately (optional reset)
      if (name === "enableCancellationPolicy" && !checked) {
        // newSettings.cancellationFeeType = defaultAppSettings.cancellationFeeType; // Or keep last value
        // newSettings.cancellationFeeValue = defaultAppSettings.cancellationFeeValue;
      }
      return newSettings;
    });
  };
  
  const handleSelectChange = (name: keyof AppSettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [name]: name === 'isVisitingChargeTaxInclusive' ? (value === "true") : value,
    }));
  };


  const handleSaveSettings = async (sectionName: string) => {
    setIsSaving(true);
    
    let settingsToSave: AppSettings = {
      ...defaultAppSettings, 
      ...settings, 
      timeSlotSettings: { 
        ...defaultAppSettings.timeSlotSettings,
        ...(settings.timeSlotSettings || {}),
        morning: { ...defaultAppSettings.timeSlotSettings.morning, ...(settings.timeSlotSettings?.morning || {}) },
        afternoon: { ...defaultAppSettings.timeSlotSettings.afternoon, ...(settings.timeSlotSettings?.afternoon || {}) },
        evening: { ...defaultAppSettings.timeSlotSettings.evening, ...(settings.timeSlotSettings?.evening || {}) },
      },
      updatedAt: Timestamp.now(),
    };

    // Ensure isVisitingChargeTaxInclusive is false if conditions aren't met
    if (!settingsToSave.enableTaxOnVisitingCharge || (settingsToSave.visitingChargeTaxPercent || 0) <= 0) {
        settingsToSave.isVisitingChargeTaxInclusive = false;
    }
    // Ensure cancellation fee value is appropriate if policy is disabled or fee type makes value irrelevant
    if (!settingsToSave.enableCancellationPolicy) {
        // Optionally clear/reset fee type and value, or just let them be (they won't be used)
        // settingsToSave.cancellationFeeType = defaultAppSettings.cancellationFeeType;
        // settingsToSave.cancellationFeeValue = defaultAppSettings.cancellationFeeValue;
    }
    
    console.log('Saving ' + sectionName + ' settings to Firestore:', settingsToSave);

    try {
        const settingsDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);
        await setDoc(settingsDocRef, settingsToSave, { merge: true }); 
        
        toast({
            title: "Settings Saved",
            description: sectionName + ' settings have been saved to the database.',
        });
    } catch (e) {
        console.error("Failed to save settings to Firestore", e);
        toast({
            title: "Error Saving Settings",
            description: "Could not save settings to the database.",
            variant: "destructive",
        });
    }
    await new Promise(resolve => setTimeout(resolve, 700)); 
    setIsSaving(false);
  };

  if (isLoadingSettings) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading application settings...</p>
      </div>
    );
  }
  
  const canSetVcTaxInclusive = settings.enableTaxOnVisitingCharge && (settings.visitingChargeTaxPercent || 0) > 0;


  return (
    <TooltipProvider>
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings className="mr-2 h-6 w-6 text-primary" /> Application Settings
          </CardTitle>
          <CardDescription>
            Configure various application settings. Changes here affect the entire application.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 mb-6">
          <TabsTrigger value="general">
            <DollarSign className="mr-2 h-4 w-4" /> General
          </TabsTrigger>
          <TabsTrigger value="payment">
            <CreditCard className="mr-2 h-4 w-4" /> Payment
          </TabsTrigger>
           <TabsTrigger value="provider">
            <Users className="mr-2 h-4 w-4" /> Provider
          </TabsTrigger>
          <TabsTrigger value="slots">
            <Clock className="mr-2 h-4 w-4" /> Time Slots
          </TabsTrigger>
           <TabsTrigger value="cancellation">
            <Ban className="mr-2 h-4 w-4" /> Cancellation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Basic application-wide configurations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold">Minimum Booking Policy</h3>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableMinimumBookingPolicy" className="text-base">Enable Policy</Label>
                    <p className="text-sm text-muted-foreground">
                      Apply a visiting charge if booking total is below a set minimum.
                    </p>
                  </div>
                  <Switch
                    id="enableMinimumBookingPolicy"
                    name="enableMinimumBookingPolicy" 
                    checked={settings.enableMinimumBookingPolicy}
                    onCheckedChange={(checked) => handleSwitchChange('enableMinimumBookingPolicy', checked)}
                    disabled={isSaving}
                  />
                </div>

                {settings.enableMinimumBookingPolicy && (
                  <div className="space-y-4 pl-4 border-l-2 border-primary ml-2 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="minimumBookingAmount">Minimum Booking Amount (₹)</Label>
                      <Input
                        id="minimumBookingAmount"
                        name="minimumBookingAmount"
                        type="number"
                        value={settings.minimumBookingAmount}
                        onChange={handleInputChange}
                        placeholder="e.g., 500"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="visitingChargeAmount">Visiting Charge Amount (₹)</Label>
                      <Input
                        id="visitingChargeAmount"
                        name="visitingChargeAmount"
                        type="number"
                        value={settings.visitingChargeAmount}
                        onChange={handleInputChange}
                        placeholder="e.g., 100"
                        disabled={isSaving}
                      />
                      <p className="text-xs text-muted-foreground">This is the amount displayed to the user. Tax may be applied on top or included based on below setting.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minimumBookingPolicyDescription">
                        Policy Description
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 p-0 align-middle">
                              <AlertCircle className="h-4 w-4 text-muted-foreground"/>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">
                              Use placeholders: <code className="font-mono bg-muted p-0.5 rounded-sm">{"{MINIMUM_BOOKING_AMOUNT}"}</code> and <code className="font-mono bg-muted p-0.5 rounded-sm">{"{VISITING_CHARGE}"}</code>.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Textarea
                        id="minimumBookingPolicyDescription"
                        name="minimumBookingPolicyDescription"
                        value={settings.minimumBookingPolicyDescription}
                        onChange={handleInputChange}
                        placeholder="e.g., A visiting charge of ₹{VISITING_CHARGE} will be applied..."
                        rows={3}
                        disabled={isSaving}
                      />
                    </div>
                    {/* Visiting Charge Tax Settings */}
                    <div className="pt-4 mt-4 border-t">
                        <h4 className="text-md font-semibold mb-2 flex items-center"><Percent className="mr-1.5 h-4 w-4 text-muted-foreground"/>Tax on Visiting Charge</h4>
                        <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <Label htmlFor="enableTaxOnVisitingCharge" className="text-base font-normal">Enable Tax</Label>
                                <p className="text-xs text-muted-foreground">Apply tax to the visiting charge amount.</p>
                            </div>
                            <Switch
                                id="enableTaxOnVisitingCharge"
                                name="enableTaxOnVisitingCharge"
                                checked={settings.enableTaxOnVisitingCharge}
                                onCheckedChange={(checked) => handleSwitchChange('enableTaxOnVisitingCharge', checked)}
                                disabled={isSaving}
                            />
                        </div>
                        {settings.enableTaxOnVisitingCharge && (
                          <div className="space-y-2 mt-3 pl-2">
                            <Label htmlFor="visitingChargeTaxPercent">Visiting Charge Tax Rate (%)</Label>
                            <Input
                            id="visitingChargeTaxPercent"
                            name="visitingChargeTaxPercent"
                            type="number"
                            step="0.01"
                            value={settings.visitingChargeTaxPercent}
                            onChange={handleInputChange}
                            placeholder="e.g., 5 or 18"
                            disabled={isSaving}
                            />
                            <p className="text-xs text-muted-foreground">Enter the percentage (e.g., 5 for 5%). Set to 0 for no tax.</p>
                          </div>
                        )}
                        <div className="space-y-2 mt-3 pl-2">
                          <Label htmlFor="isVisitingChargeTaxInclusive" className={!canSetVcTaxInclusive ? "text-muted-foreground" : ""}>Visiting Charge Price Type</Label>
                          <Select
                            value={String(settings.isVisitingChargeTaxInclusive || false)}
                            onValueChange={(value) => handleSelectChange('isVisitingChargeTaxInclusive', value as "true" | "false")}
                            disabled={isSaving || !canSetVcTaxInclusive}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select tax type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="false">Tax Exclusive (Charge + Tax)</SelectItem>
                              <SelectItem value="true">Tax Inclusive (Charge includes Tax)</SelectItem>
                            </SelectContent>
                          </Select>
                          {!canSetVcTaxInclusive && <p className="text-xs text-muted-foreground">Enable tax on visiting charge and set a rate > 0 to configure this.</p>}
                        </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><PlaySquare className="mr-2 h-5 w-5 text-muted-foreground"/>Homepage Hero Carousel</h3>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableHeroCarousel" className="text-base">Enable Hero Carousel</Label>
                    <p className="text-sm text-muted-foreground">
                      Show or hide the main slideshow on the homepage.
                    </p>
                  </div>
                  <Switch
                    id="enableHeroCarousel"
                    name="enableHeroCarousel" 
                    checked={settings.enableHeroCarousel}
                    onCheckedChange={(checked) => handleSwitchChange('enableHeroCarousel', checked)}
                    disabled={isSaving}
                  />
                </div>
                {settings.enableHeroCarousel && (
                  <div className="space-y-4 pl-4 border-l-2 border-primary ml-2 pt-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="enableCarouselAutoplay" className="text-base">Enable Autoplay</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically transition between slides.
                        </p>
                      </div>
                      <Switch
                        id="enableCarouselAutoplay"
                        name="enableCarouselAutoplay"
                        checked={settings.enableCarouselAutoplay}
                        onCheckedChange={(checked) => handleSwitchChange('enableCarouselAutoplay', checked)}
                        disabled={isSaving}
                      />
                    </div>
                    {settings.enableCarouselAutoplay && (
                       <div className="space-y-2">
                        <Label htmlFor="carouselAutoplayDelay">Autoplay Delay (milliseconds)</Label>
                        <Input
                          id="carouselAutoplayDelay"
                          name="carouselAutoplayDelay"
                          type="number"
                          value={settings.carouselAutoplayDelay}
                          onChange={handleInputChange}
                          placeholder="e.g., 5000"
                          disabled={isSaving}
                          min="1000" 
                        />
                        <p className="text-xs text-muted-foreground">Time between slide transitions (e.g., 5000 for 5 seconds). Min: 1000ms.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><MapIcon className="mr-2 h-5 w-5 text-muted-foreground"/>Google Maps Configuration</h3>
                 <div className="space-y-2">
                    <Label htmlFor="googleMapsApiKey">Google Maps API Key</Label>
                    <Input
                      id="googleMapsApiKey"
                      name="googleMapsApiKey"
                      type="text"
                      value={settings.googleMapsApiKey}
                      onChange={handleInputChange}
                      placeholder="Enter your Google Maps API Key"
                      disabled={isSaving}
                    />
                    <p className="text-xs text-muted-foreground">Used for address selection and location-based features.</p>
                  </div>
              </div>

               <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><MailIcon className="mr-2 h-5 w-5 text-muted-foreground"/>Email Configuration (SMTP)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="smtpHost">SMTP Host</Label>
                        <Input id="smtpHost" name="smtpHost" value={settings.smtpHost} onChange={handleInputChange} placeholder="e.g., smtp.example.com" disabled={isSaving}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smtpPort">SMTP Port</Label>
                        <Input id="smtpPort" name="smtpPort" type="text" value={settings.smtpPort} onChange={handleInputChange} placeholder="e.g., 587 or 465" disabled={isSaving}/>
                    </div>
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="senderEmail">Sender Email Address</Label>
                      <Input id="senderEmail" name="senderEmail" type="email" value={settings.senderEmail} onChange={handleInputChange} placeholder="e.g., no-reply@yourdomain.com" disabled={isSaving}/>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="smtpUser">SMTP Username</Label>
                        <Input id="smtpUser" name="smtpUser" value={settings.smtpUser} onChange={handleInputChange} placeholder="Your SMTP username" disabled={isSaving}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smtpPass">SMTP Password</Label>
                        <Input id="smtpPass" name="smtpPass" type="password" value={settings.smtpPass} onChange={handleInputChange} placeholder="Your SMTP password" disabled={isSaving}/>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Used for sending booking confirmations and other system emails.</p>
              </div>

            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => handleSaveSettings("General")} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save General Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="payment">
          <Card>
            <CardHeader>
              <CardTitle>Payment Gateway Settings</CardTitle>
              <CardDescription>Configure payment methods and gateway credentials.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableOnlinePayment" className="text-base">Enable Online Payments (Razorpay)</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow customers to pay using online methods like UPI, Cards, Netbanking.
                  </p>
                </div>
                <Switch
                  id="enableOnlinePayment"
                  name="enableOnlinePayment" 
                  checked={settings.enableOnlinePayment}
                  onCheckedChange={(checked) => handleSwitchChange('enableOnlinePayment', checked)}
                  disabled={isSaving}
                />
              </div>

              {settings.enableOnlinePayment && (
                <div className="space-y-4 pl-4 border-l-2 border-primary ml-2 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="razorpayKeyId">Razorpay Key ID</Label>
                    <Input
                      id="razorpayKeyId"
                      name="razorpayKeyId"
                      value={settings.razorpayKeyId}
                      onChange={handleInputChange}
                      placeholder="rzp_live_xxxxxxxxxxxxxx"
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="razorpayKeySecret">Razorpay Key Secret</Label>
                    <Input
                      id="razorpayKeySecret"
                      name="razorpayKeySecret"
                      type="password"
                      value={settings.razorpayKeySecret}
                      onChange={handleInputChange}
                      placeholder="••••••••••••••••••••••"
                      disabled={isSaving}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableCOD" className="text-base">Enable "Pay After Service"</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow customers to opt for paying after the service is completed.
                  </p>
                </div>
                <Switch
                  id="enableCOD"
                  name="enableCOD" 
                  checked={settings.enableCOD}
                  onCheckedChange={(checked) => handleSwitchChange('enableCOD', checked)}
                  disabled={isSaving}
                />
              </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => handleSaveSettings("Payment")} disabled={isSaving}>
                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Payment Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="provider">
            <Card>
                <CardHeader>
                    <CardTitle>Provider Settings</CardTitle>
                    <CardDescription>Configurations related to service providers.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="maxProviderRadiusKm">Max Provider Service Radius (km)</Label>
                      <Input
                        id="maxProviderRadiusKm"
                        name="maxProviderRadiusKm"
                        type="number"
                        value={settings.maxProviderRadiusKm}
                        onChange={handleInputChange}
                        placeholder="e.g., 30"
                        disabled={isSaving}
                        min="1"
                      />
                      <p className="text-xs text-muted-foreground">Sets the maximum service radius a provider can select during registration.</p>
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <Button onClick={() => handleSaveSettings("Provider")} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Provider Settings
                    </Button>
                </CardFooter>
            </Card>
        </TabsContent>

        <TabsContent value="slots">
          <Card>
            <CardHeader>
              <CardTitle>Time Slot Configuration</CardTitle>
              <CardDescription>Manage service availability times, booking slots, and late booking limits. Use HH:MM format for times (e.g., 09:00, 17:30).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div>
                <h4 className="text-md font-semibold mb-2">Morning Slots</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="timeSlotSettings.morning.startTime">Start Time (HH:MM)</Label>
                    <Input 
                      id="timeSlotSettings.morning.startTime"
                      name="timeSlotSettings.morning.startTime" 
                      type="time" 
                      value={settings.timeSlotSettings.morning.startTime} 
                      onChange={handleInputChange} 
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="timeSlotSettings.morning.endTime">End Time (HH:MM)</Label>
                    <Input 
                      id="timeSlotSettings.morning.endTime"
                      name="timeSlotSettings.morning.endTime" 
                      type="time" 
                      value={settings.timeSlotSettings.morning.endTime} 
                      onChange={handleInputChange} 
                      disabled={isSaving}
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-md font-semibold mb-2">Afternoon Slots</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="timeSlotSettings.afternoon.startTime">Start Time (HH:MM)</Label>
                    <Input 
                      id="timeSlotSettings.afternoon.startTime"
                      name="timeSlotSettings.afternoon.startTime" 
                      type="time" 
                      value={settings.timeSlotSettings.afternoon.startTime} 
                      onChange={handleInputChange} 
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="timeSlotSettings.afternoon.endTime">End Time (HH:MM)</Label>
                    <Input 
                      id="timeSlotSettings.afternoon.endTime"
                      name="timeSlotSettings.afternoon.endTime" 
                      type="time" 
                      value={settings.timeSlotSettings.afternoon.endTime} 
                      onChange={handleInputChange} 
                      disabled={isSaving}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-md font-semibold mb-2">Evening Slots</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="timeSlotSettings.evening.startTime">Start Time (HH:MM)</Label>
                    <Input 
                      id="timeSlotSettings.evening.startTime"
                      name="timeSlotSettings.evening.startTime" 
                      type="time" 
                      value={settings.timeSlotSettings.evening.startTime} 
                      onChange={handleInputChange} 
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="timeSlotSettings.evening.endTime">End Time (HH:MM)</Label>
                    <Input 
                      id="timeSlotSettings.evening.endTime"
                      name="timeSlotSettings.evening.endTime" 
                      type="time" 
                      value={settings.timeSlotSettings.evening.endTime} 
                      onChange={handleInputChange} 
                      disabled={isSaving}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="timeSlotSettings.slotIntervalMinutes">Slot Interval (minutes)</Label>
                <Input
                  id="timeSlotSettings.slotIntervalMinutes"
                  name="timeSlotSettings.slotIntervalMinutes"
                  type="number"
                  value={settings.timeSlotSettings.slotIntervalMinutes}
                  onChange={handleInputChange}
                  placeholder="e.g., 60"
                  disabled={isSaving}
                  min="15" 
                />
                <p className="text-xs text-muted-foreground">Duration of each individual booking slot (e.g., 30, 60, 90).</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableLimitLateBookings" className="text-base">Limit Late Bookings</Label>
                  <p className="text-sm text-muted-foreground">
                    Prevent customers from booking too close to the current time.
                  </p>
                </div>
                <Switch
                  id="enableLimitLateBookings"
                  name="enableLimitLateBookings"
                  checked={settings.enableLimitLateBookings}
                  onCheckedChange={(checked) => handleSwitchChange('enableLimitLateBookings', checked)}
                  disabled={isSaving}
                />
              </div>

              {settings.enableLimitLateBookings && (
                <div className="space-y-1 pl-4 border-l-2 border-primary ml-2">
                  <Label htmlFor="limitLateBookingHours">Booking Delay (hours)</Label>
                  <Input
                    id="limitLateBookingHours"
                    name="limitLateBookingHours"
                    type="number"
                    value={settings.limitLateBookingHours}
                    onChange={handleInputChange}
                    placeholder="e.g., 4"
                    disabled={isSaving}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum hours before a slot becomes available from the current time.
                  </p>
                </div>
              )}

              <p className="text-sm font-medium text-primary pt-2">
                These settings define available periods. Actual slots generated based on these times and interval.
              </p>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => handleSaveSettings("Time Slot")} disabled={isSaving}>
                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Time Slot Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="cancellation">
          <Card>
            <CardHeader>
              <CardTitle>Cancellation Policy Settings</CardTitle>
              <CardDescription>Define rules for booking cancellations and associated fees.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableCancellationPolicy" className="text-base">Enable Cancellation Policy</Label>
                  <p className="text-sm text-muted-foreground">
                    If disabled, users can cancel freely. If enabled, below rules apply.
                  </p>
                </div>
                <Switch
                  id="enableCancellationPolicy"
                  name="enableCancellationPolicy" 
                  checked={settings.enableCancellationPolicy}
                  onCheckedChange={(checked) => handleSwitchChange('enableCancellationPolicy', checked)}
                  disabled={isSaving}
                />
              </div>

              {settings.enableCancellationPolicy && (
                <div className="space-y-4 pl-4 border-l-2 border-primary ml-2 pt-4">
                  <h4 className="text-md font-semibold">Free Cancellation Window (before service start)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="freeCancellationDays">Days</Label>
                      <Input id="freeCancellationDays" name="freeCancellationDays" type="number" min="0" value={settings.freeCancellationDays ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder="e.g., 1" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="freeCancellationHours">Hours</Label>
                      <Input id="freeCancellationHours" name="freeCancellationHours" type="number" min="0" max="23" value={settings.freeCancellationHours ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder="e.g., 2"/>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="freeCancellationMinutes">Minutes</Label>
                      <Input id="freeCancellationMinutes" name="freeCancellationMinutes" type="number" min="0" max="59" value={settings.freeCancellationMinutes ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder="e.g., 30"/>
                    </div>
                  </div>
                   <p className="text-xs text-muted-foreground">Timeframe before service start within which cancellation is free. Values are cumulative (e.g., 1 day & 2 hours).</p>


                  <h4 className="text-md font-semibold pt-3">Cancellation Fee (if outside free window)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="cancellationFeeType">Fee Type</Label>
                      <Select name="cancellationFeeType" value={settings.cancellationFeeType || 'fixed'} onValueChange={(value) => handleSelectChange('cancellationFeeType', value)} disabled={isSaving}>
                        <SelectTrigger id="cancellationFeeType"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cancellationFeeValue">Fee Value</Label>
                      <Input id="cancellationFeeValue" name="cancellationFeeValue" type="number" min="0" value={settings.cancellationFeeValue ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder={settings.cancellationFeeType === 'percentage' ? "e.g., 10 (for 10%)" : "e.g., 50 (for ₹50)"} />
                    </div>
                  </div>
                   <p className="text-xs text-muted-foreground">If percentage, it's based on the booking's total amount.</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => handleSaveSettings("Cancellation Policy")} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Cancellation Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
    </TooltipProvider>
  );
}
