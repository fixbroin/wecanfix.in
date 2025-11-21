
'use server';
/**
 * @fileOverview A Genkit flow to send a booking cancellation email when a user cancels.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config';

const UserCancellationEmailInputSchema = z.object({
  bookingId: z.string().describe("The unique ID of the booking."),
  customerName: z.string().describe("The name of the customer."),
  customerEmail: z.string().email().describe("The email address of the customer."),
  paymentMethod: z.string().describe("The payment method chosen by the customer."),
  paidAmount: z.number().optional().describe("Amount paid by user before cancellation."),
  cancellationFee: z.number().optional().describe("Cancellation fee charged."),
  refundableAmount: z.number().optional().describe("Calculated refundable amount."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
  siteName: z.string().optional().default("Wecanfix"),
  logoUrl: z.string().url().optional(),
});

export type UserCancellationEmailInput = z.infer<typeof UserCancellationEmailInputSchema>;

export async function sendUserCancellationEmail(input: UserCancellationEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await userCancellationEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("sendUserCancellationEmail: Error calling flow:", error);
    return { success: false, message: `Failed to process user cancellation email flow: ${errorMessage}` };
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
        .summary { border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin-top: 20px; background-color: #f9f9f9; }
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

const userCancellationEmailFlow = ai.defineFlow(
  {
    name: 'userCancellationEmailFlow',
    inputSchema: UserCancellationEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (bookingDetails) => {
    try {
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, siteName = "Wecanfix", logoUrl,
        customerName, customerEmail, bookingId,
        paymentMethod, paidAmount, cancellationFee, refundableAmount,
      } = bookingDetails;
      
      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;
      
      let paymentInfoHtml = '';
      if (paymentMethod === 'Online' && paidAmount !== undefined && cancellationFee !== undefined && refundableAmount !== undefined) {
          paymentInfoHtml = `
            <div class="summary">
              <h3>Refund Details</h3>
              <p>You paid: ₹${paidAmount.toFixed(2)}</p>
              <p>Cancellation fee: ₹${cancellationFee.toFixed(2)}</p>
              <p><strong>Refundable amount: ₹${refundableAmount.toFixed(2)}</strong></p>
              <p>Your refund will be processed within 7 working days to your original payment method.</p>
            </div>
          `;
      } else if (paymentMethod !== 'Online' && cancellationFee !== undefined && cancellationFee > 0) {
          paymentInfoHtml = `
            <div class="summary">
              <h3>Pending Balance</h3>
              <p>Since you chose "${paymentMethod}", you now have a pending balance of <strong>₹${cancellationFee.toFixed(2)}</strong> for the cancellation fee. This balance may be added to your next booking.</p>
            </div>
          `;
      }

      const customerEmailSubject = `Booking Cancellation Confirmation #${bookingId}`;
      const customerBodyContent = `
          <p>Dear ${customerName},</p>
          <p>Your booking #${bookingId} has been cancelled as per your request.</p>
          <p>If you have any questions, please contact our support team.</p>
          ${paymentInfoHtml}
          <p>Regards,<br>The ${siteName} Team</p>
      `;
      const customerEmailBody = createHtmlTemplate("Booking Cancelled", customerBodyContent, siteName, logoUrl);
      
      const adminEmailSubject = `Booking Cancelled by User (ID: ${bookingId})`;
      const adminBodyContent = `<p>Booking ID <strong>${bookingId}</strong> for <strong>${customerName}</strong> was cancelled by the user.</p><p>The user has been notified with the relevant payment/refund details.</p>`;
      const adminEmailBody = createHtmlTemplate("Admin Alert: User Cancellation", adminBodyContent, siteName, logoUrl);
      const adminEmail = "wecanfix.in@gmail.com"; 

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating cancellation emails.");
        return { success: false, message: "SMTP configuration incomplete. Emails simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({ from: `${siteName} <${senderEmail}>`, to: customerEmail, subject: customerEmailSubject, html: customerEmailBody });
      await transporter.sendMail({ from: `${siteName} Admin <${senderEmail}>`, to: adminEmail, subject: adminEmailSubject, html: adminEmailBody });
      
      return { success: true, message: "User cancellation emails sent successfully." };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("CRITICAL ERROR in userCancellationEmailFlow:", error);
      return { success: false, message: `Critical error in flow: ${errorMessage}` };
    }
  }
);

    
