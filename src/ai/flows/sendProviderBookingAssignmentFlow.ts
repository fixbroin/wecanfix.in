
'use server';
/**
 * @fileOverview A Genkit flow to send an email notification to a provider
 * when a new booking is assigned to them.
 *
 * - sendProviderBookingAssignmentEmail - Sends an email to the provider.
 * - ProviderBookingAssignmentEmailInput - The input type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config'; // For constructing URLs

const ProviderBookingAssignmentEmailInputSchema = z.object({
  providerName: z.string().describe("The name of the provider."),
  providerEmail: z.string().email().describe("The email of the provider."),
  bookingId: z.string().describe("The human-readable ID of the booking."),
  bookingDocId: z.string().describe("The Firestore document ID of the booking."),
  serviceName: z.string().describe("The primary service name of the booking."),
  scheduledDate: z.string().describe("The scheduled date of the booking (user-friendly format)."),
  scheduledTimeSlot: z.string().describe("The scheduled time slot of the booking."),
  customerName: z.string().describe("The name of the customer."),
  customerAddress: z.string().describe("The formatted address of the customer for the service."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
});

export type ProviderBookingAssignmentEmailInput = z.infer<typeof ProviderBookingAssignmentEmailInputSchema>;

export async function sendProviderBookingAssignmentEmail(input: ProviderBookingAssignmentEmailInput): Promise<{ success: boolean; message: string }> {
  console.log("sendProviderBookingAssignmentEmail: Flow invoked with input (passwords omitted):", {
    ...input,
    smtpPass: input.smtpPass ? '******' : undefined,
  });
  try {
    const result = await providerBookingAssignmentEmailFlow(input);
    console.log("sendProviderBookingAssignmentEmail: Flow result:", result);
    return result;
  } catch (error) {
    console.error("sendProviderBookingAssignmentEmail: Error calling flow:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process provider assignment email flow: ${errorMessage}` };
  }
}

const providerBookingAssignmentEmailFlow = ai.defineFlow(
  {
    name: 'providerBookingAssignmentEmailFlow',
    inputSchema: ProviderBookingAssignmentEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      console.log("====== PROVIDER BOOKING ASSIGNMENT EMAIL FLOW START ======");
      console.log("Flow input (password omitted):", { ...details, smtpPass: details.smtpPass ? '******' : undefined });

      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        providerName, providerEmail, bookingId, bookingDocId, serviceName,
        scheduledDate, scheduledTimeSlot, customerName, customerAddress
      } = details;

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;
      const appBaseUrl = getBaseUrl();
      const jobDetailsUrl = `${appBaseUrl}/provider/booking/${bookingDocId}`;

      const emailSubject = `New Job Assignment: Booking ID ${bookingId}`;
      const emailBody = `
        Dear ${providerName},

        You have been assigned a new job on FixBro:

        Booking Details:
        --------------------
        Booking ID: ${bookingId}
        Service: ${serviceName}
        Scheduled Date: ${scheduledDate}
        Scheduled Time: ${scheduledTimeSlot}
        Customer: ${customerName}
        Address: ${customerAddress}

        Please review the job details and prepare accordingly. You can view the full details here:
        ${jobDetailsUrl}

        Thank you,
        The FixBro Team
      `;

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating provider assignment email.");
        console.log(`\n--- SIMULATING Provider Assignment Email ---`);
        console.log(`To: ${providerEmail}`);
        console.log(`Subject: ${emailSubject}`);
        console.log(`Body:\n${emailBody}`);
        console.log("====== PROVIDER BOOKING ASSIGNMENT EMAIL FLOW END (SIMULATED) ======");
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
      
      console.log(`Attempting to send provider assignment email to: ${providerEmail}`);
      await transporter.sendMail({
        from: `FixBro Operations <${senderEmail}>`, to: providerEmail, subject: emailSubject, html: emailBody.replace(/\\n/g, '<br/>'),
      });
      console.log("Provider assignment email sent.");
      console.log("====== PROVIDER BOOKING ASSIGNMENT EMAIL FLOW END (SUCCESS) ======");
      return { success: true, message: "Provider assignment email sent successfully." };

    } catch (error: any) {
      console.error("Error in providerBookingAssignmentEmailFlow:", error);
      // Fallback log if real email fails
        console.log(`\n--- FAILED REAL EMAIL - SIMULATING Provider Assignment Email (Fallback) ---`);
        console.log(`To: ${details.providerEmail}`);
        console.log(`Subject: New Job Assignment: Booking ID ${details.bookingId}`);
        // Simplified body for fallback log to avoid re-calculating jobDetailsUrl if error happened before it
        console.log(`Body:\nDear ${details.providerName}, you have a new job: ${details.serviceName} on ${details.scheduledDate} for ${details.customerName}.`);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}. Email logged as fallback.` };
    }
  }
);

    