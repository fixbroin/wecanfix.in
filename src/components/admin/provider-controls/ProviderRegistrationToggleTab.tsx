
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Power } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from "firebase/firestore";
import type { AppSettings } from '@/types/firestore';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";

export default function ProviderRegistrationToggleTab() {
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const [isSaving, setIsSaving] = useState(false);
  const [isRegistrationEnabled, setIsRegistrationEnabled] = useState(true);

  useEffect(() => {
    if (!isLoadingAppConfig && appConfig) {
      setIsRegistrationEnabled(appConfig.isProviderRegistrationEnabled === undefined ? true : appConfig.isProviderRegistrationEnabled);
    }
  }, [appConfig, isLoadingAppConfig]);

  const handleToggleChange = (checked: boolean) => {
    setIsRegistrationEnabled(checked);
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);
      const dataToSave: Partial<AppSettings> = {
        isProviderRegistrationEnabled: isRegistrationEnabled,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      toast({ title: "Success", description: "Provider registration access updated." });
    } catch (error) {
      console.error("Error saving registration access setting:", error);
      toast({ title: "Error", description: "Could not update setting.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingAppConfig) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Power className="mr-2 h-5 w-5"/>Provider Registration Access</CardTitle>
          <CardDescription>Control whether new providers can register.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center"><Power className="mr-2 h-5 w-5"/>Provider Registration Access</CardTitle>
        <CardDescription>Enable or disable the provider registration form for new applicants.</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
          <div className="space-y-0.5">
            <label htmlFor="registration-toggle" className="text-base font-medium">
              Provider Registration
            </label>
            <p className="text-sm text-muted-foreground">
              {isRegistrationEnabled ? "Enabled: New providers can register." : "Disabled: Registration page will show 'currently closed'."}
            </p>
          </div>
          <Switch
            id="registration-toggle"
            checked={isRegistrationEnabled}
            onCheckedChange={handleToggleChange}
            disabled={isSaving}
            aria-label="Toggle provider registration"
          />
        </div>
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleSaveChanges} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Access Setting
        </Button>
      </CardFooter>
    </Card>
  );
}

