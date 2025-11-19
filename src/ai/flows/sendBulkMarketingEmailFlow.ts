
'use server';
/**
 * @fileOverview A Genkit flow to send a marketing email to multiple users,
 * replacing merge tags with user-specific data.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/lib/firebase-admin';
import type { FirestoreUser, AppSettings, GlobalWebSettings } from '@/types/firestore';
import { sendMarketingEmail } from './sendMarketingEmailFlow';

// Helper to safely get nested properties
const get = (obj: any, path: string, defaultValue: any = ''): any => {
    const keys = path.split('.');
    let result = obj;
    for (const key of keys) {
        if (result && typeof result === 'object' && key in result) {
            result = result[key];
        } else {
            return defaultValue;
        }
    }
    return result;
};

// Input schema for the bulk marketing email flow
const BulkMarketingEmailInputSchema = z.object({
  targetUserIds: z.union([z.literal('all'), z.array(z.string())]).describe("Either 'all' to send to all users, or an array of specific user IDs."),
  subject: z.string().describe("The subject line of the email."),
  body: z.string().describe("The HTML content of the email body, with merge tags like {{name}}."),
});

export type BulkMarketingEmailInput = z.infer<typeof BulkMarketingEmailInputSchema>;

// Exported function that calls the flow
export async function sendBulkMarketingEmail(input: BulkMarketingEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await bulkMarketingEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("sendBulkMarketingEmail: Error calling flow:", error);
    return { success: false, message: `Failed to process bulk email flow: ${errorMessage}` };
  }
}

// The main flow definition
const bulkMarketingEmailFlow = ai.defineFlow(
  {
    name: 'bulkMarketingEmailFlow',
    inputSchema: BulkMarketingEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (input) => {
    try {
      console.log("====== BULK MARKETING EMAIL FLOW START ======");
      initFirebaseAdmin();
      const db = getFirestore();

      // 1. Fetch settings (SMTP, company details)
      const appConfigSnap = await db.collection('webSettings').doc('applicationConfig').get();
      const globalSettingsSnap = await db.collection('webSettings').doc('global').get();
      
      if (!appConfigSnap.exists || !globalSettingsSnap.exists) {
        throw new Error("SMTP or Global settings not configured in Firestore.");
      }
      const appConfig = appConfigSnap.data() as AppSettings;
      const globalSettings = globalSettingsSnap.data() as GlobalWebSettings;
      
      if (!appConfig.smtpHost || !appConfig.senderEmail) {
        throw new Error("SMTP settings are incomplete. Cannot send emails.");
      }

      // 2. Fetch target users
      let users: FirestoreUser[] = [];
      if (input.targetUserIds === 'all') {
        const usersSnapshot = await db.collection('users').get();
        users = usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreUser));
      } else if (Array.isArray(input.targetUserIds) && input.targetUserIds.length > 0) {
        // Firestore 'in' query has a limit of 30 items. We need to chunk if necessary.
        const userIds = input.targetUserIds;
        for (let i = 0; i < userIds.length; i += 30) {
            const chunk = userIds.slice(i, i + 30);
            const usersSnapshot = await db.collection('users').where('__name__', 'in', chunk).get();
            users.push(...usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreUser)));
        }
      }

      if (users.length === 0) {
        return { success: true, message: "No target users found to send emails to." };
      }

      // 3. Iterate, replace tags, and send emails
      let successfulSends = 0;
      let failedSends = 0;

      const appDetails = {
        websiteName: globalSettings.websiteName || 'Wecanfix',
        websiteUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://wecanfix.in',
        supportEmail: globalSettings.contactEmail || 'support@wecanfix.in',
        companyAddress: globalSettings.address || '',
        logoUrl: globalSettings.logoUrl || '',
      };
      
      for (const user of users) {
        if (!user.email) {
            console.warn(`Skipping user ${user.id} (${user.displayName}) due to missing email.`);
            continue;
        }

        let emailBody = input.body;
        let emailSubject = input.subject;

        const mergeData = {
          name: user.displayName || 'Valued Customer',
          email: user.email,
          mobile: user.mobileNumber || '',
          signupDate: user.createdAt?.toDate().toLocaleDateString('en-IN') || '',
          websiteName: appDetails.websiteName,
          websiteUrl: appDetails.websiteUrl,
          supportEmail: appDetails.supportEmail,
          companyAddress: appDetails.companyAddress,
        };

        // Replace tags
        for (const [key, value] of Object.entries(mergeData)) {
            const tag = new RegExp(`{{${key}}}`, 'g');
            emailBody = emailBody.replace(tag, value);
            emailSubject = emailSubject.replace(tag, value);
        }

        // Send email via the single marketing email flow
        const result = await sendMarketingEmail({
          toEmail: user.email,
          subject: emailSubject,
          htmlBody: emailBody, // Body is already HTML, no need for newline conversion
          smtpHost: appConfig.smtpHost,
          smtpPort: appConfig.smtpPort,
          smtpUser: appConfig.smtpUser,
          smtpPass: appConfig.smtpPass,
          senderEmail: appConfig.senderEmail,
          siteName: appDetails.websiteName,
          logoUrl: appDetails.logoUrl,
        });

        if (result.success) {
          successfulSends++;
        } else {
          failedSends++;
          console.error(`Failed to send email to ${user.email}: ${result.message}`);
        }
      }

      const finalMessage = `Email campaign finished. Successfully sent: ${successfulSends}. Failed: ${failedSends}.`;
      console.log("====== BULK MARKETING EMAIL FLOW END ======");
      return { success: true, message: finalMessage };

    } catch (error) {
      console.error("CRITICAL ERROR in bulkMarketingEmailFlow:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Flow failed: ${errorMessage}` };
    }
  }
);

    