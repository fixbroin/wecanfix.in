
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
  siteName: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

export type ProviderBookingAssignmentEmailInput = z.infer<typeof ProviderBookingAssignmentEmailInputSchema>;

export async function sendProviderBookingAssignmentEmail(input: ProviderBookingAssignmentEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await providerBookingAssignmentEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process provider assignment email flow: ${errorMessage}` };
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
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #0B5ED7;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
        }
        .summary-box { border: 1px solid #e0e0e0; padding: 15px; border-radius: 8px; margin-top: 15px; }
        ul { list-style-type: none; padding: 0; }
        li { margin-bottom: 8px; }
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


const providerBookingAssignmentEmailFlow = ai.defineFlow(
  {
    name: 'providerBookingAssignmentEmailFlow',
    inputSchema: ProviderBookingAssignmentEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        providerName, providerEmail, bookingId, bookingDocId, serviceName,
        scheduledDate, scheduledTimeSlot, customerName, customerAddress,
        siteName = "Wecanfix", logoUrl,
      } = details;

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;
      const appBaseUrl = getBaseUrl();
      const jobDetailsUrl = `${appBaseUrl}/provider/booking/${bookingDocId}`;

      const emailSubject = `New Job Assignment: Booking ID ${bookingId}`;
      const emailBodyContent = `
        <p>Dear ${providerName},</p>
        <p>You have been assigned a new job on ${siteName}:</p>
        <div class="summary-box">
            <h3>Booking Details:</h3>
            <ul>
                <li><strong>Booking ID:</strong> ${bookingId}</li>
                <li><strong>Service:</strong> ${serviceName}</li>
                <li><strong>Scheduled Date:</strong> ${scheduledDate}</li>
                <li><strong>Time Slot:</strong> ${scheduledTimeSlot}</li>
                <li><strong>Customer:</strong> ${customerName}</li>
                <li><strong>Address:</strong> ${customerAddress}</li>
            </ul>
        </div>
        <p>Please review the job details and prepare accordingly.</p>
        <p><a href="${jobDetailsUrl}" class="button">View Full Job Details</a></p>
        <p>Thank you,</p>
        <p>The ${siteName} Team</p>
      `;

      const htmlBody = createHtmlTemplate("New Job Assignment", emailBodyContent, siteName, logoUrl);

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating provider assignment email.");
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
        from: `${siteName} Operations <${senderEmail}>`, to: providerEmail, subject: emailSubject, html: htmlBody,
      });
      
      return { success: true, message: "Provider assignment email sent successfully." };

    } catch (error: any) {
      console.error("Error in providerBookingAssignmentEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown error'}.` };
    }
  }
);

    
