
'use server';
/**
 * @fileOverview A Genkit flow to send a single marketing or transactional email.
 * This flow is designed to be called by other server-side logic (e.g., a future automation trigger).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';

const MarketingEmailInputSchema = z.object({
  toEmail: z.string().email().describe("The recipient's email address."),
  subject: z.string().describe("The subject line of the email."),
  htmlBody: z.string().describe("The full HTML content of the email body."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
});

export type MarketingEmailInput = z.infer<typeof MarketingEmailInputSchema>;

export async function sendMarketingEmail(input: MarketingEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    const result = await marketingEmailFlow(input);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process marketing email flow: ${errorMessage}` };
  }
}

const marketingEmailFlow = ai.defineFlow(
  {
    name: 'marketingEmailFlow',
    inputSchema: MarketingEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      console.log("====== MARKETING EMAIL FLOW START ======");
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        toEmail, subject, htmlBody
      } = details;

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating marketing email.");
        console.log(`\n--- SIMULATING Marketing Email ---`);
        console.log(`To: ${toEmail}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body (HTML):\n${htmlBody}`);
        return { success: false, message: "SMTP config incomplete. Email simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
        return { success: false, message: "Invalid SMTP port." };
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      
      console.log(`Attempting to send marketing email to: ${toEmail}`);
      await transporter.sendMail({
        from: `wecanfix <${senderEmail}>`, to: toEmail, subject: subject, html: htmlBody,
      });
      console.log("Marketing email sent.");
      
      return { success: true, message: `Email sent successfully to ${toEmail}.` };

    } catch (error: any) {
      console.error("Error in marketingEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}.` };
    }
  }
);
