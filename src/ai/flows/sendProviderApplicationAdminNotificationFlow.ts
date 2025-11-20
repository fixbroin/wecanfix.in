
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
import { getBaseUrl } from '@/lib/config';

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
  siteName: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

export type NewProviderApplicationAdminEmailInput = z.infer<typeof NewProviderApplicationAdminEmailInputSchema>;

export async function sendNewProviderApplicationAdminEmail(input: NewProviderApplicationAdminEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await newProviderApplicationAdminEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process admin notification email flow: ${errorMessage}` };
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
        .container { max-width: 100%; margin: 0 auto; background-color: #ffffff; padding: 20px; }
        .header { text-align: center; padding-bottom: 20px; }
        .header img { max-width: 150px; }
        .content { padding: 20px 0; color: #333333; line-height: 1.6; }
        .content h2 { font-family: 'Poppins', sans-serif; color: #333333; }
        .footer { text-align: center; font-size: 12px; color: #999999; padding-top: 20px; border-top: 1px solid #eeeeee; }
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
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="20" style="background-color: #ffffff; margin-top: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
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


const newProviderApplicationAdminEmailFlow = ai.defineFlow(
  {
    name: 'newProviderApplicationAdminEmailFlow',
    inputSchema: NewProviderApplicationAdminEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        applicationId, providerName, providerEmail, providerCategory, applicationUrl,
        siteName = "Wecanfix", logoUrl,
      } = details;

      const adminEmail = "wecanfix.in@gmail.com";
      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      const emailSubject = `New Provider Application: ${providerName}`;
      const emailBodyContent = `
        <p>A new provider application has been submitted on ${siteName}.</p>
        <h3>Application Details:</h3>
        <ul>
            <li><strong>Provider Name:</strong> ${providerName}</li>
            <li><strong>Provider Email:</strong> ${providerEmail}</li>
            ${providerCategory ? `<li><strong>Primary Category:</strong> ${providerCategory}</li>` : ''}
            <li><strong>Application ID:</strong> ${applicationId}</li>
        </ul>
        <p>Please review the application at your earliest convenience:</p>
        <p><a href="${applicationUrl}" class="button">View Application</a></p>
        <p>The ${siteName} System</p>
      `;

      const htmlBody = createHtmlTemplate("New Provider Application", emailBodyContent, siteName, logoUrl);

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating admin notification email.");
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
        from: `${siteName} System <${senderEmail}>`,
        to: adminEmail,
        subject: emailSubject,
        html: htmlBody,
      });
      
      return { success: true, message: "Admin notification email sent successfully." };

    } catch (error: any) {
      console.error("Error in newProviderApplicationAdminEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}.` };
    }
  }
);

    