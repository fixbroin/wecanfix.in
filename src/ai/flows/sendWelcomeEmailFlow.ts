
'use server';
/**
 * @fileOverview A Genkit flow to send a welcome email to a new user.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config'; // Import the base URL helper

// Input schema for the welcome email flow
const WelcomeEmailInputSchema = z.object({
  userName: z.string().describe("The name of the new user."),
  userEmail: z.string().email().describe("The email address of the new user."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
});

export type WelcomeEmailInput = z.infer<typeof WelcomeEmailInputSchema>;

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    const result = await welcomeEmailFlow(input);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process welcome email flow: ${errorMessage}` };
  }
}

const welcomeEmailFlow = ai.defineFlow(
  {
    name: 'welcomeEmailFlow',
    inputSchema: WelcomeEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    const { smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, userName, userEmail } = details;

    const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

    const categoriesUrl = `${getBaseUrl()}/categories`;
    const emailSubject = `Welcome to FixBro, ${userName}!`;
    const emailBody = `
        <p>Hi ${userName},</p>

        <p>Welcome to FixBro! We are thrilled to have you join our community.</p>

        <p>You can now browse our wide range of home services, book appointments with trusted professionals, and manage everything from your personal dashboard.</p>

        <p>To get started, why not explore our popular services?</p>
        <a href="${categoriesUrl}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #ffffff; background-color: #45A0A2; text-decoration: none; border-radius: 5px;">Explore Services</a>

        <p>If you have any questions, feel free to contact our support team.</p>

        <p>Thanks,<br>The FixBro Team</p>
      `;

    if (!canAttemptRealEmail) {
      console.warn("SMTP configuration incomplete. Simulating welcome email.");
      console.log(`\n--- SIMULATING Welcome Email ---`);
      console.log(`To: ${userEmail}`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Body:\n${emailBody}`);
      return { success: false, message: "SMTP config incomplete. Email simulated." };
    }

    const portNumber = parseInt(smtpPort!, 10);
    if (isNaN(portNumber)) {
        return { success: false, message: "Invalid SMTP port." };
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
    });
    
    try {
      await transporter.sendMail({
        from: `FixBro <${senderEmail}>`,
        to: userEmail,
        subject: emailSubject,
        html: emailBody, // Using html property directly
      });
      return { success: true, message: "Welcome email sent successfully." };
    } catch (error: any) {
      console.error("Error sending welcome email:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}.` };
    }
  }
);
