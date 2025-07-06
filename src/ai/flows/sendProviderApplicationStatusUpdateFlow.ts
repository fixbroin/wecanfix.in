
'use server';
/**
 * @fileOverview A Genkit flow to send an email notification to a provider
 * when their application status is updated by an admin.
 *
 * - sendProviderApplicationStatusEmail - Sends an email to the provider.
 * - ProviderApplicationStatusEmailInput - The input type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import type { ProviderApplicationStatus } from '@/types/firestore'; // Import status type

const ProviderApplicationStatusEmailInputSchema = z.object({
  providerName: z.string().describe("The name of the provider."),
  providerEmail: z.string().email().describe("The email of the provider."),
  applicationStatus: z.custom<ProviderApplicationStatus>().describe("The new status of the application (e.g., 'approved', 'rejected', 'needs_update')."),
  adminReviewNotes: z.string().optional().describe("Admin notes, especially if rejected or needs update."),
  applicationUrl: z.string().url().describe("Direct URL for the provider to view/update their application if needed."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
});

export type ProviderApplicationStatusEmailInput = z.infer<typeof ProviderApplicationStatusEmailInputSchema>;

export async function sendProviderApplicationStatusEmail(input: ProviderApplicationStatusEmailInput): Promise<{ success: boolean; message: string }> {
  console.log("sendProviderApplicationStatusEmail: Flow invoked with input (passwords omitted):", {
    ...input,
    smtpPass: input.smtpPass ? '******' : undefined,
  });
  try {
    const result = await providerApplicationStatusEmailFlow(input);
    console.log("sendProviderApplicationStatusEmail: Flow result:", result);
    return result;
  } catch (error) {
    console.error("sendProviderApplicationStatusEmail: Error calling flow:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process provider status email flow: ${errorMessage}` };
  }
}

const providerApplicationStatusEmailFlow = ai.defineFlow(
  {
    name: 'providerApplicationStatusEmailFlow',
    inputSchema: ProviderApplicationStatusEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      console.log("====== PROVIDER APP STATUS EMAIL FLOW START ======");
      console.log("Flow input (password omitted):", { ...details, smtpPass: details.smtpPass ? '******' : undefined });

      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        providerName, providerEmail, applicationStatus, adminReviewNotes, applicationUrl
      } = details;

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      let emailSubject = "";
      let emailBody = "";

      switch (applicationStatus) {
        case 'approved':
          emailSubject = "Your FixBro Provider Application has been Approved!";
          emailBody = `
            Dear ${providerName},

            Congratulations! We are pleased to inform you that your provider application with FixBro has been approved.
            You can now access your provider dashboard and start managing your services and jobs.

            Access your dashboard here: ${applicationUrl.replace('provider-registration', 'provider')}

            Welcome aboard!
            The FixBro Team
          `;
          break;
        case 'rejected':
          emailSubject = "Update Regarding Your FixBro Provider Application";
          emailBody = `
            Dear ${providerName},

            Thank you for your interest in becoming a provider with FixBro.
            After careful review, we regret to inform you that your application was not approved at this time.
            ${adminReviewNotes ? `\nReason/Feedback: ${adminReviewNotes}\n` : ''}
            If you have questions or wish to discuss this further, please contact our support team.

            Sincerely,
            The FixBro Team
          `;
          break;
        case 'needs_update':
          emailSubject = "Action Required: Update Your FixBro Provider Application";
          emailBody = `
            Dear ${providerName},

            We have reviewed your provider application for FixBro and require some additional information or corrections.
            ${adminReviewNotes ? `\nSpecific areas needing attention: ${adminReviewNotes}\n` : ''}
            Please log in to your application to make the necessary updates:
            ${applicationUrl}

            Once updated, your application will be re-reviewed.

            Thank you,
            The FixBro Team
          `;
          break;
        default:
          // For other pending steps, we might not send an email unless specifically required.
          // Or, this could be a generic "Your application is progressing" email.
          // For now, let's assume emails are primarily for these terminal/actionable states.
          console.log(`Provider application status is ${applicationStatus}. No specific email template for this status. Skipping email.`);
          return { success: true, message: "No email sent for this status." };
      }


      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating provider status email.");
        console.log(`\n--- SIMULATING Provider Status Email ---`);
        console.log(`To: ${providerEmail}`);
        console.log(`Subject: ${emailSubject}`);
        console.log(`Body:\n${emailBody}`);
        console.log("====== PROVIDER APP STATUS EMAIL FLOW END (SIMULATED) ======");
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
      
      console.log(`Attempting to send provider status email to: ${providerEmail}`);
      await transporter.sendMail({
        from: `FixBro Team <${senderEmail}>`, to: providerEmail, subject: emailSubject, html: emailBody.replace(/\\n/g, '<br/>'),
      });
      console.log("Provider status email sent.");
      console.log("====== PROVIDER APP STATUS EMAIL FLOW END (SUCCESS) ======");
      return { success: true, message: "Provider status email sent successfully." };

    } catch (error: any) {
      console.error("Error in providerApplicationStatusEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}. Email logged as fallback.` };
    }
  }
);

