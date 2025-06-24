
'use server';
/**
 * @fileOverview A Genkit flow to send an email notification to the admin
 * when a new provider application is submitted.
 *
 * - sendNewProviderApplicationAdminEmail - Sends an email to the admin.
 * - NewProviderApplicationAdminEmailInput - The input type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { ADMIN_EMAIL } from '@/contexts/AuthContext'; // Import ADMIN_EMAIL

const NewProviderApplicationAdminEmailInputSchema = z.object({
  applicationId: z.string().describe("The ID of the submitted provider application."),
  providerName: z.string().describe("The name of the provider who applied."),
  providerEmail: z.string().email().describe("The email of the provider."),
  providerCategory: z.string().optional().describe("The primary work category of the provider."),
  applicationUrl: z.string().url().describe("Direct URL to view the application in the admin panel."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
});

export type NewProviderApplicationAdminEmailInput = z.infer<typeof NewProviderApplicationAdminEmailInputSchema>;

export async function sendNewProviderApplicationAdminEmail(input: NewProviderApplicationAdminEmailInput): Promise<{ success: boolean; message: string }> {
  console.log("sendNewProviderApplicationAdminEmail: Flow invoked with input (passwords omitted):", {
    ...input,
    smtpPass: input.smtpPass ? '******' : undefined,
  });
  try {
    const result = await newProviderApplicationAdminEmailFlow(input);
    console.log("sendNewProviderApplicationAdminEmail: Flow result:", result);
    return result;
  } catch (error) {
    console.error("sendNewProviderApplicationAdminEmail: Error calling flow:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process admin notification email flow: ${errorMessage}` };
  }
}

const newProviderApplicationAdminEmailFlow = ai.defineFlow(
  {
    name: 'newProviderApplicationAdminEmailFlow',
    inputSchema: NewProviderApplicationAdminEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      console.log("====== NEW PROVIDER APP ADMIN EMAIL FLOW START ======");
      console.log("Flow input (password omitted):", { ...details, smtpPass: details.smtpPass ? '******' : undefined });

      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        applicationId, providerName, providerEmail, providerCategory, applicationUrl
      } = details;

      const adminEmail = ADMIN_EMAIL; // Use the imported admin email
      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      const emailSubject = `New Provider Application Submitted: ${providerName}`;
      const emailBody = `
        A new provider application has been submitted on FixBro.

        Application Details:
        --------------------
        Provider Name: ${providerName}
        Provider Email: ${providerEmail}
        ${providerCategory ? `Primary Category: ${providerCategory}` : ''}
        Application ID: ${applicationId}

        Please review the application at your earliest convenience:
        ${applicationUrl}

        The FixBro System
      `;

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating admin notification email.");
        console.log(`\n--- SIMULATING Admin Notification Email ---`);
        console.log(`To: ${adminEmail}`);
        console.log(`Subject: ${emailSubject}`);
        console.log(`Body:\n${emailBody}`);
        console.log("====== NEW PROVIDER APP ADMIN EMAIL FLOW END (SIMULATED) ======");
        return { success: false, message: "SMTP config incomplete. Email simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
        console.error("Invalid SMTP port:", smtpPort);
        return { success: false, message: "Invalid SMTP port." };
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      
      console.log(`Attempting to send admin notification email to: ${adminEmail}`);
      await transporter.sendMail({
        from: `FixBro System <${senderEmail}>`, to: adminEmail, subject: emailSubject, html: emailBody.replace(/\\n/g, '<br/>'),
      });
      console.log("Admin notification email sent.");
      console.log("====== NEW PROVIDER APP ADMIN EMAIL FLOW END (SUCCESS) ======");
      return { success: true, message: "Admin notification email sent successfully." };

    } catch (error: any) {
      console.error("Error in newProviderApplicationAdminEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}. Email logged as fallback.` };
    }
  }
);
