

"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Volume2, Trash2, UploadCloud, MessageSquare } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase'; // Import storage
import { doc, setDoc, Timestamp, getDoc } from "firebase/firestore"; // Import getDoc
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage"; // Storage functions
import type { GlobalWebSettings } from '@/types/firestore';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { Progress } from '@/components/ui/progress'; // For upload progress
import { defaultAppSettings } from '@/config/appDefaults'; // For default sound URL


const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com/v0/b/fixbroweb.firebasestorage.app/o/chat_sounds");


const chatSettingsFormSchema = z.object({
  isChatEnabled: z.boolean().default(false),
  isAiChatBotEnabled: z.boolean().default(false),
  chatNotificationSoundUrl: z.string().url({ message: "Must be a valid URL if provided." }).optional().or(z.literal('')),
});

type ChatSettingsFormData = z.infer<typeof chatSettingsFormSchema>;

export default function ChatSettingsForm() {
  const { toast } = useToast();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings, error: globalSettingsError } = useGlobalSettings();
  const [isSaving, setIsSaving] = useState(false);

  const [selectedSoundFile, setSelectedSoundFile] = useState<File | null>(null);
  const [soundUploadProgress, setSoundUploadProgress] = useState<number | null>(null);
  const [isUploadingSound, setIsUploadingSound] = useState(false);
  const [currentSoundUrlPreview, setCurrentSoundUrlPreview] = useState<string | null>(null);
  const soundFileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const form = useForm<ChatSettingsFormData>({
    resolver: zodResolver(chatSettingsFormSchema),
    defaultValues: {
      isChatEnabled: false,
      isAiChatBotEnabled: false,
      chatNotificationSoundUrl: defaultAppSettings.chatNotificationSoundUrl || "",
    },
  });

  useEffect(() => {
    if (globalSettings && !isLoadingGlobalSettings) {
      const currentSoundUrl = globalSettings.chatNotificationSoundUrl || defaultAppSettings.chatNotificationSoundUrl || "";
      form.reset({
        isChatEnabled: globalSettings.isChatEnabled || false,
        isAiChatBotEnabled: globalSettings.isAiChatBotEnabled || false,
        chatNotificationSoundUrl: currentSoundUrl,
      });
      setCurrentSoundUrlPreview(currentSoundUrl);
    } else if (!isLoadingGlobalSettings) { // If not loading and no global settings (e.g. first run)
       form.reset({
        isChatEnabled: defaultAppSettings.isChatEnabled || false,
        isAiChatBotEnabled: false,
        chatNotificationSoundUrl: defaultAppSettings.chatNotificationSoundUrl || "",
      });
      setCurrentSoundUrlPreview(defaultAppSettings.chatNotificationSoundUrl || "");
    }
  }, [globalSettings, isLoadingGlobalSettings, form]);

  const handleSoundFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 1 * 1024 * 1024) { // 1MB limit for sound
        toast({ title: "File Too Large", description: "Sound file must be less than 1MB.", variant: "destructive" });
        if (soundFileInputRef.current) soundFileInputRef.current.value = "";
        return;
      }
      if (!['audio/mpeg', 'audio/wav', 'audio/ogg'].includes(file.type)) {
        toast({ title: "Invalid File Type", description: "Please select an MP3, WAV, or OGG file.", variant: "destructive" });
        if (soundFileInputRef.current) soundFileInputRef.current.value = "";
        return;
      }
      setSelectedSoundFile(file);
      setCurrentSoundUrlPreview(URL.createObjectURL(file)); // Show local preview
      form.setValue('chatNotificationSoundUrl', ''); // Clear URL field if new file is chosen
    }
  };

  const handleRemoveCustomSound = async () => {
    const currentUrlInForm = form.getValues('chatNotificationSoundUrl');
    // Use globalSettings.chatNotificationSoundUrl for the actual stored URL to delete
    const storedUrl = globalSettings?.chatNotificationSoundUrl;

    if (storedUrl && isFirebaseStorageUrl(storedUrl)) {
      setIsSaving(true); // Use isSaving to disable buttons during delete
      try {
        const soundRef = storageRef(storage, storedUrl);
        await deleteObject(soundRef);
        toast({ title: "Custom Sound Removed", description: "The custom notification sound has been deleted." });
      } catch (error: any) {
        console.error("Error deleting custom sound from storage:", error);
        toast({ title: "Error", description: `Could not delete custom sound: ${error.message}`, variant: "destructive" });
      } finally {
        setIsSaving(false);
      }
    }
    setSelectedSoundFile(null);
    if (soundFileInputRef.current) soundFileInputRef.current.value = "";
    const defaultSound = defaultAppSettings.chatNotificationSoundUrl || "";
    form.setValue('chatNotificationSoundUrl', defaultSound);
    setCurrentSoundUrlPreview(defaultSound);
  };

  const onSubmit = async (data: ChatSettingsFormData) => {
    setIsSaving(true);
    let finalSoundUrl = data.chatNotificationSoundUrl || defaultAppSettings.chatNotificationSoundUrl || ""; 

    if (selectedSoundFile) {
      setIsUploadingSound(true);
      setSoundUploadProgress(0);
      const currentStoredUrl = globalSettings?.chatNotificationSoundUrl;

      if (currentStoredUrl && isFirebaseStorageUrl(currentStoredUrl)) {
        try {
          const oldSoundRef = storageRef(storage, currentStoredUrl);
          await deleteObject(oldSoundRef);
        } catch (error) {
          console.warn("Could not delete old custom sound from storage:", error);
        }
      }

      const extension = selectedSoundFile.name.split('.').pop()?.toLowerCase() || 'mp3';
      const randomName = generateRandomHexString(10);
      const soundFileName = `notif_sound_${randomName}.${extension}`;
      const soundPath = `chat_sounds/${soundFileName}`; // Specific folder for chat sounds
      const soundFileRef = storageRef(storage, soundPath);

      try {
        const uploadTask = uploadBytesResumable(soundFileRef, selectedSoundFile);
        finalSoundUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setSoundUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => reject(error),
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadURL);
              } catch (getUrlError) { reject(getUrlError); }
            }
          );
        });
        setSelectedSoundFile(null);
        if (soundFileInputRef.current) soundFileInputRef.current.value = "";
        setCurrentSoundUrlPreview(finalSoundUrl); // Update preview to the new Firebase URL
        form.setValue('chatNotificationSoundUrl', finalSoundUrl); // Update form with the new URL
      } catch (uploadError: any) {
        console.error("Error uploading sound file:", uploadError);
        toast({ title: "Sound Upload Failed", description: uploadError.message || "Could not upload sound.", variant: "destructive" });
        setIsUploadingSound(false); setSoundUploadProgress(null); setIsSaving(false);
        return;
      } finally {
        setIsUploadingSound(false); setSoundUploadProgress(null);
      }
    } else if (data.chatNotificationSoundUrl === "" && globalSettings?.chatNotificationSoundUrl && isFirebaseStorageUrl(globalSettings.chatNotificationSoundUrl)) {
      // This case is handled by handleRemoveCustomSound if user clicks remove.
      // If user manually clears URL and saves, AND it was a Firebase URL, it should be deleted.
      // This specific scenario is less common if remove button is used, but added for robustness.
      try {
        const soundRef = storageRef(storage, globalSettings.chatNotificationSoundUrl);
        await deleteObject(soundRef);
        toast({ title: "Custom Sound Removed", description: "Custom sound deleted. Will use default if available."});
      } catch (error: any) {
        console.warn("Error deleting custom sound when URL was cleared during save:", error);
      }
      finalSoundUrl = defaultAppSettings.chatNotificationSoundUrl || ""; 
    }


    try {
      const settingsDocRef = doc(db, "webSettings", "global");
      const settingsToUpdate: Partial<GlobalWebSettings> = {
        isChatEnabled: data.isChatEnabled,
        isAiChatBotEnabled: data.isAiChatBotEnabled,
        chatNotificationSoundUrl: finalSoundUrl,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, settingsToUpdate, { merge: true });
      toast({ title: "Success", description: "Chat settings saved successfully." });
    } catch (error) {
      console.error("Error saving chat settings:", error);
      toast({ title: "Error", description: "Could not save chat settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const playCurrentSound = () => {
    if (audioPlayerRef.current) {
        const soundToPlay = currentSoundUrlPreview || defaultAppSettings.chatNotificationSoundUrl || "";
        if (soundToPlay) {
            if (audioPlayerRef.current.src === soundToPlay && soundToPlay.startsWith('blob:')) {
                audioPlayerRef.current.currentTime = 0; 
            } else {
                audioPlayerRef.current.src = soundToPlay;
                audioPlayerRef.current.load();
            }
            audioPlayerRef.current.play().catch(e => console.error("Error playing sound:", e));
        } else {
            toast({title: "No Sound", description: "No notification sound is configured.", variant: "default"});
        }
    }
  };


  if (isLoadingGlobalSettings) {
    return (
      <Card>
        <CardHeader><CardTitle>Chat Feature Configuration</CardTitle></CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Loading chat settings...</p>
        </CardContent>
      </Card>
    );
  }
  if (globalSettingsError) {
    return <Card><CardContent className="p-4 text-destructive">Error loading global settings: {globalSettingsError}</CardContent></Card>;
  }

  const effectiveSoundUrlForPlayer = currentSoundUrlPreview || defaultAppSettings.chatNotificationSoundUrl || "";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Chat Feature Configuration</CardTitle>
            <CardDescription>Enable or disable the frontend chat widget and set notification sound.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="isChatEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center gap-2"><MessageSquare />Enable Chat Feature</FormLabel>
                    <FormDescription>
                      Show a chat button on the frontend for users to interact with admin.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSaving || isUploadingSound}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="isAiChatBotEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable AI Chat Bot</FormLabel>
                    <FormDescription>
                      Allow the AI assistant to provide initial responses to user queries.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSaving || isUploadingSound}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="chatNotificationSoundUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <Volume2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Notification Sound URL
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={`Defaults to: ${defaultAppSettings.chatNotificationSoundUrl || "None"}`}
                      {...field} 
                      onChange={(e) => {
                        field.onChange(e);
                        setCurrentSoundUrlPreview(e.target.value || (selectedSoundFile ? URL.createObjectURL(selectedSoundFile) : defaultAppSettings.chatNotificationSoundUrl || ""));
                        setSelectedSoundFile(null); 
                        if (soundFileInputRef.current) soundFileInputRef.current.value = "";
                      }}
                      value={field.value || ""} 
                      disabled={isSaving || isUploadingSound || !!selectedSoundFile}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter direct URL or upload below. Clearing this field and saving will use the default sound (if available).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
                <FormLabel className="flex items-center"><UploadCloud className="mr-2 h-4 w-4 text-muted-foreground"/>Upload Custom Sound (MP3, WAV, OGG - Max 1MB)</FormLabel>
                 <Input 
                    type="file" 
                    accept=".mp3,.wav,.ogg" 
                    onChange={handleSoundFileChange}
                    ref={soundFileInputRef}
                    className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90"
                    disabled={isSaving || isUploadingSound}
                />
                {soundUploadProgress !== null && (
                    <Progress value={soundUploadProgress} className="w-full h-2 mt-2" />
                )}
                {isUploadingSound && <p className="text-xs text-muted-foreground mt-1">Uploading...</p>}
            </FormItem>

            {(currentSoundUrlPreview || (form.getValues('chatNotificationSoundUrl') === "" && defaultAppSettings.chatNotificationSoundUrl)) && (
                <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/50">
                    <audio ref={audioPlayerRef} src={effectiveSoundUrlForPlayer} preload="auto" className="hidden"></audio>
                    <Button type="button" variant="outline" size="sm" onClick={playCurrentSound} disabled={isSaving || isUploadingSound || !effectiveSoundUrlForPlayer}>
                        <Volume2 className="mr-2 h-4 w-4"/> Preview
                    </Button>
                    <p className="text-xs text-muted-foreground truncate flex-1">
                       Current: {currentSoundUrlPreview ? (isFirebaseStorageUrl(currentSoundUrlPreview) ? "Custom Uploaded Sound" : (currentSoundUrlPreview.startsWith('blob:') ? "New Upload Preview" : currentSoundUrlPreview)) : (defaultAppSettings.chatNotificationSoundUrl ? "Default Sound" : "No Sound Configured")}
                    </p>
                    {/* Show remove button only if current URL is a Firebase custom one or if a new file is selected */}
                    {(isFirebaseStorageUrl(form.getValues('chatNotificationSoundUrl')) || selectedSoundFile ) && form.getValues('chatNotificationSoundUrl') !== defaultAppSettings.chatNotificationSoundUrl && (
                      <Button type="button" variant="ghost" size="icon" onClick={handleRemoveCustomSound} disabled={isSaving || isUploadingSound} title="Remove custom sound & use default">
                        <Trash2 className="h-4 w-4 text-destructive"/>
                      </Button>
                    )}
                </div>
            )}


          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSaving || isUploadingSound}>
              {(isSaving || isUploadingSound) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Chat Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
