
'use server';
/**
 * @fileOverview A Genkit flow to send an email notification to the admin
 * when a new custom service request is submitted.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';

const NewCustomServiceRequestEmailInputSchema = z.object({
  requestId: z.string().describe("The ID of the submitted request."),
  serviceTitle: z.string().describe("The title of the requested service."),
  userName: z.string().describe("The name of the user who submitted the request."),
  userEmail: z.string().email().describe("The email of the user."),
  description: z.string().describe("The user's description of the service needed."),
  category: z.string().describe("The category (pre-defined or custom) selected by the user."),
  adminUrl: z.string().url().describe("Direct URL to view the request in the admin panel."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
});

export type NewCustomServiceRequestEmailInput = z.infer<typeof NewCustomServiceRequestEmailInputSchema>;

export async function sendNewCustomServiceRequestEmail(input: NewCustomServiceRequestEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await newCustomServiceRequestEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process custom request notification email flow: ${errorMessage}` };
  }
}

const newCustomServiceRequestEmailFlow = ai.defineFlow(
  {
    name: 'newCustomServiceRequestEmailFlow',
    inputSchema: NewCustomServiceRequestEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      console.log("====== NEW CUSTOM REQUEST ADMIN EMAIL FLOW START ======");
      const { smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, ...requestDetails } = details;

      const adminEmail = "fixbro.in@gmail.com"; 
      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      const emailSubject = `New Custom Service Request: ${requestDetails.serviceTitle}`;
      const emailBody = `
        A new custom service request has been submitted on FixBro.

        Request Details:
        --------------------
        Request ID: ${requestDetails.requestId}
        Customer Name: ${requestDetails.userName}
        Customer Email: ${requestDetails.userEmail}
        
        Service Title: ${requestDetails.serviceTitle}
        Category: ${requestDetails.category}
        Description: 
        ${requestDetails.description}

        Please review the full request in the admin panel:
        ${requestDetails.adminUrl}

        The FixBro System
      `;

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating admin notification email for custom request.");
        console.log(`\n--- SIMULATING Admin Notification Email ---`);
        console.log(`To: ${adminEmail}`);
        console.log(`Subject: ${emailSubject}`);
        console.log(`Body:\n${emailBody}`);
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
      
      console.log(`Attempting to send custom request notification email to: ${adminEmail}`);
      await transporter.sendMail({
        from: `FixBro System <${senderEmail}>`, to: adminEmail, subject: emailSubject, html: emailBody.replace(/\\n/g, '<br/>'),
      });
      console.log("Admin notification email for custom request sent.");
      return { success: true, message: "Admin notification email sent successfully." };

    } catch (error: any) {
      console.error("Error in newCustomServiceRequestEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}. Email logged as fallback.` };
    }
  }
);
