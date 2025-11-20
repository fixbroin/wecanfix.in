
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
  <html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
      .container { max-width: 100%; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eeeeee; }
      .header img { max-width: 150px; }
      .content { padding: 20px 0; color: #555; line-height: 1.6; }
      .footer { text-align: center; font-size: 12px; color: #999; padding-top: 20px; border-top: 1px solid #eeeeee; }
      .button { display: inline-block; background-color: #45A0A2; color: #ffffff !important; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
    </style>
  </head>
  <body>
    <div class="container">
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
    </div>
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
        siteName = "Wecanfix", logoUrl
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
        <a href="${applicationUrl}" class="button">View Application</a>
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
