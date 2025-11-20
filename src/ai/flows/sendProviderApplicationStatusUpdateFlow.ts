
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
import { getBaseUrl } from '@/lib/config';

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
  siteName: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

export type ProviderApplicationStatusEmailInput = z.infer<typeof ProviderApplicationStatusEmailInputSchema>;

export async function sendProviderApplicationStatusEmail(input: ProviderApplicationStatusEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await providerApplicationStatusEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process provider status email flow: ${errorMessage}` };
  }
}

const createHtmlTemplate = (title: string, bodyContent: string, siteName: string, logoUrl?: string) => {
    const finalLogoUrl = logoUrl || `${getBaseUrl()}/default-image.png`;
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
    <style>
        body { margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Roboto', sans-serif; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; }
        .header { text-align: center; padding-bottom: 20px; }
        .header img { max-width: 150px; }
        .content { padding: 20px 0; color: #333333; line-height: 1.6; }
        .content h2 { font-family: 'Poppins', sans-serif; color: #333333; }
        .footer { text-align: center; font-size: 12px; color: #999999; padding-top: 20px; border-top: 1px solid #eeeeee; }
        .notes { background-color: #f9f9f9; border-left: 3px solid #eee; padding: 15px; margin: 15px 0; }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #0B5ED7;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F9FA;">
        <tr>
            <td align="center">
                <table class="container" width="100%" border="0" cellspacing="0" cellpadding="20" style="background-color: #ffffff; margin-top: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <tr>
                        <td>
                            <div class="header">
                                <a href="${getBaseUrl()}" target="_blank" style="text-decoration:none;">

                                    <img src="${finalLogoUrl}" alt="${siteName} Logo" style="border:0; display:inline-block; max-width:150px;">

                                </a>
                            </div>
                            <div class="content">
                                <h2>${title}</h2>
                                ${bodyContent}
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};


const providerApplicationStatusEmailFlow = ai.defineFlow(
  {
    name: 'providerApplicationStatusEmailFlow',
    inputSchema: ProviderApplicationStatusEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        providerName, providerEmail, applicationStatus, adminReviewNotes, applicationUrl,
        siteName = "Wecanfix", logoUrl,
      } = details;
      
      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      let emailSubject = "";
      let emailBodyContent = "";

      switch (applicationStatus) {
        case 'approved':
          emailSubject = `Your ${siteName} Provider Application has been Approved!`;
          emailBodyContent = `
            <p>Dear ${providerName},</p>
            <p>Congratulations! We are pleased to inform you that your provider application with ${siteName} has been approved.</p>
            <p>You can now access your provider dashboard and start managing your services and jobs.</p>
            <p><a href="${applicationUrl.replace('provider-registration', 'provider')}" class="button">Access Dashboard</a></p>
            <p>Welcome aboard!</p>
            <p>The ${siteName} Team</p>
          `;
          break;
        case 'rejected':
          emailSubject = `Update Regarding Your ${siteName} Provider Application`;
          emailBodyContent = `
            <p>Dear ${providerName},</p>
            <p>Thank you for your interest in becoming a provider with ${siteName}.</p>
            <p>After careful review, we regret to inform you that your application was not approved at this time.</p>
            ${adminReviewNotes ? `<div class="notes"><p><strong>Reason/Feedback:</strong><br>${adminReviewNotes}</p></div>` : ''}
            <p>If you have questions, please contact our support team.</p>
            <p>Sincerely,</p>
            <p>The ${siteName} Team</p>
          `;
          break;
        case 'needs_update':
          emailSubject = `Action Required: Update Your ${siteName} Provider Application`;
          emailBodyContent = `
            <p>Dear ${providerName},</p>
            <p>We have reviewed your provider application for ${siteName} and require some additional information or corrections.</p>
            ${adminReviewNotes ? `<div class="notes"><p><strong>Please address the following:</strong><br>${adminReviewNotes}</p></div>` : ''}
            <p>Please log in to your application to make the necessary updates:</p>
            <p><a href="${applicationUrl}" class="button">Update Application</a></p>
            <p>Once updated, your application will be re-reviewed.</p>
            <p>Thank you,</p>
            <p>The ${siteName} Team</p>
          `;
          break;
        default:
          return { success: true, message: "No email template for this status." };
      }

      const htmlBody = createHtmlTemplate(`Application Status: ${applicationStatus.replace(/_/g, ' ')}`, emailBodyContent, siteName, logoUrl);

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating provider status email.");
        return { success: false, message: "SMTP config incomplete. Email simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
        return { success: false, message: "Invalid SMTP port." };
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      
      await transporter.sendMail({
        from: `${siteName} Team <${senderEmail}>`, to: providerEmail, subject: emailSubject, html: htmlBody,
      });

      return { success: true, message: "Provider status email sent successfully." };

    } catch (error: any) {
      console.error("Error in providerApplicationStatusEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown error'}.` };
    }
  }
);

    
